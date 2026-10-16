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

test("word list: about 250 single, easy words with no repeats or awkward words", () => {
  assert.ok(WORDS.length >= 240 && WORDS.length <= 260, WORDS.length + " words");
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
    history: {replaceState(){}},
    document: {currentScript: {src: "https://example.test/js/tracking.js"}, dispatchEvent(){}},
    URL, URLSearchParams, TextEncoder, Uint8Array, Uint32Array, console,
    crypto: globalThis.crypto || require("crypto").webcrypto,
    CustomEvent: class {}, fetch: () => Promise.reject(new Error("offline"))
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ["js/tracking.js", "js/progress.js"]) vm.runInContext(fs.readFileSync(path.join(SITE, f), "utf8"), ctx, {filename: f});
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
