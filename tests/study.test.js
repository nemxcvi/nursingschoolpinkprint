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

test("readiness needs a fair share of the group answered: 20, or half if smaller, at least 5", () => {
  assert.equal(S.minSeen(10), 5); assert.equal(S.minSeen(30), 15); assert.equal(S.minSeen(40), 20); assert.equal(S.minSeen(376), 20);
  assert.equal(S.minSeen(3), 3, "tiny groups need every question");
  const qs = Array.from({length: 376}, (_, i) => q("q" + i, 4));
  const store = {};
  for (let i = 0; i < 19; i++) store["q" + i] = rec({seen: 1, correct: 1});
  let s = S.stats(qs, store, "2026-10-20", EXAMS);
  assert.equal(s.readiness, "nodata", "19 of 376 seen isn't enough");
  store.q19 = rec({seen: 1, correct: 1});
  s = S.stats(qs, store, "2026-10-20", EXAMS);
  assert.equal(s.readiness, "strong"); assert.equal(s.coveragePct, 5, "20 of 376 seen"); assert.equal(s.seen, 20);
});

test("today's plan: daily size in sets of 10, any answers today count, coverage pace", () => {
  const qs = Array.from({length: 376}, (_, i) => q("q" + i, 4));
  // Oct 20: Exam 4 is Oct 26, window opens Oct 23 -> 3 days (Oct 20, 21, 22)
  let p = S.planToday(qs, {}, "2026-10-20", EXAMS);
  assert.equal(p.exam.id, "exam-4"); assert.equal(p.size, 30, "30 a day by default");
  assert.equal(p.target, 30); assert.equal(p.sets, 3); assert.equal(p.n, 10, "one set at a time");
  assert.equal(p.setsDone, 0); assert.ok(!p.complete);
  assert.equal(p.pace.unseen, 376); assert.equal(p.pace.reach, 90); assert.ok(!p.pace.onPace);
  assert.equal(p.pace.lastDay, "2026-10-22");
  // 14 answered today: set 2 of 3, 16 left, next set 10
  p = S.planToday(qs, {}, "2026-10-20", EXAMS, {size: 30, done: 14});
  assert.equal(p.setsDone, 1); assert.equal(p.left, 16); assert.equal(p.n, 10);
  p = S.planToday(qs, {}, "2026-10-20", EXAMS, {size: 30, done: 25});
  assert.equal(p.n, 5, "the last set is what's left");
  p = S.planToday(qs, {}, "2026-10-20", EXAMS, {size: 30, done: 31});
  assert.ok(p.complete); assert.equal(p.n, 0); assert.equal(p.setsDone, 3);
  // Size 40 and only 60 unseen: on pace
  const store = {}; for (let i = 0; i < 316; i++) store["q" + i] = rec({seen: 1, correct: 1, lastCorrect: true});
  p = S.planToday(qs, store, "2026-10-20", EXAMS, {size: 40});
  assert.equal(p.target, 40); assert.equal(p.pace.unseen, 60); assert.ok(p.pace.onPace);
  // Unknown size falls back to 30
  assert.equal(S.planToday(qs, {}, "2026-10-20", EXAMS, {size: 17}).size, 30);
  // Almost everything mastered: the plan shrinks to what's left
  const m = {}; for (let i = 0; i < 371; i++) m["q" + i] = rec({seen: 2, correct: 2, mastered: true, lastCorrect: true, lastAnswered: "2026-10-19"});
  p = S.planToday(qs, m, "2026-10-20", EXAMS);
  assert.equal(p.target, 5); assert.equal(p.sets, 1); assert.equal(p.n, 5);
  // Next exam's unit has no questions yet: review earlier units
  p = S.planToday(Array.from({length: 40}, (_, i) => q("u3-" + i, 3)), {}, "2026-10-16", EXAMS);
  assert.ok(p.fallback); assert.equal(p.target, 10);
});

