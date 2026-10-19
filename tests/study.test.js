/* Tests for nursing-study-site/js/study.js (My study numbers).
   Run from the repo root:  node tests/study.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../nursing-study-site/js/study.js");
const P = require("../nursing-study-site/js/progress.js");
const EX = require("../nursing-study-site/data/nur114/exams.json");
const EXAMS = EX.exams, SEM = EX.semester;

const q = (id, unit = 3) => ({id, unit});
const rec = (o) => Object.assign(P.blankRecord(), o);

test("readiness: accuracy on answered questions, not enough data under 5", () => {
  const qs = Array.from({length: 10}, (_, i) => q("q" + i));
  const store = {};
  for (let i = 0; i < 4; i++) store["q" + i] = rec({seen: 1, correct: 1});
  let s = S.stats(qs, store, "2026-10-01", EXAMS);
  assert.equal(s.readiness, "nodata");
  assert.equal(s.seen, 4);
  store.q4 = rec({seen: 1, correct: 1});
  assert.equal(S.stats(qs, store, "2026-10-01", EXAMS).readiness, "strong", "5 of 5 right");
  // 17 of 20 answers right = 85% -> Strong; 16 = 80% On track; 14 = 70% Needs work
  const make = right => { const st = {}; for (let i = 0; i < 5; i++) st["q" + i] = rec({seen: 4, correct: i < right % 5 ? Math.ceil(right / 5) : Math.floor(right / 5)}); return st; };
  assert.equal(S.stats(qs, make(17), "2026-10-01", EXAMS).readiness, "strong");
  assert.equal(S.stats(qs, make(16), "2026-10-01", EXAMS).readiness, "ontrack");
  assert.equal(S.stats(qs, make(15), "2026-10-01", EXAMS).readiness, "ontrack", "75% is on track");
  assert.equal(S.stats(qs, make(14), "2026-10-01", EXAMS).readiness, "needswork");
  const m = S.stats(qs, {q0: rec({seen: 2, correct: 2, mastered: true}), q1: rec({seen: 1, correct: 0})}, "2026-10-01", EXAMS);
  assert.equal(m.masteryPct, 10, "mastered / all questions in the group");
  assert.equal(m.learning, 1); assert.equal(m.unseen, 8);
});

test("countdown strip: one square per day since the last exam, window and exam day marked", () => {
  const s = S.strip(EXAMS, SEM, "2026-10-15");
  assert.equal(s.target.id, "exam-4"); assert.equal(s.prev.id, "exam-3");
  assert.equal(s.days.length, 14, "Tue Oct 13 through Mon Oct 26");
  assert.equal(s.days[0].date, "2026-10-13"); assert.equal(s.days[0].letter, "T");
  assert.deepEqual(s.days.filter(d => d.past).map(d => d.date), ["2026-10-13", "2026-10-14"], "Tue and Wed have passed");
  assert.equal(s.days.find(d => d.today).date, "2026-10-15");
  assert.deepEqual(s.days.filter(d => d.window).map(d => d.letter), ["F", "S", "S"]);
  assert.ok(s.days[13].exam && s.days[13].letter === "M");
  assert.equal(s.daysLeft, 11, "11 days to Exam 4");
  // Thanksgiving: Exam 5 Nov 9 -> Exam 6 Nov 30
  const t = S.strip(EXAMS, SEM, "2026-11-20");
  assert.equal(t.target.id, "exam-6"); assert.equal(t.days.length, 21);
  assert.deepEqual(t.days.filter(d => d.brk).map(d => d.date), ["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"]);
  assert.equal(t.breaks[0].name, "Thanksgiving break"); assert.equal(t.daysLeft, 10);
  // Then the ATI, then the Final, then nothing
  assert.equal(S.strip(EXAMS, SEM, "2026-12-01").target.id, "ati");
  assert.equal(S.strip(EXAMS, SEM, "2026-12-01").days.length, 7);
  assert.equal(S.strip(EXAMS, SEM, "2026-12-08").target.id, "final");
  assert.equal(S.strip(EXAMS, SEM, "2026-12-09"), null);
  assert.equal(S.strip(EXAMS, SEM, "2026-08-24").days[0].date, "2026-08-24", "before Exam 1 it starts at the semester start");
});

test("today's plan spreads what's left over the days before the window, and re-spreads", () => {
  const qs = Array.from({length: 40}, (_, i) => q("q" + i, 3));
  // Oct 1: Exam 3 is Oct 12, window opens Oct 9 -> 8 days left
  let p = S.planToday(qs, {}, "2026-10-01", EXAMS);
  assert.equal(p.exam.id, "exam-3"); assert.equal(p.windowStart, "2026-10-09"); assert.equal(p.n, 5, "40 over 8 days");
  // Missed a day and mastered nothing: Oct 3 -> 40 over 6 days = 7
  assert.equal(S.planToday(qs, {}, "2026-10-03", EXAMS).n, 7);
  // Mastered 10: 30 left over 6 days = 5
  const store = {}; for (let i = 0; i < 10; i++) store["q" + i] = rec({seen: 2, correct: 2, mastered: true});
  assert.equal(S.planToday(qs, store, "2026-10-03", EXAMS).n, 5);
  // In the window: the not-yet-exam-ready questions over the days to the exam
  p = S.planToday(qs, store, "2026-10-10", EXAMS);
  assert.ok(p.inWindow); assert.equal(p.remaining, 40); assert.equal(p.n, 20, "40 over 2 days");
  // Next exam's unit has no questions yet (Unit 4 on Oct 16): review earlier units
  p = S.planToday(qs, store, "2026-10-16", EXAMS);
  assert.equal(p.exam.id, "exam-4"); assert.ok(p.fallback); assert.equal(p.n, 10);
});

test("exam ready counts and priority groups (review due folds into mastered in the window)", () => {
  const qs = [q("a"), q("b"), q("c"), q("d"), q("e")];
  const store = {
    a: rec({seen: 3, correct: 3, mastered: true, lastAnswered: "2026-10-01", lastCorrect: true, lastSure: true, examReady: {"exam-3": {ready: true}}}),
    b: rec({seen: 2, correct: 2, mastered: true, lastAnswered: "2026-10-01", lastCorrect: true, lastSure: true}),
    c: rec({seen: 1, correct: 0, journal: true, lastCorrect: false, lastSure: true, missStreak: 1}),
    d: rec({seen: 1, correct: 1, lastCorrect: true, lastSure: false})
  };
  const exam = EXAMS.find(e => e.id === "exam-3");
  assert.deepEqual(S.examReady(qs, store, exam), {total: 5, ready: 1, mastered: 1, notMastered: 3});
  const inWindow = S.groupCounts(qs, store, "2026-10-10", EXAMS, true);
  assert.equal(inWindow.reviewdue, 0); assert.equal(inWindow.mastered, 2);
  assert.equal(inWindow.blindspot, 1); assert.equal(inWindow.luckyguess, 1); assert.equal(inWindow.new, 1);
  const outside = S.groupCounts(qs, store, "2026-10-10", EXAMS, false);
  assert.equal(outside.reviewdue, 2, "outside the window review due keeps its own group");
});

test("weak spots quiz: blind spots, then mistakes, then lucky guesses, nothing else", () => {
  const qs = ["blind", "m1", "m2", "lucky", "learn", "mast"].map(id => q(id)).concat(Array.from({length: 30}, (_, i) => q("new" + i)));
  const store = {
    blind: rec({seen: 2, correct: 1, wrong: 1, lastCorrect: false, lastSure: true, journal: true}),
    m1: rec({seen: 1, wrong: 1, lastCorrect: false, lastSure: false, journal: true}),
    m2: rec({seen: 3, correct: 2, wrong: 1, lastCorrect: true, journal: true}),
    lucky: rec({seen: 1, correct: 1, lastCorrect: true, lastSure: false}),
    learn: rec({seen: 1, correct: 1, lastCorrect: true}),
    mast: rec({seen: 2, correct: 2, mastered: true, lastCorrect: true})
  };
  const out = S.weakSpotsQuiz(qs, store, "2026-10-01", EXAMS).map(x => x.id);
  assert.equal(out.length, 4);
  assert.equal(out[0], "blind");
  assert.deepEqual(out.slice(1, 3).sort(), ["m1", "m2"]);
  assert.equal(out[3], "lucky");
  assert.ok(S.isWeak(store.lucky, 3, "2026-10-01", EXAMS) && !S.isWeak(store.learn, 3, "2026-10-01", EXAMS) && !S.isWeak(store.mast, 3, "2026-10-01", EXAMS));
  // 45 mistakes: capped at 40, blind spot still first
  const many = Array.from({length: 45}, (_, i) => q("j" + i)).concat(qs);
  const st2 = Object.assign({}, store);
  for (let i = 0; i < 45; i++) st2["j" + i] = rec({seen: 1, wrong: 1, lastCorrect: false, journal: true});
  const out2 = S.weakSpotsQuiz(many, st2, "2026-10-01", EXAMS).map(x => x.id);
  assert.equal(out2.length, 40);
  assert.equal(out2[0], "blind");
  assert.ok(!out2.some(id => id.startsWith("new")) && !out2.includes("lucky"));
});

test("streaks: weeks in a row hitting the goal (Mon-Sun), passes, Thanksgiving and breaks", () => {
  const goal = {type: "questions", value: 50};
  const totals = {};
  const hit = monday => { totals[monday] = 50; };
  ["2026-08-24", "2026-08-31", "2026-09-07"].forEach(hit);           // 3 weeks hit
  // week of Sep 14 missed -> reset; then Sep 21, Sep 28 hit
  ["2026-09-21", "2026-09-28"].forEach(hit);
  let s = S.streaks(totals, goal, "2026-10-07", SEM, [], null);
  assert.equal(s.best, 3); assert.equal(s.current, 2, "Oct 5 week not met yet: doesn't break it");
  totals["2026-10-06"] = 50;
  assert.equal(S.streaks(totals, goal, "2026-10-07", SEM, [], null).current, 3, "this week counts once the goal is met");
  // A busy week pass on the missed week keeps the earlier streak going
  s = S.streaks(totals, goal, "2026-10-07", SEM, ["2026-09-14"], null);
  assert.equal(s.current, 6); assert.equal(s.best, 6);
  // Study days goal
  const days = {type: "days", value: 3};
  const t2 = {"2026-10-05": 1, "2026-10-07": 2, "2026-10-09": 1};
  assert.deepEqual(S.weekProgress(t2, days, "2026-10-05"), {questions: 4, days: 3, done: 3, target: 3, met: true});
  // Holiday breaks never count on their own. Thanksgiving week (Nov 23-29) is a break week:
  // with "keep my goal during holiday breaks" off it's skipped (hit or miss); on, a hit grows it
  assert.equal(S.weekKind("2026-11-23", SEM), "break");
  const t3 = {"2026-11-09": 50, "2026-11-16": 50, "2026-11-30": 50};
  assert.equal(S.streaks(t3, goal, "2026-12-02", SEM, [], false).current, 3, "missed Thanksgiving week: skipped, not reset");
  assert.equal(S.streaks(t3, goal, "2026-12-02", SEM, [], true).current, 3, "goal on during breaks: missing only pauses");
  t3["2026-11-23"] = 50;
  assert.equal(S.streaks(t3, goal, "2026-12-02", SEM, [], false).current, 3, "hit Thanksgiving week with the goal off: doesn't count");
  assert.equal(S.streaks(t3, goal, "2026-12-02", SEM, [], true).current, 4, "hit Thanksgiving week with the goal on: grows");
  // After the semester (Dec 10): off, weeks are skipped; on, the weekly goal still counts
  const t4 = {"2026-11-30": 50, "2026-12-07": 50, "2026-12-21": 50};
  assert.equal(S.weekKind("2026-12-14", SEM), "break");
  assert.equal(S.streaks(t4, goal, "2027-01-06", SEM, [], false).current, 2);
  assert.equal(S.streaks(t4, goal, "2027-01-06", SEM, [], true).current, 3);
  assert.equal(S.streaks(t4, goal, "2027-01-06", SEM, [], false).week, null, "this week during a break with the goal off: no goal bar");
  // One busy week pass per month
  assert.equal(S.passesLeft([], "2026-10-15"), 1);
  assert.equal(S.passesLeft(["2026-10-05"], "2026-10-15"), 0);
  assert.equal(S.passesLeft(["2026-09-28"], "2026-10-15"), 1);
});

test("exam average: running %, and what's needed on everything left", () => {
  const g = S.grade(EXAMS, {"exam-1": 84, "exam-2": 78}, EX.grading);
  assert.equal(g.pct, 81); assert.equal(g.earned, 162); assert.equal(g.left, 700);
  assert.equal(g.needPoints, 513); assert.equal(g.needPct, 73, "about 73% on everything left");
  assert.equal(g.possible, 900, "Exams 1-6 at 100 each + Final 300; ATI not included");
  const none = S.grade(EXAMS, {}, EX.grading);
  assert.equal(none.pct, null); assert.equal(none.needPct, 75);
  const done = S.grade(EXAMS, {"exam-1": 100, "exam-2": 100, "exam-3": 100, "exam-4": 100, "exam-5": 100, "exam-6": 100, "final": 300}, EX.grading);
  assert.ok(done.passed); assert.equal(done.left, 0); assert.equal(done.needPct, null);
});
