/* Tests for js/tracking.js (codes, nicknames, guests, Delete my data).
   Run from the repo root:  node tests/tracking.test.js
   (Node 18 or newer; nothing to install.) */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const T = require("../nursing-study-site/js/tracking.js");

const SITE = path.join(__dirname, "../nursing-study-site");
const WORDS = require("../nursing-study-site/data/wordlist.json").words;
const NAMES = require("../nursing-study-site/data/nicknames.json").names;

test("code format: 3 different list words + 4 digits", () => {
  for (let i = 0; i < 200; i++){
    const code = T.generateCode(WORDS);
    const parts = code.split(" ");
    assert.equal(parts.length, 4, code);
    parts.slice(0, 3).forEach(w => assert.ok(WORDS.includes(w), w + " is a list word"));
    assert.equal(new Set(parts.slice(0, 3)).size, 3, "no word repeats within a code");
    assert.match(parts[3], /^\d{4}$/);
  }
});

test("no repeated codes in 1,000 tries", () => {
  const seen = new Set();
  for (let i = 0; i < 1000; i++) seen.add(T.generateCode(WORDS));
  assert.equal(seen.size, 1000);
});

test("codes typed with extra spaces or capitals are the same code", () => {
  const code = "flashcard pulse coffee 4821";
  const typed = ["Flashcard Pulse Coffee 4821", "  flashcard   pulse coffee 4821 ", "FLASHCARD PULSE COFFEE 4821",
                 "flashcardpulsecoffee4821", "Flashcard pulsecoffee 4821", "flashcard\tpulse\ncoffee 4821"];
  typed.forEach(t => {
    assert.equal(T.normalizeCode(t), T.normalizeCode(code), JSON.stringify(t));
    assert.equal(T.parseCode(t, WORDS), code, JSON.stringify(t));
  });
  assert.equal(T.parseCode("flashcard pulse 4821", WORDS), null, "only 2 words");
  assert.equal(T.parseCode("flashcard pulse zebra 4821", WORDS), null, "a word that isn't on the list");
  assert.equal(T.parseCode("flashcard pulse coffee 482", WORDS), null, "only 3 digits");
  assert.equal(T.maskCode(code), "flashcard •••••• •••••• ••••");
});

test("word list: 250 single, easy words, none starting with another, with no repeats or awkward words", () => {
  assert.equal(WORDS.length, 250);
  WORDS.forEach(a => WORDS.forEach(b => assert.ok(a === b || !b.startsWith(a), b + " starts with " + a)));
  assert.equal(new Set(WORDS).size, WORDS.length, "no repeats");
  WORDS.forEach(w => assert.match(w, /^[a-z]{3,11}$/, w));
  ["code", "dnr", "morgue", "death", "dead", "blood"].forEach(w => assert.ok(!WORDS.includes(w), w));
  // Every code reads back the same way, so no list word can be split into other list words
  for (let i = 0; i < 300; i++){
    const c = T.generateCode(WORDS);
    assert.equal(T.parseCode(c.replace(/ /g, ""), WORDS), c);
  }
});

test("nicknames: Miss Pinkprint is never listed or offered", () => {
  assert.ok(!NAMES.includes("Miss Pinkprint"));
  const withOwner = NAMES.concat(["Miss Pinkprint"]);
  for (let i = 0; i < 1000; i++) assert.notEqual(T.pickNickname(withOwner), "Miss Pinkprint");
  for (let i = 0; i < 200; i++) assert.notEqual(T.pickNickname(NAMES, "Gauze Goddess"), "Gauze Goddess", "Reroll gives a different name");
});