test("today's plan in the window: clear weak spots, then the readiness check, then exam ready", () => {
  const qs = Array.from({length: 100}, (_, i) => q("q" + i, 4));
  const store = {};
  for (let i = 0; i < 4; i++) store["q" + i] = rec({seen: 1, wrong: 1, lastCorrect: false, lastSure: true, journal: true});
  // Oct 24 is in Exam 4's window (Oct 23-25)
  let p = S.planToday(qs, store, "2026-10-24", EXAMS);
  assert.ok(p.inWindow); assert.equal(p.step, "weak"); assert.equal(p.weak, 4); assert.equal(p.target, 4); assert.equal(p.n, 4);
  // Weak spots cleared: take the check
  p = S.planToday(qs, {}, "2026-10-24", EXAMS);
  assert.equal(p.step, "check"); assert.equal(p.target, 0); assert.equal(p.check, null);
  // A check before the window doesn't count; one in the window does
  const checks = {"exam-4": [{date: "2026-10-20", correct: 40, total: 40}, {date: "2026-10-23", correct: 32, total: 40}]};
  p = S.planToday(qs, {}, "2026-10-24", EXAMS, {checks});
  assert.equal(p.check, 0.8); assert.equal(p.step, "check", "80% isn't exam ready");
  checks["exam-4"].push({date: "2026-10-24", correct: 35, total: 40});
  p = S.planToday(qs, {}, "2026-10-24", EXAMS, {checks});
  assert.equal(p.step, "ready"); assert.equal(p.check, 0.875);
  // A passing check with weak spots still open isn't exam ready yet
  assert.equal(S.planToday(qs, store, "2026-10-24", EXAMS, {checks}).step, "weak");
  assert.equal(S.planToday(qs, {}, "2026-10-26", EXAMS).step, "examday");
  assert.equal(S.checkLabel(0.85), "strong"); assert.equal(S.checkLabel(0.75), "ontrack"); assert.equal(S.checkLabel(0.7), "needswork"); assert.equal(S.checkLabel(null), "nodata");
});

test("plan sets: weak spots, then never seen, then the rest; weak spots only in the window", () => {
  const qs = ["blind", "miss", "lucky", "learn", "mast"].map(id => q(id, 4)).concat(Array.from({length: 20}, (_, i) => q("new" + i, 4)), [q("other", 3)]);
  const store = {
    blind: rec({seen: 1, wrong: 1, lastCorrect: false, lastSure: true, journal: true}),
    miss: rec({seen: 1, wrong: 1, lastCorrect: false, lastSure: false, journal: true}),
    lucky: rec({seen: 1, correct: 1, lastCorrect: true, lastSure: false}),
    learn: rec({seen: 1, correct: 1, lastCorrect: true}),
    mast: rec({seen: 2, correct: 2, mastered: true, lastCorrect: true, lastAnswered: "2026-10-19"})
  };
  const set = S.pickPlan(qs, 10, store, "2026-10-20", EXAMS, () => 0.5).map(x => x.id);
  assert.deepEqual(set.slice(0, 2), ["blind", "miss"]);
  assert.ok(set.slice(2).every(id => id.startsWith("new")), "never seen comes right after the weak spots");
  const win = S.pickPlan(qs, 10, store, "2026-10-24", EXAMS).map(x => x.id).sort();
  assert.deepEqual(win, ["blind", "lucky", "miss"], "in the window, weak spots only");
});

test("readiness check: 40 questions spread over every topic and category of the exam's units", () => {
  const qs = [];
  ["Fluids", "Lytes", "Acid-Base", "Nutrition"].forEach((t, ti) => ["A", "B"].forEach(c => {
    for (let i = 0; i < 30; i++) qs.push({id: t + c + i, unit: 4, topic: t, category: c});
  }));
  qs.push({id: "u3", unit: 3, topic: "Safety", category: "X"});
  const check = S.readinessCheck(qs, EXAMS.find(e => e.id === "exam-4"));
  assert.equal(check.length, 40);
  assert.ok(check.every(x => x.unit === 4), "only the exam's units");
  const per = {};
  check.forEach(x => { const k = x.topic + x.category; per[k] = (per[k] || 0) + 1; });
  assert.equal(Object.keys(per).length, 8); assert.ok(Object.values(per).every(n => n === 5), "evenly spread");
  assert.equal(new Set(check.map(x => x.id)).size, 40, "no repeats");
  assert.equal(S.bestCheck({}, EXAMS.find(e => e.id === "exam-4"), "2026-10-23"), null);
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
