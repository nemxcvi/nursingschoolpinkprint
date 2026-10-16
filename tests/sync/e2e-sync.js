/* Two-device sync test (phase 4). Start servers.mjs first, then: node tests/sync/e2e-sync.js
   Covers: guests make no calls, start tracking, encrypted saves, linking by typed code and QR,
   offline changes and conflicts, nickname claims and switching, wrong codes, and Delete my data
   clearing every device. Run against a fresh database (truncate vault and claims first). */
const {chromium} = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const {Client} = require("pg");
const fs = require("fs");
const BASE = "http://localhost:8790/";
const QUIZ = BASE + "unit-3-skin-wounds-diagnostics/safety-quiz.html";
const LOG = require("path").join(require("os").tmpdir(), "pinkprint-rpc-log.jsonl");
let failures = 0;
const check = (ok, label, extra) => { console.log((ok ? "ok   " : "FAIL ") + label + (extra !== undefined ? "  [" + extra + "]" : "")); if (!ok) failures++; };

(async () => {
  const db = new Client({host: "127.0.0.1", port: 54329, user: "postgres", database: "pp"});
  await db.connect();
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const b = await chromium.launch();
  const errors = [];
  const device = async (name) => {
    const c = await b.newContext({viewport: {width: 1000, height: 900}});
    await c.route(/jsdelivr|googleapis|gstatic/, r => r.abort());
    c.on("page", pg => {
      pg.on("pageerror", e => errors.push(name + ": " + e.message));
      pg.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(name + ": " + m.text()); });
    });
    c.apiCalls = [];
    c.on("request", r => { if (r.url().includes("/api/")) c.apiCalls.push(r.url().replace(BASE, "/")); });
    return c;
  };
  const open = async (c, url) => { const pg = await c.newPage(); await pg.goto(url); await pg.waitForTimeout(300); return pg; };
  const vault = () => q("select lookup_hash, data, version from public.vault");
  const waitFor = async (fn, ms = 15000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 200)); } return v; };
  const store = pg => pg.evaluate(() => ({t: JSON.parse(localStorage.getItem("pinkprint-tracking") || "null"), p: JSON.parse(localStorage.getItem("pinkprint-progress") || "{}")}));
  const synced = pg => waitFor(async () => { const s = await store(pg); return s.t && s.t.sync && s.t.sync.version > 0 && !s.t.sync.dirty; });

  // ---- Guests make no calls at all ----
  const G = await device("guest");
  let pg = await open(G, BASE);
  await open(G, QUIZ);
  check(G.apiCalls.length === 0, "guests: no /api calls", G.apiCalls.join(","));

  // ---- Device A starts tracking ----
  const A = await device("A");
  pg = await open(A, BASE + "start-tracking.html?from=home");
  await pg.waitForSelector("#st-qr svg");
  const code = await pg.textContent("#st-code");
  const nickA = await pg.textContent("#st-nick");
  await pg.click("#st-start");
  await pg.waitForURL(BASE);
  await synced(pg);
  let rows = await vault();
  check(rows.length === 1 && rows[0].version === 1, "start: one saved copy made", rows.length);
  check(/^v1\./.test(rows[0].data) && !rows[0].data.includes(nickA) && !rows[0].data.includes(code.split(" ")[0]), "saved copy is scrambled text only");
  check(!rows.some(r => r.lookup_hash.includes(code.split(" ")[0])), "row key isn't the code");
  let claims = await q("select nickname, ticket_hash from public.nickname_claims where ticket_hash is not null");
  check(claims.length === 1 && claims[0].nickname === nickA && /^[0-9a-f]{64}$/.test(claims[0].ticket_hash), "nickname claimed with a hashed ticket", JSON.stringify(claims.map(c => c.nickname)));

  // A answers 3 questions, bookmarks and adds a note
  pg = await open(A, QUIZ);
  await pg.click("#pq-start");
  await pg.click("#pq-bookmark");
  await pg.keyboard.press("a"); await pg.click("#pq-check-sure");
  await pg.click("#pq-add-note"); await pg.fill("#pq-note-input", "RACE: rescue first"); await pg.click("#pq-note-save");
  for (let i = 0; i < 2; i++) { await pg.click("#pq-next"); await pg.keyboard.press("a"); await pg.click("#pq-check-guess"); }
  await synced(pg);
  const sA = await store(pg);
  rows = await vault();
  check(Object.keys(sA.p).length === 3 && rows[0].version >= 2, "A's answers saved", "questions " + Object.keys(sA.p).length + ", version " + rows[0].version);
  check(!rows[0].data.includes("RACE"), "notes are encrypted too");

  // ---- Device B links with the typed code ----
  const B = await device("B");
  pg = await open(B, BASE + "link.html");
  await pg.fill("#lk-code", "  " + code.toUpperCase().replace(/ /g, "  ") + " ");
  await pg.click("#lk-go");
  await pg.waitForURL(BASE);
  let sB = await store(pg);
  check(sB.t && sB.t.code === code && sB.t.nickname === nickA, "B linked: same code and nickname", sB.t && sB.t.nickname);
  check(Object.keys(sB.p).length === 3 && Object.values(sB.p).some(r => r.note === "RACE: rescue first" && r.bookmarked), "B has A's answers, bookmark and note");
  check(sB.t.goal && sB.t.goal.value === 50, "B has A's settings");

  // B answers a new question while A is offline and answers another
  const pa = await open(A, QUIZ);
  await synced(pa);
  await A.setOffline(true);
  await pa.click("#pq-start"); await pa.keyboard.press("b"); await pa.click("#pq-check-sure");
  await pa.waitForTimeout(2500);   /* the save attempt fails while offline */
  const offlineA = await store(pa);
  check(offlineA.t.sync.dirty === true, "A offline: change waits to be saved");
  const pb = await open(B, QUIZ);
  await pb.click("#pq-start"); await pb.keyboard.press("b"); await pb.click("#pq-check-sure");
  await pb.click("#pq-next"); await pb.keyboard.press("c"); await pb.click("#pq-check-sure");
  await synced(pb);
  await A.setOffline(false);
  await pa.evaluate(() => Tracking.sync());
  await synced(pa);
  await pb.evaluate(() => Tracking.sync());
  const fa = await store(pa), fb = await store(pb);
  const idsA = Object.keys(fa.p).sort(), idsB = Object.keys(fb.p).sort();
  check(JSON.stringify(idsA) === JSON.stringify(idsB), "both devices end up with the same questions", idsA.length + " vs " + idsB.length);
  check(idsA.length >= 5, "nobody's answers were lost in the conflict", idsA.length);

  // ---- Settings: switch nickname on B; A sees it; old name freed ----
  pg = await open(B, BASE + "settings.html");
  await pg.click("#se-switch");
  await pg.waitForSelector("#se-nickedit:not(.hidden)");
  const options = await pg.$$eval("#se-nickselect option", o => o.map(x => x.value));
  check(!options.includes("Miss Pinkprint"), "owner name never offered");
  const newName = options.find(n => n !== nickA);
  await pg.selectOption("#se-nickselect", newName);
  await pg.click("#se-nicksave");
  await pg.waitForFunction(n => document.getElementById("se-nick").textContent === n, newName);
  await synced(pg);
  claims = await q("select nickname from public.nickname_claims where ticket_hash is not null");
  check(claims.length === 1 && claims[0].nickname === newName, "switch: new name claimed, old one freed", claims.map(c => c.nickname).join(","));
  pg = await open(A, BASE + "settings.html");
  await pg.waitForFunction(n => document.getElementById("se-nick").textContent === n, newName, {timeout: 15000}).catch(() => {});
  check((await pg.textContent("#se-nick")) === newName, "A picks up the new nickname");

  // ---- A third person can't be offered a taken name ----
  const C = await device("C");
  let pc = await open(C, BASE + "start-tracking.html?from=home");
  await pc.waitForSelector("#st-qr svg");
  let offeredTaken = false;
  for (let i = 0; i < 60; i++) { if ((await pc.textContent("#st-nick")) === newName) offeredTaken = true; await pc.click("#st-reroll"); }
  check(!offeredTaken, "taken nicknames are never offered");
  // Race: someone claims C's name a moment before C presses Start
  const cName = await pc.textContent("#st-nick");
  await q("insert into public.nickname_claims (nickname, ticket_hash) values ($1, repeat('b', 64))", [cName]);
  await pc.click("#st-start");
  await pc.waitForSelector("#st-msg:not(.hidden)");
  check(/was just taken/.test(await pc.textContent("#st-msg")) && (await pc.textContent("#st-nick")) !== cName, "name taken a moment ago: another name offered");
  await q("delete from public.nickname_claims where nickname = $1", [cName]);

  // ---- QR link: the code arrives in the # part and is cleared from the address bar ----
  const D = await device("D");
  pg = await open(D, BASE + "link.html#code=" + code.replace(/ /g, "-"));
  check((await pg.inputValue("#lk-code")) === code && !pg.url().includes("#"), "QR link fills the code and clears it from the address bar");
  await pg.click("#lk-go"); await pg.waitForURL(BASE);
  check((await store(pg)).t.code === code, "QR-linked device works");

  // ---- Wrong code ----
  const E = await device("E");
  pg = await open(E, BASE + "link.html");
  await pg.fill("#lk-code", "flashcard pulse coffee 0000");
  await pg.click("#lk-go");
  await pg.waitForFunction(() => /No saved progress|doesn't look/.test(document.getElementById("lk-msg").textContent));
  check((await store(pg)).t === null, "wrong code: nothing saved, clear message", await pg.textContent("#lk-msg"));

  // ---- Delete my data on B removes the copy, frees the name, and the other devices clear ----
  pg = await open(B, BASE + "settings.html");
  pg.once("dialog", d => d.accept());
  await pg.click("#se-delete");
  await pg.waitForURL(BASE);
  rows = await vault();
  claims = await q("select nickname from public.nickname_claims where ticket_hash is not null");
  check(rows.length === 0 && claims.length === 0, "delete: saved copy removed and nickname freed", rows.length + "/" + claims.length);
  check((await pg.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("pinkprint")))).length === 0, "delete: this device cleared");
  pg = await open(A, BASE);
  await waitFor(async () => (await store(pg)).t === null, 15000);
  check((await store(pg)).t === null, "another linked device clears itself on its next sync");

  // ---- The code itself never reached the server ----
  const log = fs.readFileSync(LOG, "utf8");
  const norm = code.replace(/ /g, "");
  check(!log.includes(code) && !log.includes(norm) && !log.includes(code.replace(/ /g, "-")), "the code was never sent to storage");
  check(!/RACE/.test(log), "no readable notes ever sent");

  check(errors.length === 0, "no page errors", errors.join(" | "));
  console.log(failures ? failures + " FAILED" : "all sync checks passed");
  await b.close(); await db.end();
  process.exit(failures ? 1 : 0);
})();
