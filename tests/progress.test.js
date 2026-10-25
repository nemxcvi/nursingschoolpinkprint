/* Tests for the progress rules in nursing-study-site/js/progress.js.
   Run from the repo root:  node tests/progress.test.js
   (Node 18 or newer; nothing to install.) */
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../nursing-study-site/js/progress.js");
const EXAMS = require("../nursing-study-site/data/nur114/exams.json").exams;

/* Answer a question several times: answers is a list of [date, correct, sure].
   sure defaults to true ("Check · I'm sure"); pass false for "Check · I guessed". */
function play(answers, unit = 3, start = null){
  let rec = start, events = [];
  for (const [date, correct, sure = true] of answers){
    const res = P.applyAnswer(rec, correct, date, unit, EXAMS, sure);
    rec = res.record; events.push(res.events);
  }
  return {rec, events, last: events[events.length - 1]};
}

test("mastery: 2 correct in a row masters a question", () => {
  const one = play([["2026-09-01", true]]);
  assert.equal(one.rec.mastered, false);
  const two = play([["2026-09-01", true], ["2026-09-02", true]]);
  assert.equal(two.rec.mastered, true);
  assert.equal(two.rec.masteredOn, "2026-09-02");
  assert.equal(two.last.mastered, true, "reported as newly mastered");
  assert.equal(two.rec.seen, 2);
  assert.equal(two.rec.correct, 2);
  assert.equal(two.rec.lastAnswered, "2026-09-02");
  const three = play([["2026-09-01", true], ["2026-09-02", true], ["2026-09-03", true]]);
  assert.equal(three.last.mastered, false, "not reported again once already mastered");
  assert.equal(three.rec.masteredOn, "2026-09-02");
});

test("reset: a wrong answer sets the streak to 0 and un-masters", () => {
  const r = play([["2026-09-01", true], ["2026-09-02", true], ["2026-09-03", false]]);
  assert.equal(r.rec.streak, 0);
  assert.equal(r.rec.mastered, false);
  assert.equal(r.rec.masteredOn, null);
  const notInARow = play([["2026-09-01", true], ["2026-09-02", false], ["2026-09-03", true]]);
  assert.equal(notInARow.rec.mastered, false, "correct, wrong, correct is not 2 in a row");
  const again = play([["2026-09-01", true], ["2026-09-02", false], ["2026-09-03", true], ["2026-09-04", true]]);
  assert.equal(again.rec.mastered, true);
  assert.equal(again.rec.masteredOn, "2026-09-04");
});

test("mistake journal: a miss adds it, 2 correct in a row removes it", () => {
  const miss = play([["2026-09-01", false]]);
  assert.equal(miss.rec.journal, true);
  assert.equal(miss.last.journaled, true);
  const oneRight = play([["2026-09-01", false], ["2026-09-02", true]]);
  assert.equal(oneRight.rec.journal, true, "still in the journal after 1 correct");
  const twoRight = play([["2026-09-01", false], ["2026-09-02", true], ["2026-09-03", true]]);
  assert.equal(twoRight.rec.journal, false);
  const back = play([["2026-09-01", false], ["2026-09-02", true], ["2026-09-03", true], ["2026-09-04", false]]);
  assert.equal(back.rec.journal, true, "a later miss puts it back");
  assert.equal(back.last.journaled, true);
  const twoMisses = play([["2026-09-01", false], ["2026-09-02", false]]);
  assert.equal(twoMisses.last.journaled, false, "only reported when it first goes in");
});

test("sure / guessed: saved with each answer; a lucky guess still counts toward mastery", () => {
  const sure = play([["2026-09-01", true]]).rec;
  assert.equal(sure.lastCorrect, true);
  assert.equal(sure.lastSure, true);
  const guessed = play([["2026-09-01", false, false]]).rec;
  assert.equal(guessed.lastCorrect, false);
  assert.equal(guessed.lastSure, false);
  assert.equal(guessed.journal, true, "a wrong guess still goes in the mistake journal");

  const twoGuesses = play([["2026-09-01", true, false], ["2026-09-02", true, false]]);
  assert.equal(twoGuesses.rec.mastered, true, "2 lucky guesses in a row still master it");
  const mixed = play([["2026-09-01", true], ["2026-09-02", true, false]]);
  assert.equal(mixed.rec.mastered, true);
  const leaveJournal = play([["2026-09-01", false], ["2026-09-02", true, false], ["2026-09-03", true]]);
  assert.equal(leaveJournal.rec.journal, false, "lucky guesses count toward leaving the journal too");
});