/* A pretend browser page: tracking.js and progress.js with their own storage */
function page(opts = {}){
  const mk = m => ({getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k)});
  const local = new Map(Object.entries(opts.local || {})), session = new Map(Object.entries(opts.session || {}));
  const ctx = {
    localStorage: mk(local), sessionStorage: mk(session),
    location: {search: opts.search || "", hash: opts.hash || "", pathname: "/unit-3-skin-wounds-diagnostics/safety-quiz.html"},
    history: {replaceState(){ ctx.cleared = true; }},
    document: {currentScript: {src: "https://example.test/js/tracking.js"}, readyState: "complete", dispatchEvent(){}, addEventListener(){}},
    URL, URLSearchParams, TextEncoder, TextDecoder, Uint8Array, Uint32Array, btoa, atob,
    console: {log(){}, warn(){}, error: console.error},
    setTimeout: (f, ms) => setTimeout(f, ms).unref(), clearTimeout,
    crypto: globalThis.crypto || require("crypto").webcrypto,
    CustomEvent: class {}, fetch: () => Promise.reject(new Error("offline")),
    alert: msg => { ctx.alerts.push(msg); }, alerts: [],
    addEventListener: (type, fn) => { if (type === "hashchange") ctx.onHash = fn; }
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ["js/tracking.js", "js/progress.js"]){
    let code = fs.readFileSync(path.join(SITE, f), "utf8");
    if (opts.ownerHash) code = code.replace(/var OWNER_HASH = "[0-9a-f]*";/, 'var OWNER_HASH = "' + opts.ownerHash + '";');
    vm.runInContext(code, ctx, {filename: f});
  }
  return {ctx, local, session, T: ctx.Tracking, P: ctx.Progress};
}

test("guests save nothing", () => {
  const g = page({search: "?today=2026-10-09&track=on", hash: "#owner=some-phrase"});
  assert.equal(g.T.isOn(), false);
  assert.equal(g.P.enabled(), false);
  // Every write path a page could call while someone is a guest
  g.P.save({"nur114-u3-safety-001": {seen: 1}});
  g.P.toggleBookmark("nur114-u3-safety-001");
  g.P.setNote("nur114-u3-safety-001", "a note");
  g.P.record({id: "nur114-u3-safety-001", unit: 3}, false, true, ["a"]);
  g.T.update({nickname: "Lab Legend"});
  g.T.setFeature("sure", false);
  g.T.noteFinishedSession();
  assert.equal(g.local.size, 0, "localStorage stays empty: " + [...g.local.keys()]);
  assert.equal(g.session.size, 0, "sessionStorage stays empty");
  assert.equal(g.T.feature("sure"), false, "study features are off for guests");
});

test("a guest's quiz session is only kept (in this tab) after they tap Start tracking", () => {
  const g = page();
  assert.equal(g.session.size, 0);
  g.T.carrySession([{id: "nur114-u3-safety-001", unit: 3, correct: false, picked: ["b"]}]);
  assert.equal(g.session.size, 1);
  assert.equal(g.local.size, 0, "nothing in localStorage");
  assert.equal(g.T.takeCarry().length, 1);
  assert.equal(g.session.size, 0, "taken once, then gone");
});

test("Start tracking saves the code, nickname and goal, and keeps progress already on the device", () => {
  const old = JSON.stringify({"nur114-u3-safety-001": {seen: 3, correct: 2}});
  const p = page({local: {"pinkprint-progress": old}});
  p.T.start({code: "flashcard pulse coffee 4821", nickname: "Lab Legend", goal: {type: "days", value: 3}});
  assert.equal(p.T.isOn(), true);
  assert.equal(p.P.enabled(), true);
  const s = p.T.state();
  assert.equal(s.code, "flashcard pulse coffee 4821");
  assert.equal(s.nickname, "Lab Legend");
  assert.deepEqual(JSON.parse(JSON.stringify(s.goal)), {type: "days", value: 3});
  p.T.FEATURES.forEach(f => assert.equal(p.T.feature(f), true, f + " is on by default"));
  assert.equal(p.local.get("pinkprint-progress"), old, "earlier progress kept");
  p.T.setFeature("notes", false);
  assert.equal(p.T.feature("notes"), false);
  assert.equal(p.T.feature("sure"), true);
});

