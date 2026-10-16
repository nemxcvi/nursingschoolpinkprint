/* Challenges and the class tally (phase 6) in a real browser. Start servers.mjs first, then:
   node tests/sync/e2e-challenges.js [screenshot folder]
   Student A makes a challenge from a topic quiz; a guest opens the link, starts tracking, takes
   it and sees the scores; A sees them too and deletes it. Also checks nicknames can't be borrowed,
   the tally gets only question IDs and right/wrong, and the Challenges switch in Settings. */
const {chromium} = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const {Client} = require("pg");
const fs = require("fs");
const BASE = "http://localhost:8790/";
const QUIZ = BASE + "unit-3-skin-wounds-diagnostics/safety-quiz.html";
const LOG = require("path").join(require("os").tmpdir(), "pinkprint-rpc-log.jsonl");
const OUT = process.argv[2] || require("os").tmpdir();
let failures = 0;
const check = (ok, label, extra) => { console.log((ok ? "ok   " : "FAIL ") + label + (extra !== undefined ? "  [" + extra + "]" : "")); if (!ok) failures++; };

(async () => {
  const db = new Client({host: "127.0.0.1", port: 54329, user: "postgres", database: "pp"});
  await db.connect();
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  /* Start from an empty database (keeps the owner's reserved nickname) */
  await q("delete from public.challenges; delete from public.class_tally; delete from public.vault; delete from public.nickname_claims where ticket_hash is not null");
  const b = await chromium.launch();
  const errors = [];
  const device = async (name) => {
    const c = await b.newContext({viewport: {width: 1200, height: 1000}});
    await c.route(/jsdelivr|googleapis|gstatic/, r => r.abort());
    c.on("page", pg => {
      pg.on("pageerror", e => errors.push(name + ": " + e.message));
      pg.on("console", m => { if (m.type() === "error" && !/Failed to load resource|status of 4\d\d/.test(m.text())) errors.push(name + ": " + m.text()); });
      pg.on("dialog", d => d.accept());
    });
    return c;
  };
  const waitFor = async (fn, ms = 15000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 200)); } return v; };
  const state = pg => pg.evaluate(() => JSON.parse(localStorage.getItem("pinkprint-tracking") || "null"));
  const text = (pg, sel) => pg.textContent(sel).then(t => t.replace(/\s+/g, " ").trim()).catch(() => "");
  const startTracking = async pg => {
    await pg.waitForSelector("#st-qr svg");
    await pg.click("#st-start");
  };
  const tally = async () => (await q("select coalesce(sum(times_answered), 0)::int n from public.class_tally"))[0].n;

  // ---- A starts tracking and makes a challenge from a topic quiz ----
  const A = await device("A");
  let pa = await A.newPage();
  await pa.goto(BASE + "start-tracking.html?from=home");
  await startTracking(pa);
  await pa.waitForURL(BASE);
  const nickA = (await state(pa)).nickname;
  await pa.goto(QUIZ);
  const ch = await pa.waitForSelector("#pq-challenge");
  check(/challenges\.html\?unit=3&topic=safety$/.test(await ch.getAttribute("href")), "topic quiz: Challenge a friend link", await ch.getAttribute("href"));
  await ch.click();
  await pa.waitForSelector(".ch-new");
  check(await pa.$eval("#ch-unit", s => s.value) === "3" && await pa.$eval("#ch-topic", s => s.value) === "safety", "new challenge: unit and topic picked from the quiz");
  check(await pa.isVisible(".ch-empty"), "no challenges yet");
  await pa.click('.ch-counts button[data-n="10"]');
  await pa.click(".ch-create");
  await pa.waitForSelector(".ch-ready:not(.hidden)");
  const url = await pa.$eval(".ch-link", i => i.value);
  const id = (url.match(/\/c\/([2-9A-HJ-NP-Z]{4})$/) || [])[1];
  check(!!id, "link ready with a 4-character code", url);
  check(/Ready · Safety · 10 questions/.test(await text(pa, ".ch-ready-label")), "ready label", await text(pa, ".ch-ready-label"));
  check(await text(pa, ".ch-bigcode") === id, "short code shown in big letters", await text(pa, ".ch-bigcode"));
  let rows = await q("select id, title, creator_name, questions, creator_hash from public.challenges");
  check(rows.length === 1 && rows[0].id === id && rows[0].creator_name === nickA && rows[0].title === "Safety", "saved: title and sender's nickname", JSON.stringify(rows.map(r => [r.id, r.title, r.creator_name])));
  check(rows[0].questions.length === 10 && rows[0].questions.every(x => /^nur114-u3-safety-\d{3}$/.test(x)) && new Set(rows[0].questions).size === 10, "10 different Safety questions drawn before anyone takes it");
  await pa.waitForSelector(`#c-${id} .ch-head`);
  const cardA = await text(pa, `#c-${id}`);
  check(/Sent by you/.test(cardA) && /0 of 10 joined/.test(cardA) && /Nobody has taken it yet/.test(cardA), "A's card: sent by you, nobody yet", cardA.slice(0, 120));
  const sa = await state(pa);
  const entryA = (sa.challenges || []).find(c => c.id === id);
  check(entryA && entryA.mine && /^[0-9a-f]{64}$/.test(entryA.ticket) && rows[0].creator_hash !== entryA.ticket, "ticket saved with A's progress; the server keeps only its hash");
  await waitFor(async () => { const s = await state(pa); return s.sync && !s.sync.dirty; });
  const vaultData = (await q("select data from public.vault")).map(r => r.data).join(" ");
  check(vaultData.length > 0 && !vaultData.includes(id) && !vaultData.includes(entryA.ticket), "the saved copy is encrypted (no challenge ID or ticket in it)");
  await pa.screenshot({path: OUT + "/ch-created.png", fullPage: true});

  // ---- A guest opens the link ----
  const B = await device("B");
  let pb = await B.newPage();
  await pb.goto(url.replace(/^https?:\/\/[^/]+\//, BASE));
  await pb.waitForSelector(".ch-guest");
  check(/challenges\.html\?join=/.test(pb.url()), "short link opens the Challenges page", pb.url().replace(BASE, "/"));
  check(/A friend sent you a challenge/.test(await text(pb, ".ch-guest")) && await state(pb) === null, "guest: asked to start tracking, nothing saved");
  await pb.screenshot({path: OUT + "/ch-guest.png", fullPage: true});
  await pb.click(".ch-start");
  await startTracking(pb);
  await pb.waitForURL(/challenges\.html/);
  await pb.waitForSelector(`#c-${id} .ch-head`);
  const nickB = (await state(pb)).nickname;
  const cardB = await text(pb, `#c-${id}`);
  check(new RegExp("From " + nickA).test(cardB) && /Scores show after you finish/.test(cardB) && /Take challenge/.test(cardB), "B after starting tracking: From " + nickA + ", take challenge", cardB.slice(0, 140));
  check(await pb.$eval(`#c-${id}`, e => e.classList.contains("is-new")), "the challenge from the link is highlighted");

  // Nicknames can't be borrowed
  const borrow = await pb.evaluate(async ([id, nick]) => {
    const r = await fetch("api/challenges/join", {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({id, ticket: Tracking.randomHex(32), nickname: nick, proof: Tracking.nicknameProof()})});
    return r.status + " " + (await r.json()).error;
  }, [id, nickA]);
  check(/^400 not your nickname/.test(borrow), "joining under someone else's nickname is refused", borrow);
  const owner = await pb.evaluate(async id => {
    const r = await fetch("api/challenges/join", {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({id, ticket: Tracking.randomHex(32), nickname: "Miss Pinkprint", proof: "a guess"})});
    return r.status + " " + (await r.json()).error;
  }, id);
  check(/^400 not your nickname/.test(owner), "and so is Miss Pinkprint without the owner phrase", owner);

  // ---- B takes it ----
  const tallyBefore = await tally();
  await pb.click(`#c-${id} .ch-take`);
  await pb.waitForSelector(".ss-share");
  check(/studying together/.test(await text(pb, ".ss-share")) && /never who missed what/.test(await text(pb, ".ss-share")) && !(await pb.isVisible("#pq-quiz-screen")),
    "before starting: told answers are combined for Group focus");
  await pb.click("#ss-start");
  await pb.waitForSelector("#pq-quiz-screen:not(.hidden)");
  check(/Challenge: Safety/.test(await text(pb, "#ss-title")) && /of 10/.test(await text(pb, "#pq-progress")), "session: the challenge's 10 questions", await text(pb, "#pq-progress"));
  const shown = [];
  for (let i = 0; i < 3; i++) {
    if (i) await pb.click("#pq-next");
    await pb.keyboard.press("a");
    await pb.click("#pq-check-sure");
  }
  const sessionIds = await pb.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("pinkprint-progress") || "{}")));
  check(sessionIds.length === 3 && sessionIds.every(x => rows[0].questions.includes(x)), "challenge answers count toward B's own progress", sessionIds.length);
  await pb.click("#pq-end-test");
  await pb.waitForFunction(() => /Challenge score saved/.test((document.getElementById("ss-challenge") || {}).textContent || ""));
  const saved = await text(pb, "#ss-challenge");
  const score = +(saved.match(/saved: (\d+)\/10/) || [])[1];
  let players = await q("select nickname, score, total, finished_at is not null finished, ticket_hash from public.challenge_players");
  check(players.length === 1 && players[0].nickname === nickB && players[0].score === score && players[0].total === 10 && players[0].finished, "score saved under B's nickname", saved);
  await pb.screenshot({path: OUT + "/ch-session-results.png", fullPage: true});

  // Practicing again doesn't change the score
  await pb.click("#end-restart");
  await pb.waitForSelector("#pq-quiz-screen:not(.hidden)");
  await pb.click("#pq-end-test");
  await pb.waitForSelector("#ss-challenge");
  check(/first score is the one that counts/.test(await text(pb, "#ss-challenge")) && (await q("select score from public.challenge_players"))[0].score === score, "practice again: the first score stays");

  // Tally: only question IDs and right/wrong
  const tallyAfter = await waitFor(async () => { const n = await tally(); return n >= tallyBefore + 3 ? n : 0; });
  check(tallyAfter >= tallyBefore + 3, "class tally counted B's answers", tallyBefore + " -> " + tallyAfter);
  const tallyBodies = fs.readFileSync(LOG, "utf8").trim().split("\n").map(l => JSON.parse(l)).filter(r => /increment_tally/.test(r.url)).map(r => JSON.parse(r.body));
  check(tallyBodies.length > 0 && tallyBodies.every(bd => Object.keys(bd).join() === "p_answers" && bd.p_answers.every(a => Object.keys(a).sort().join() === "ok,q")), "tally requests hold only question IDs and right/wrong", JSON.stringify(tallyBodies[0]).slice(0, 90));

  // B compares
  await pb.click("#ss-challenge a");
  await pb.waitForSelector(`#c-${id} .ch-scores`);
  const rowsText = (pg, sel) => pg.$$eval(sel + " li", ls => ls.map(l => Array.from(l.children).map(c => c.textContent.trim()).join(" ")).join(" | "));
  const board = await rowsText(pb, `#c-${id} .ch-scores`);
  check(new RegExp(nickB + " \\(you\\) " + score + "/10 " + score * 10 + "%").test(board), "B sees the scoreboard after finishing (score and percent)", board);
  check(await pb.$(`.ch-done #c-${id}`) !== null, "B's finished challenge moves under Finished");
  check(!(await pb.isVisible(`#c-${id} .ch-take`)), "no Take challenge button once finished");

  // ---- A sees B's score and that they joined ----
  await pa.goto(BASE + "challenges.html");
  await pa.waitForSelector(`#c-${id} .ch-scores`);
  const cardA2 = await text(pa, `#c-${id}`), boardA = await rowsText(pa, `#c-${id} .ch-scores`);
  check(/1 of 10 joined/.test(cardA2) && boardA === nickB + " " + score + "/10 " + score * 10 + "%" && /Take challenge/.test(cardA2), "A sees B's score and can still take it", boardA);
  await pa.screenshot({path: OUT + "/ch-scores.png", fullPage: true});

  // ---- Joining with a short code ----
  check(!(await pa.isVisible("#ch-code")), "join box starts closed under Create challenge");
  await pa.click(".ch-jointoggle");
  await pa.fill("#ch-code", "not a code");
  await pa.click(".ch-joinform button");
  check(/doesn't look like a challenge code/.test(await text(pa, ".ch-joinmsg")), "a bad code says what a code looks like");
  const C = await device("C");
  const pc = await C.newPage();
  await pc.goto(BASE + "challenges.html");
  await pc.waitForSelector(".ch-guest .ch-start");
  await pc.fill("#ch-code", " " + (id.slice(0, 2) + " " + id.slice(2)).toLowerCase() + " ");
  await pc.click(".ch-joinform button");
  await startTracking(pc);
  await pc.waitForURL(/challenges\.html/);
  await pc.waitForSelector(`#c-${id} .ch-head`);
  check(new RegExp("From " + nickA).test(await text(pc, `#c-${id}`)), "guest typed the code (lowercase, with a space), started tracking and got the challenge");
  const pc2 = await (await device("C2")).newPage();
  await pc2.goto(BASE + "start-tracking.html?from=home");
  await startTracking(pc2);
  await pc2.waitForURL(BASE);
  await pc2.goto(BASE + "challenges.html");
  await pc2.waitForSelector(".ch-jointoggle");
  await pc2.click(".ch-jointoggle");
  await pc2.fill("#ch-code", url);
  await pc2.click(".ch-joinform button");
  await pc2.waitForSelector(`#c-${id} .ch-head`);
  check(await pc2.$eval(`#c-${id}`, e => e.classList.contains("is-new")) && /Take challenge/.test(await text(pc2, `#c-${id}`)), "tracked student pasted the whole link into the code box");
  check(await text(pc2, `#c-${id} .ch-cardcode`) === id, "each card shows its code");
  await pc2.screenshot({path: OUT + "/ch-joined-by-code.png", fullPage: true});

  // ---- Group focus: everyone who finishes counts; shows to finishers once 2 have ----
  const takeAndEnd = async pg => {
    await pg.click(`#c-${id} .ch-take`);
    await pg.waitForSelector(".ss-share");
    await pg.click("#ss-start");
    await pg.waitForSelector("#pq-quiz-screen:not(.hidden)");
    await pg.keyboard.press("a");
    await pg.click("#pq-check-sure");
    await pg.click("#pq-end-test");
    await pg.waitForFunction(() => /Challenge score saved/.test((document.getElementById("ss-challenge") || {}).textContent || ""));
  };
  await pb.goto(BASE + "challenges.html");
  await pb.waitForSelector(`#c-${id} .ch-fsummary`);
  check(/opens once someone else finishes/.test(await text(pb, `#c-${id} .ch-fsummary`)) && !(await pb.$(`#c-${id} .ch-seefocus`)), "one finished: waiting for another");
  await pc2.goto(BASE + "challenges.html");
  await pc2.waitForSelector(`#c-${id} .ch-take`);
  await takeAndEnd(pc2);
  await pa.goto(BASE + "challenges.html");
  await pa.waitForSelector(`#c-${id} .ch-take`);
  await takeAndEnd(pa);
  const ans = await q("select ticket_hash, count(*)::int n, count(*) filter (where correct)::int ok from public.challenge_answers group by ticket_hash");
  const scores = await q("select ticket_hash, score from public.challenge_players where finished_at is not null");
  check(ans.length === 3 && ans.every(a => a.n === 10) && ans.every(a => scores.find(s => s.ticket_hash === a.ticket_hash).score === a.ok),
    "3 players' right/wrong saved (10 each); each score is the number right", JSON.stringify(ans.map(a => a.ok)));
  await pa.goto(BASE + "challenges.html");
  await pa.waitForSelector(`.ch-done #c-${id} .ch-seefocus`);
  const summary = await text(pa, `#c-${id} .ch-fsummary`);
  check(/3 finished/.test(summary) && /Weakest: Safety/.test(summary) && !(await pa.$(`#c-${id} .ch-ftopics`)), "card shows a one-line summary; details on their own page", summary);
  await pa.click(`#c-${id} .ch-seefocus`);
  await pa.waitForSelector(".ch-ftopics");
  check(/challenges\.html\?focus=/.test(pa.url()), "Group focus opens its own page", pa.url().replace(BASE, "/"));
  const sharedIds = (await q("select distinct question_id from public.challenge_answers where not correct")).length;
  const focus = await text(pa, "#ms-main");
  check(/Group focus/.test(focus) && /From the 3 people who finished/.test(focus) && /Topics, weakest first/.test(focus) && /Safety/.test(focus), "page: topics weakest first", focus.slice(0, 140));
  check(!new RegExp(nickB + "|" + nickA).test(focus), "Group focus names nobody");
  const missedIds = sharedIds;
  const missedRows = await pa.$$eval(".ch-fmissed li", l => l.map(x => x.textContent));
  check(missedRows.length === Math.min(10, missedIds) && missedRows.every(r => /Missed by [1-3] of 3/.test(r)), "most-missed questions: missed by N of 3", missedRows.length);
  await pa.click(".ch-fmissed summary");
  check(/Correct answer/i.test(await text(pa, ".ch-fmissed details[open]")), "a missed question opens to its answer and rationale");
  await pa.screenshot({path: OUT + "/ch-group-focus.png", fullPage: true});
  await pc.goto(BASE + "challenges.html?focus=" + id);
  await pc.waitForSelector(".tp-h1");
  check(/Not available/.test(await text(pc, ".tp-h1")) && !(await pc.$(".ch-ftopics")), "someone who hasn't finished can't open Group focus");
  const quizUs = await text(pa, ".ch-quizus");
  check(new RegExp("Quiz us on these · " + missedIds).test(quizUs), "Quiz us on these: every question someone missed", quizUs);
  const progressBefore = await pa.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("pinkprint-progress") || "{}")).length);
  await pa.click(".ch-quizus");
  await pa.waitForSelector("#pq-quiz-screen:not(.hidden)");
  check(/Group focus: Safety/.test(await text(pa, "#ss-title")) && new RegExp("of " + missedIds).test(await text(pa, "#pq-progress")), "group quiz has the missed questions", await text(pa, "#pq-progress"));
  await pa.keyboard.press("a");
  await pa.click("#pq-check-sure");
  const playersBefore = JSON.stringify(await q("select score, finished_at from public.challenge_players order by ticket_hash"));
  check(await pa.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("pinkprint-progress") || "{}")).length) >= progressBefore, "group quiz answers count toward A's own progress");
  await pa.click("#pq-end-test");
  await pa.waitForSelector("#pq-end-screen:not(.hidden)");
  check(JSON.stringify(await q("select score, finished_at from public.challenge_players order by ticket_hash")) === playersBefore, "the group quiz doesn't change challenge scores");
  await pa.goto(BASE + "challenges.html");

  // ---- A guest answering a quiz adds to the tally too, and nothing else is saved ----
  const G = await device("guest");
  const pgG = await G.newPage();
  await pgG.goto(QUIZ);
  check(!(await pgG.$("#pq-challenge")), "guests don't see Challenge a friend");
  await pgG.click("#pq-start");
  const t0 = await tally();
  await pgG.keyboard.press("a"); await pgG.click("#pq-submit");
  await pgG.click("#pq-end-test");
  check(await waitFor(async () => (await tally()) === t0 + 1), "guest answers are tallied (question ID and right/wrong only)");
  check(await state(pgG) === null && await pgG.evaluate(() => localStorage.getItem("pinkprint-progress")) === null, "guest still has nothing saved on the device");

  // ---- A deletes it; B's list drops it ----
  await pa.click(`#c-${id} .ch-delete`);
  await waitFor(async () => !(await pa.$(`#c-${id}`)));
  check((await q("select count(*)::int n from public.challenges"))[0].n === 0 && (await q("select count(*)::int n from public.challenge_players"))[0].n === 0 &&
        (await q("select count(*)::int n from public.challenge_answers"))[0].n === 0, "deleted for everyone (scores and answers too)");
  check(await pa.isVisible(".ch-empty") && !(await pa.isVisible(".ch-donehead")), "A's list is empty again");
  await pb.goto(BASE + "challenges.html");
  await pb.waitForSelector(".ch-empty");
  check(!(await pb.$(`#c-${id}`)), "B's list drops a deleted challenge");
  await pb.goto(BASE + "c/" + id);
  await pb.waitForSelector(".ch-banner:not(.hidden)");
  check(/expired or was deleted/.test(await text(pb, ".ch-banner")), "an old link says it expired or was deleted");
  const bad = await pb.goto(BASE + "c/not-an-id");
  check(bad.status() === 404, "a bad short link is a 404", bad.status());

  // ---- Settings switch ----
  await pa.evaluate(() => Tracking.setFeature("challenges", false));
  await pa.goto(QUIZ);
  await pa.waitForSelector("#pq-start");
  check(!(await pa.$("#pq-challenge")), "Challenges off: no Challenge a friend link");
  await pa.goto(BASE + "challenges.html");
  check(/Challenges are turned off/.test(await text(pa, "#ms-main")) && !/Challenges/.test(await text(pa, ".ms-nav")), "Challenges off: page says so, menu hides it");
  await pa.click(".ch-turnon");
  await pa.waitForSelector(".ch-new");
  check(true, "turning it back on shows the page");

  // ---- All units ----
  await pa.selectOption("#ch-unit", "all");
  check(await pa.$eval("#ch-topic", s => s.disabled && s.textContent.trim() === "All topics"), "All units: no topic to pick");
  await pa.click('.ch-counts button[data-n="40"]');
  await pa.click(".ch-create");
  await pa.waitForSelector(".ch-ready:not(.hidden)");
  const all = (await q("select title, questions from public.challenges order by created_at desc limit 1"))[0];
  const unitsUsed = new Set(all.questions.map(x => x.split("-")[1]));
  check(all.title === "All units" && all.questions.length === 40 && unitsUsed.size > 1, "All units: 40 questions drawn from several units", [...unitsUsed].join(","));

  check(errors.length === 0, "no page errors", JSON.stringify(errors));
  await b.close();
  await db.end();
  console.log(failures ? failures + " FAILED" : "all challenge checks passed");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