test("status: blind spot, lucky guess and the priority order", () => {
  const today = "2026-09-05";
  const st = (rec, unit = 3) => P.statusOf(rec, unit, today, EXAMS);
  assert.equal(st(null), "new");

  // Blind spot = the latest answer was wrong while sure
  assert.equal(st(play([["2026-09-01", false]]).rec), "blindspot");
  assert.equal(st(play([["2026-09-01", false, false]]).rec), "journal", "wrong but guessed is not a blind spot");
  assert.equal(st(play([["2026-09-01", false], ["2026-09-02", false, false]]).rec), "journal",
    "only the latest answer decides: a later wrong guess ends the blind spot");
  assert.equal(st(play([["2026-09-01", false], ["2026-09-02", true]]).rec), "journal",
    "a correct answer ends the blind spot, but it stays in the journal");

  // Lucky guess = the latest answer was right but guessed
  assert.equal(st(play([["2026-09-01", true, false]]).rec), "luckyguess");
  assert.equal(st(play([["2026-09-01", true, false], ["2026-09-02", true]]).rec), "mastered",
    "answering sure next time ends the lucky guess");
  assert.equal(st(play([["2026-09-01", true], ["2026-09-02", true, false]]).rec), "luckyguess",
    "a lucky guess outranks mastered");
  assert.equal(st(play([["2026-09-01", false], ["2026-09-02", true, false]]).rec), "journal",
    "the mistake journal outranks a lucky guess");

  assert.equal(st(play([["2026-09-01", true]]).rec), "learning");
  assert.equal(st(play([["2026-09-01", true], ["2026-09-02", true]]).rec), "mastered");

  const bookmarked = Object.assign(P.blankRecord(), {bookmarked: true});
  assert.equal(st(bookmarked), "bookmarked", "a bookmarked question outranks never seen");
  const journalAndBookmark = Object.assign(play([["2026-09-01", false, false]]).rec, {bookmarked: true});
  assert.equal(st(journalAndBookmark), "journal");
  const blindAndBookmark = Object.assign(play([["2026-09-01", false]]).rec, {bookmarked: true});
  assert.equal(st(blindAndBookmark), "blindspot");
  const luckyAndBookmark = Object.assign(play([["2026-09-01", true, false]]).rec, {bookmarked: true});
  assert.equal(st(luckyAndBookmark), "bookmarked");

  // Review-due mastered questions sit right after bookmarked, ahead of lucky guesses
  const dueLucky = play([["2026-09-30", true], ["2026-10-01", true, false]]).rec;
  assert.equal(P.statusOf(dueLucky, 3, "2026-10-09", EXAMS), "reviewdue");

  assert.deepEqual(P.STATUS_ORDER, ["blindspot", "new", "journal", "luckyguess", "bookmarked", "reviewdue", "learning", "mastered"]);
});