test("Delete my data clears everything tracking saved", () => {
  const p = page({local: {"pinkprint-track": "on", "theme": "dark", "palette": "blue"}});
  p.T.start({code: "flashcard pulse coffee 4821", nickname: "Lab Legend"});
  p.P.record({id: "nur114-u3-safety-001", unit: 3}, false, true, ["a"]);
  p.P.toggleBookmark("nur114-u3-safety-002");
  p.P.setNote("nur114-u3-safety-002", "RACE");
  p.local.set("pinkprint-today", "2026-10-09");
  p.T.carrySession([{id: "x", unit: 3, correct: true}]);
  assert.ok(p.local.has("pinkprint-progress") && p.local.has("pinkprint-tracking"));

  p.T.deleteAll();
  assert.equal(p.T.isOn(), false);
  ["pinkprint-tracking", "pinkprint-progress", "pinkprint-today", "pinkprint-track"].forEach(k => assert.ok(!p.local.has(k), k));
  assert.equal(p.session.size, 0, "carried session cleared too");
  assert.deepEqual([...p.local.keys()].sort(), ["palette", "theme"], "only the site's theme choices remain (not tracking data)");
  assert.deepEqual(JSON.parse(JSON.stringify(p.P.load())), {}, "no progress left");
});

test("owner phrase: lowercased, trimmed and extra spaces collapsed before checking", async () => {
  assert.equal(T.normalizePhrase("  Velvet   Otter\tCaramel  Lantern "), "velvet otter caramel lantern");
  // A stand-in phrase; the real one is never in the repo
  const sha = s => require("crypto").createHash("sha256").update(s).digest("hex");
  const ownerHash = sha("velvet otter caramel lantern");
  const tracked = {"pinkprint-tracking": JSON.stringify({code: "flashcard pulse coffee 4821", nickname: "Lab Legend"})};
  /* Wait until a check passes (the slow key derivation for syncing can keep the machine busy) */
  const until = async (fn, ms = 5000) => { const end = Date.now() + ms; while (!fn() && Date.now() < end) await new Promise(r => setTimeout(r, 20)); };
  const wait = () => new Promise(r => setTimeout(r, 300));

  for (const typed of ["velvet otter caramel lantern", "%20Velvet%20%20OTTER%20caramel%20Lantern%20", "Velvet+Otter+Caramel+Lantern"]){
    const p = page({local: tracked, hash: "#owner=" + typed, ownerHash});
    await until(() => p.T.state().nickname === "Miss Pinkprint");
    assert.equal(p.T.state().nickname, "Miss Pinkprint", typed);
    assert.ok(p.ctx.cleared, "phrase cleared from the address bar");
  }
  const wrong = page({local: tracked, hash: "#owner=velvet otter caramel", ownerHash});
  await wait();
  assert.equal(wrong.T.state().nickname, "Lab Legend", "a wrong phrase changes nothing");
  assert.ok(wrong.ctx.cleared, "even a wrong phrase is cleared from the address bar");

  const guest = page({hash: "#owner=velvet otter caramel lantern", ownerHash});
  await until(() => guest.ctx.alerts.length);
  assert.equal(guest.local.size, 0, "guests: nothing saved");
  assert.ok(guest.ctx.cleared);
  assert.match(guest.ctx.alerts[0] || "", /isn't tracking yet/, "a guest with the right phrase is told to start tracking first");
  assert.equal(wrong.ctx.alerts.length, 0, "a wrong phrase gets no message");

  /* Typed onto a page that's already open: no reload, just a hash change */
  const open = page({local: tracked, ownerHash});
  open.ctx.location.hash = "#owner=velvet otter caramel lantern";
  open.ctx.onHash();
  await until(() => open.T.state().nickname === "Miss Pinkprint");
  assert.equal(open.T.state().nickname, "Miss Pinkprint", "works without a reload");
  assert.equal(open.T.state().ownerProof, "velvet otter caramel lantern", "phrase kept for challenges");
});

/* ---------- Sync (phase 4): keys, encryption, merging ---------- */
test("keys: the code gives a lookup ID and a separate key; spaces and capitals don't matter", async () => {
  assert.ok(T.PBKDF2_ITERATIONS >= 600000, "slow on purpose");
  const a = await T.deriveKeys("flashcard pulse coffee 4821");
  const b = await T.deriveKeys("  Flashcard PULSE coffee4821 ");
  const c = await T.deriveKeys("flashcard pulse coffee 4822");
  assert.match(a.lookup, /^[0-9a-f]{64}$/);
  assert.equal(Buffer.from(a.key, "base64").length, 32, "AES-256 key");
  assert.deepEqual(a, b, "same code typed differently gives the same values");
  assert.notEqual(a.lookup, c.lookup, "a different code gives a different lookup ID");
  assert.notEqual(a.key, c.key);
  assert.notEqual(a.lookup, Buffer.from(a.key, "base64").toString("hex"), "lookup ID and key are separate");
  assert.ok(!a.lookup.includes("flashcard"), "the code isn't in the lookup ID");
});

test("encryption: only the right key opens it, and the saved text is scrambled", async () => {
  const k = await T.deriveKeys("flashcard pulse coffee 4821");
  const other = await T.deriveKeys("flashcard pulse coffee 4822");
  const payload = {v: 1, settings: {nickname: "Lab Legend"}, progress: {"nur114-u3-safety-001": {seen: 2, note: "RACE = rescue first"}}};
  const box1 = await T.encryptJSON(k.key, payload);
  const box2 = await T.encryptJSON(k.key, payload);
  assert.match(box1, /^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
  assert.notEqual(box1, box2, "a fresh random IV every save");
  ["Lab Legend", "RACE", "nur114", "flashcard"].forEach(w => assert.ok(!box1.includes(w), w + " not readable"));
  assert.deepEqual(await T.decryptJSON(k.key, box1), payload);
  await assert.rejects(T.decryptJSON(other.key, box1), "a different code can't open it");
  await assert.rejects(T.decryptJSON(k.key, box1.slice(0, -4) + "AAAA"), "tampered text is rejected");
});

test("merging two devices: the most recent change to each question wins", () => {
  const a = {q1: {seen: 3, t: 100}, q2: {seen: 1, t: 500, note: "mine"}, q3: {seen: 1, t: 50}};
  const b = {q1: {seen: 4, t: 200}, q2: {seen: 1, t: 400}, q4: {seen: 2, t: 10}};
  const m = T.mergeProgress(a, b);
  assert.equal(m.q1.seen, 4, "b changed q1 later");
  assert.equal(m.q2.note, "mine", "a changed q2 later");
  assert.ok(m.q3 && m.q4, "questions from both devices are kept");
  assert.equal(T.mergeProgress({q: {seen: 1}}, {}).q.seen, 1, "records without a time still merge");
  const local = {nickname: "Lab Legend", settingsAt: 10}, remote = {nickname: "IV Icon", settingsAt: 20};
  assert.equal(T.mergeSettings(local, remote).nickname, "IV Icon");
  assert.equal(T.mergeSettings(remote, local).nickname, "IV Icon");
  const picked = T.pickSettings({code: "flashcard pulse coffee 4821", nickname: "Lab Legend", sync: {key: "secret"}, goal: {type: "days", value: 3}, settingsAt: 5});
  assert.equal(picked.code, undefined, "the code itself is never part of the saved copy");
  assert.equal(picked.sync, undefined, "nor this device's keys");
  assert.equal(picked.nickname, "Lab Legend");
});

test("challenge tickets from two devices are combined, removals stick, old ones drop off", () => {
  const now = Date.now(), day = 24 * 3600 * 1000;
  const local = {nickname: "Lab Legend", settingsAt: 100, challenges: [
    {id: "AAAA2222", ticket: "a", mine: true, at: now - day},
    {id: "CCCC4444", ticket: "c", at: now - 2 * day},
    {id: "OLDD9999", ticket: "o", at: now - 30 * day}
  ]};
  const remote = {nickname: "IV Icon", settingsAt: 200, challenges: [
    {id: "BBBB3333", ticket: "b", at: now},
    {id: "CCCC4444", ticket: "c", at: now - 2 * day, gone: true, done: true}
  ]};
  const m = T.mergeSettings(local, remote);
  assert.equal(m.nickname, "IV Icon", "newest settings still win");
  assert.deepEqual(m.challenges.map(c => c.id), ["BBBB3333", "AAAA2222", "CCCC4444"], "union, newest first, 3-week-old one dropped");
  assert.equal(m.challenges.find(c => c.id === "CCCC4444").gone, true, "removed on one device stays removed");
  assert.equal(m.challenges.find(c => c.id === "AAAA2222").ticket, "a", "a ticket only one device had is kept");
  assert.deepEqual(T.mergeSettings({settingsAt: 1}, {settingsAt: 2, goal: 1}), {settingsAt: 2, goal: 1}, "no challenges: unchanged");
});