test("review due: 3 days before the exam covering the unit, then every 4 weeks", () => {
  // Unit 3 question mastered Oct 1. Exam 3 (Unit 3) is Mon Oct 12.
  const rec = play([["2026-09-30", true], ["2026-10-01", true]], 3).rec;
  assert.equal(P.isReviewDue(rec, 3, "2026-10-08", EXAMS), false);
  assert.equal(P.isReviewDue(rec, 3, "2026-10-09", EXAMS), true, "due 3 days before Exam 3");
  assert.equal(P.statusOf(rec, 3, "2026-10-09", EXAMS), "reviewdue");

  // Answered correctly on Oct 9: no longer due; next due 4 weeks later (Nov 6)
  const reviewed = play([["2026-10-09", true]], 3, rec).rec;
  assert.equal(P.isReviewDue(reviewed, 3, "2026-10-10", EXAMS), false);
  assert.equal(P.isReviewDue(reviewed, 3, "2026-11-05", EXAMS), false);
  assert.equal(P.isReviewDue(reviewed, 3, "2026-11-06", EXAMS), true, "due 4 weeks after last correct");

  // Other units' exams don't make it due
  const unit1 = play([["2026-09-30", true], ["2026-10-01", true]], 1).rec;
  assert.equal(P.isReviewDue(unit1, 1, "2026-10-09", EXAMS), false);

  // The ATI (Dec 7) and the Final (Dec 8) cover every unit
  const late = play([["2026-11-30", true], ["2026-12-01", true]], 1).rec;
  assert.equal(P.isReviewDue(late, 1, "2026-12-03", EXAMS), false);
  assert.equal(P.isReviewDue(late, 1, "2026-12-04", EXAMS), true, "3 days before the ATI");
  const reviewedDec4 = play([["2026-12-04", true]], 1, late).rec;
  assert.equal(P.isReviewDue(reviewedDec4, 1, "2026-12-05", EXAMS), true, "3 days before the Final, even after reviewing for the ATI");
  const reviewedDec5 = play([["2026-12-05", true]], 1, reviewedDec4).rec;
  assert.equal(P.isReviewDue(reviewedDec5, 1, "2026-12-06", EXAMS), false);

  // Not mastered questions are never review due
  const learning = play([["2026-10-01", true]], 3).rec;
  assert.equal(P.isReviewDue(learning, 3, "2026-10-10", EXAMS), false);
});

test("exam ready window: the last 3 days before an exam", () => {
  assert.deepEqual(P.readyWindowExams(EXAMS, 3, "2026-10-08").map(e => e.id), []);
  assert.deepEqual(P.readyWindowExams(EXAMS, 3, "2026-10-09").map(e => e.id), ["exam-3"]);
  assert.deepEqual(P.readyWindowExams(EXAMS, 3, "2026-10-11").map(e => e.id), ["exam-3"]);
  assert.deepEqual(P.readyWindowExams(EXAMS, 3, "2026-10-12").map(e => e.id), [], "exam day is not in the window");
  assert.deepEqual(P.readyWindowExams(EXAMS, 2, "2026-10-10").map(e => e.id), [], "Exam 3 doesn't cover Unit 2");

  // Already mastered: 1 correct in the window
  const mastered = play([["2026-10-01", true], ["2026-10-02", true]]).rec;
  const r1 = play([["2026-10-09", true]], 3, mastered);
  assert.equal(P.isExamReady(r1.rec, "exam-3"), true);
  assert.deepEqual(r1.last.ready, ["exam-3"]);

  // Not mastered: 2 correct in a row inside the window
  const a = play([["2026-10-09", true]]);
  assert.equal(P.isExamReady(a.rec, "exam-3"), false);
  const b = play([["2026-10-09", true], ["2026-10-10", true]]);
  assert.equal(P.isExamReady(b.rec, "exam-3"), true);
  assert.deepEqual(b.last.ready, ["exam-3"]);

  // A correct answer before the window doesn't count toward the 2
  const c = play([["2026-10-08", true], ["2026-10-09", true]]);
  assert.equal(c.rec.mastered, true, "mastered by 2 in a row overall");
  assert.equal(P.isExamReady(c.rec, "exam-3"), false, "but only 1 correct inside the window");

  // A wrong answer in the window clears it and now needs 2 in a row
  const d = play([["2026-10-01", true], ["2026-10-02", true], ["2026-10-09", true], ["2026-10-10", false], ["2026-10-10", true]]);
  assert.equal(P.isExamReady(d.rec, "exam-3"), false);
  const e = play([["2026-10-11", true]], 3, d.rec);
  assert.equal(P.isExamReady(e.rec, "exam-3"), true);

  // The ATI and Final windows overlap (Dec 4-6 and Dec 5-7): an answer counts toward both
  const f = play([["2026-12-01", true], ["2026-12-02", true], ["2026-12-05", true]], 2);
  assert.deepEqual(f.last.ready.sort(), ["ati", "final"]);

  // Windows for exams that are over are dropped
  const g = play([["2026-10-13", true]], 3, b.rec);
  assert.equal(g.rec.examReady["exam-3"], undefined);
});

test("Thanksgiving break (Nov 24-29) and the DST change don't break dates", () => {
  // Plain date math across month ends, the Nov 1 clock change, and the break
  assert.equal(P.addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(P.addDays("2026-11-01", 28), "2026-11-29");
  assert.equal(P.addDays("2026-11-30", -3), "2026-11-27");
  assert.equal(P.addDays("2026-11-24", 7), "2026-12-01");

  // Exam 6 (Mon Nov 30) is the next exam all through the break
  for (const d of ["2026-11-24", "2026-11-26", "2026-11-29"]) assert.equal(P.nextExam(EXAMS, d).id, "exam-6");

  // Its exam ready window (Nov 27-29) falls inside the break and still works
  assert.deepEqual(P.readyWindowExams(EXAMS, 6, "2026-11-27").map(e => e.id), ["exam-6"]);
  const r = play([["2026-11-27", true], ["2026-11-28", true]], 6);
  assert.equal(P.isExamReady(r.rec, "exam-6"), true);

  // Review due 3 days before Exam 6 (Nov 27), during the break
  const m = play([["2026-11-10", true], ["2026-11-11", true]], 6).rec;
  assert.equal(P.isReviewDue(m, 6, "2026-11-26", EXAMS), false);
  assert.equal(P.isReviewDue(m, 6, "2026-11-27", EXAMS), true);

  // A 4-week review landing in the break: mastered Oct 30 (Unit 2) -> due Nov 27
  const u2 = play([["2026-10-29", true], ["2026-10-30", true]], 2).rec;
  assert.equal(P.isReviewDue(u2, 2, "2026-11-26", EXAMS), false);
  assert.equal(P.isReviewDue(u2, 2, "2026-11-27", EXAMS), true);
});

test("next exam and smart session picking", () => {
  assert.equal(P.nextExam(EXAMS, "2026-10-16").id, "exam-4");
  assert.equal(P.nextExam(EXAMS, "2026-10-12").id, "exam-3", "an exam is still next on its own day");
  assert.equal(P.nextExam(EXAMS, "2026-12-09"), null);

  const q = (id, unit) => ({id, unit});
  const questions = [q("u3-new", 3), q("u3-mastered", 3), q("u3-journal", 3), q("u3-blind", 3), q("u3-bm", 3), q("u3-learning", 3), q("u3-lucky", 3), q("u2-blind", 2), q("u2-new", 2)];
  const store = {
    "u3-mastered": play([["2026-10-01", true], ["2026-10-02", true]]).rec,
    "u3-journal": play([["2026-10-01", false, false]]).rec,
    "u3-blind": play([["2026-10-01", false]]).rec,
    "u3-lucky": play([["2026-10-01", true, false]]).rec,
    "u3-bm": Object.assign(P.blankRecord(), {bookmarked: true}),
    "u3-learning": play([["2026-10-01", true]]).rec,
    "u2-blind": play([["2026-09-21", false]], 2).rec
  };
  // Oct 5: next exam is Exam 3 (Unit 3). Unit 3 questions come first, in priority order.
  const picked = P.pickSmart(questions, 7, store, "2026-10-05", EXAMS).map(x => x.id);
  assert.deepEqual(picked, ["u3-blind", "u3-new", "u3-journal", "u3-lucky", "u3-bm", "u3-learning", "u3-mastered"]);
  // Asking for more than Unit 3 has fills in from other units, also by priority
  const more = P.pickSmart(questions, 9, store, "2026-10-05", EXAMS).map(x => x.id);
  assert.deepEqual(more.slice(7), ["u2-blind", "u2-new"]);
  // Oct 9 is 3 days before Exam 3, so the mastered question is review due and moves up after bookmarked, ahead of still learning
  const due = P.pickSmart(questions, 7, store, "2026-10-09", EXAMS).map(x => x.id);
  assert.deepEqual(due, ["u3-blind", "u3-new", "u3-journal", "u3-lucky", "u3-bm", "u3-mastered", "u3-learning"]);
  // The Final covers every unit, so everything competes on priority
  const final = P.pickSmart(questions, 3, store, "2026-12-08", EXAMS).map(x => x.id);
  assert.deepEqual(final.slice(0, 2).sort(), ["u2-blind", "u3-blind"]);
});
