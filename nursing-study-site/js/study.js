/* My study (phase 5): the numbers behind My dashboard, Exam countdown, Progress, the Journal
   and the tracker homepage. Pure functions only (no page code), so they can be tested.
   Uses the progress rules in js/progress.js (status, review due, exam ready). */
(function(root){
  var P = typeof module !== "undefined" && module.exports ? require("./progress.js") : root.Progress;

  /* ---------- Dates ("YYYY-MM-DD", math in UTC so clock changes never shift a day) ---------- */
  function utc(d){ var p = d.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function daysBetween(a, b){ return Math.round((utc(b) - utc(a)) / 86400000); }
  function addDays(d, n){ return P.addDays(d, n); }
  /* Monday = 0 ... Sunday = 6 */
  function weekday(d){ return (new Date(utc(d)).getUTCDay() + 6) % 7; }
  function weekStart(d){ return addDays(d, -weekday(d)); }
  var DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  function shortDate(d){ var p = d.split("-"); return MONTHS[+p[1] - 1] + " " + (+p[2]); }
  function longDate(d){ return DAYS[weekday(d)] + " " + shortDate(d); }

  function inBreak(d, breaks){
    return (breaks || []).filter(function(b){ return d >= b.start && d <= b.end; })[0] || null;
  }

  /* ---------- Coverage, mastery and readiness ---------- */
  /* For any group of questions (a topic, a unit, an exam):
     coverage % = seen / all questions; mastery % = mastered / all questions (shown as "N of the
     ones you've seen" next to coverage, so a big bank doesn't make a student look behind);
     readiness = accuracy on answered questions, "Not enough data" until a fair share of the group
     has been answered (minSeen). */
  function stats(questions, store, today, exams){
    var s = {total: questions.length, mastered: 0, learning: 0, unseen: 0, seen: 0, answers: 0, correct: 0, due: 0, blind: 0};
    questions.forEach(function(q){
      var r = store[q.id];
      if (!r || !r.seen){ s.unseen++; return; }
      s.seen++;
      s.answers += r.seen;
      s.correct += r.correct || 0;
      if (r.mastered) s.mastered++; else s.learning++;
      if (P.isReviewDue(r, q.unit, today, exams)) s.due++;
      if (P.statusOf(r, q.unit, today, exams) === "blindspot") s.blind++;
    });
    s.accuracy = s.answers ? s.correct / s.answers : null;
    s.masteryPct = s.total ? Math.round(s.mastered / s.total * 100) : 0;
    s.coveragePct = s.total ? Math.round(s.seen / s.total * 100) : 0;
    s.readiness = readiness(s);
    return s;
  }
  /* A fair share: 20 questions, or half the group if that's smaller, but at least 5 (or all of
     a group with fewer than 5) */
  function minSeen(total){ return Math.min(total, Math.max(5, Math.min(20, Math.ceil(total / 2)))); }
  function readiness(s){
    if (!s.seen || s.seen < minSeen(s.total)) return "nodata";
    if (s.accuracy >= 0.85) return "strong";
    if (s.accuracy >= 0.75) return "ontrack";
    return "needswork";
  }
  var READINESS_LABEL = {strong: "Strong", ontrack: "On track", needswork: "Needs work", nodata: "Not enough data"};

  /* ---------- Priority groups ---------- */
  /* In the order today's plan works through them: blind spots, then never seen (coverage first),
     then the mistake journal, then the rest */
  var GROUPS = [
    {key: "blindspot", name: "Blind spots", sub: "Wrong, but you were sure"},
    {key: "new", name: "Never seen", sub: "See every question at least once"},
    {key: "journal", name: "Mistake journal", sub: "Missed last time"},
    {key: "luckyguess", name: "Lucky guesses", sub: "Right, but you guessed"},
    {key: "bookmarked", name: "Your bookmarks", sub: "Flagged as tricky"},
    {key: "reviewdue", name: "Due for review", sub: "Mastered, time for a refresher"},
    {key: "learning", name: "Still learning", sub: ""},
    {key: "mastered", name: "Mastered", sub: ""}
  ];
  /* During the exam ready window, review-due questions count as Mastered (every mastered
     question needs 1 correct then anyway). */
  function groupCounts(questions, store, today, exams, foldReview){
    var counts = {};
    GROUPS.forEach(function(g){ counts[g.key] = 0; });
    questions.forEach(function(q){
      var st = P.statusOf(store[q.id], q.unit, today, exams);
      if (foldReview && st === "reviewdue") st = "mastered";
      counts[st]++;
    });
    return counts;
  }

  /* Questions in priority order (blind spot first ... mastered last), shuffled within each group */
  function rank(questions, store, today, exams, n, random){
    random = random || Math.random;
    var order = P.STATUS_ORDER;
    return questions.map(function(q){
      return {q: q, r: order.indexOf(P.statusOf(store[q.id], q.unit, today, exams)), t: random()};
    }).sort(function(a, b){ return a.r - b.r || a.t - b.t; }).map(function(x){ return x.q; }).slice(0, n == null ? questions.length : n);
  }

  /* ---------- Next exam, plan and exam ready ---------- */
  function examUnitsQuestions(questions, exam){
    return exam ? questions.filter(function(q){ return exam.units.indexOf(q.unit) !== -1; }) : [];
  }
  /* The exam before the target (for "Since Exam 3"), or null */
  function previousExam(exams, target){
    var before = exams.filter(function(e){ return e.date < target.date; }).sort(function(a, b){ return a.date < b.date ? 1 : -1; });
    return before[0] || null;
  }

  /* ---------- Today's plan ----------
     The student picks a daily size (10, 20, 30 or 40; 30 by default), done in sets of 10. Any
     answers today count toward it.
     Before the exam ready window: coverage first. Blind spots, then never-seen questions, then
     the mistake journal and the rest, from the next exam's units. The pace line says whether that size reaches every
     question before the window opens.
     In the window (the 3 days before the exam): clear the weak spots in the exam's units, then
     take the readiness check. Exam ready = no weak spots left and a check score of 85% or more.
     When the next exam's unit has no questions yet, the plan reviews earlier units instead. */
  var DAILY_SIZES = [10, 20, 30, 40], DEFAULT_DAILY = 30, SET_SIZE = 10;
  var PLAN_ORDER = P.STATUS_ORDER;
  var CHECK_SIZE = 40, CHECK_READY = 0.85, CHECK_ALMOST = 0.75;
  function dailySize(n){ return DAILY_SIZES.indexOf(n) !== -1 ? n : DEFAULT_DAILY; }

  function planToday(questions, store, today, exams, opts){
    opts = opts || {};
    var size = dailySize(opts.size), done = opts.done || 0;
    var exam = P.nextExam(exams, today);
    if (!exam) return {exam: null, n: 0, fallback: true, size: size, done: done, target: 0};
    var windowStart = addDays(exam.date, -3);
    var inWindow = today >= windowStart && today < exam.date;
    var qs = examUnitsQuestions(questions, exam);
    var plan = {exam: exam, windowStart: windowStart, inWindow: inWindow, daysLeft: daysBetween(today, exam.date),
                fallback: false, size: size, done: done, step: "learn"};
    var weak = qs.filter(function(q){ return isWeak(store[q.id], q.unit, today, exams); }).length;
    plan.weak = weak;
    if (!qs.length){
      /* Nothing to learn for this exam yet: review what most needs it from earlier units */
      var urgent = groupCounts(questions, store, today, exams, false);
      var n = urgent.blindspot + urgent.journal + urgent.bookmarked + urgent.reviewdue + urgent.luckyguess;
      plan.fallback = true;
      plan.remaining = n;
      plan.target = Math.min(size, Math.max(n, questions.length ? SET_SIZE : 0));
    } else if (today === exam.date){
      plan.step = "examday"; plan.remaining = 0; plan.target = 0;
    } else if (inWindow){
      var check = bestCheck(opts.checks, exam, windowStart);
      plan.check = check;
      plan.remaining = weak;
      if (weak){ plan.step = "weak"; plan.target = Math.min(size, weak + done); }
      else { plan.step = check !== null && check >= CHECK_READY ? "ready" : "check"; plan.target = 0; }
    } else {
      var st = stats(qs, store, today, exams);
      plan.remaining = st.total - st.mastered;
      plan.unseen = st.unseen;
      plan.target = Math.min(size, plan.remaining + done);
      /* Pace: can this size reach every unseen question before the window opens? */
      var days = Math.max(1, daysBetween(today, windowStart));
      var capacity = Math.max(0, size - done) + size * (days - 1);
      plan.pace = {days: days, unseen: st.unseen, reach: Math.min(st.unseen, capacity), onPace: st.unseen <= capacity,
                   lastDay: addDays(windowStart, -1)};
    }
    plan.left = Math.max(0, (plan.target || 0) - done);
    plan.n = Math.min(SET_SIZE, plan.left);
    plan.sets = Math.ceil((plan.target || 0) / SET_SIZE);
    plan.setsDone = Math.min(plan.sets, Math.floor(done / SET_SIZE));
    plan.complete = (plan.target || 0) > 0 && plan.left === 0;
    return plan;
  }

  /* The next set: the next exam's units in plan order (weak spots only in the window), random
     within a group; other units fill in only before the window if the exam's units run short */
  function pickPlan(questions, n, store, today, exams, random){
    random = random || Math.random;
    var exam = P.nextExam(exams, today);
    var inWindow = exam && today >= addDays(exam.date, -3) && today < exam.date;
    var inUnit = function(q){ return !exam || exam.units.indexOf(q.unit) !== -1; };
    var ranked = function(list){
      return list.map(function(q){
        return {q: q, r: PLAN_ORDER.indexOf(P.statusOf(store[q.id], q.unit, today, exams)), t: random()};
      }).sort(function(a, b){ return a.r - b.r || a.t - b.t; }).map(function(x){ return x.q; });
    };
    if (inWindow) return ranked(questions.filter(function(q){ return inUnit(q) && isWeak(store[q.id], q.unit, today, exams); })).slice(0, n);
    var first = ranked(questions.filter(inUnit));
    var rest = first.length < n ? ranked(questions.filter(function(q){ return !inUnit(q); })) : [];
    return first.concat(rest).slice(0, n);
  }

  /* Readiness check: 40 questions from the exam's units, spread evenly over every topic and
     category (round robin, random inside each), so it samples the whole unit fairly */
  function readinessCheck(questions, exam, n, random){
    random = random || Math.random;
    n = n || CHECK_SIZE;
    var groups = {}, keys = [];
    examUnitsQuestions(questions, exam).forEach(function(q){
      var k = q.unit + "|" + q.topic + "|" + (q.category || "");
      if (!groups[k]){ groups[k] = []; keys.push(k); }
      groups[k].push(q);
    });
    var shuffle = function(a){ return a.map(function(x){ return {x: x, t: random()}; }).sort(function(p, q){ return p.t - q.t; }).map(function(p){ return p.x; }); };
    keys = shuffle(keys);
    keys.forEach(function(k){ groups[k] = shuffle(groups[k]); });
    var out = [];
    for (var i = 0; out.length < n; i++){
      var added = false;
      keys.forEach(function(k){ if (out.length < n && groups[k][i]){ out.push(groups[k][i]); added = true; } });
      if (!added) break;
    }
    return shuffle(out);
  }
  /* checks = {examId: [{date, correct, total}]}; the best score taken in this exam's window */
  function bestCheck(checks, exam, windowStart){
    var list = ((checks || {})[exam.id] || []).filter(function(c){ return c.date >= windowStart && c.date <= exam.date && c.total; });
    if (!list.length) return null;
    return Math.max.apply(null, list.map(function(c){ return c.correct / c.total; }));
  }
  function checkLabel(score){
    if (score === null || score === undefined) return "nodata";
    return score >= CHECK_READY ? "strong" : score >= CHECK_ALMOST ? "ontrack" : "needswork";
  }

  /* Exam ready numbers for the window view */
  function examReady(questions, store, exam){
    var qs = examUnitsQuestions(questions, exam);
    var out = {total: qs.length, ready: 0, mastered: 0, notMastered: 0};
    qs.forEach(function(q){
      var r = store[q.id];
      if (P.isExamReady(r, exam.id)) out.ready++;
      else if (r && r.mastered) out.mastered++;
      else out.notMastered++;
    });
    return out;
  }

  /* ---------- Weak spots quiz ----------
     Blind spots first, then the rest of the Mistake journal, then lucky guesses (up to 40). */
  var WEAK_MAX = 40;
  function isWeak(rec, unit, today, exams){
    var st = P.statusOf(rec, unit, today, exams);
    return st === "blindspot" || st === "journal" || st === "luckyguess" || !!(rec && rec.journal);
  }
  function weakSpotsQuiz(questions, store, today, exams, random){
    var weak = questions.filter(function(q){ return isWeak(store[q.id], q.unit, today, exams); });
    return rank(weak, store, today, exams, WEAK_MAX, random);
  }

  /* ---------- Weekly goal and streaks ----------
     activity = {deviceId: {date: answers}} (each device counts its own answers). */
  function dailyTotals(activity){
    var out = {};
    Object.keys(activity || {}).forEach(function(dev){
      var days = activity[dev] || {};
      Object.keys(days).forEach(function(d){ out[d] = (out[d] || 0) + days[d]; });
    });
    return out;
  }
  function weekProgress(totals, goal, start){
    var questions = 0, days = 0;
    for (var i = 0; i < 7; i++){
      var n = totals[addDays(start, i)] || 0;
      questions += n;
      if (n > 0) days++;
    }
    var done = goal.type === "days" ? days : questions;
    return {questions: questions, days: days, done: done, target: goal.value, met: done >= goal.value};
  }
  /* What kind of week starts on `start`:
       "semester": hit grows the streak, miss resets it
       "break":    a holiday break (inside the semester, like Thanksgiving, or after it ends). Never
                   counts on its own: with "keep my goal during holiday breaks" off it's skipped;
                   on, hitting the weekly goal grows the streak and missing it only pauses */
  function weekKind(start, semester){
    var end = addDays(start, 6);
    if (end < semester.start) return "before";
    if (start > semester.end) return "break";
    for (var i = 0; i < 7; i++) if (inBreak(addDays(start, i), semester.breaks)) return "break";
    return "semester";
  }
  /* Busy week pass: one per month (by the week's Monday), keeps the streak without counting the week */
  function passesLeft(busyWeeks, today){
    var month = today.slice(0, 7);
    return (busyWeeks || []).some(function(w){ return w.slice(0, 7) === month; }) ? 0 : 1;
  }
  function streaks(totals, goal, today, semester, busyWeeks, goalOnBreaks){
    var cur = 0, best = 0, thisWeek = weekStart(today);
    var start = weekStart(semester.start);
    for (var w = start; w < thisWeek; w = addDays(w, 7)){
      var kind = weekKind(w, semester);
      if (kind === "before") continue;
      if ((busyWeeks || []).indexOf(w) !== -1) continue;              // pass used: paused
      if (kind === "break" && !goalOnBreaks) continue;                // holiday break, goal off: skipped
      var met = weekProgress(totals, goal, w).met;
      if (met){ cur++; best = Math.max(best, cur); }
      else if (kind === "semester") cur = 0;                          // break weeks only pause
    }
    /* This week counts as soon as the goal is met; until then it can't break the streak */
    var kindNow = weekKind(thisWeek, semester);
    var progress = kindNow === "break" && !goalOnBreaks ? null : weekProgress(totals, goal, thisWeek);
    var withThis = cur + (progress && progress.met && (busyWeeks || []).indexOf(thisWeek) === -1 ? 1 : 0);
    return {current: withThis, best: Math.max(best, withThis), week: progress, kind: kindNow};
  }

  /* ---------- Exam average (private) ---------- */
  function grade(exams, scores, grading){
    var graded = exams.filter(function(e){ return e.graded; });
    var earned = 0, logged = 0, possible = 0;
    graded.forEach(function(e){
      possible += e.points;
      if (scores && typeof scores[e.id] === "number"){ earned += scores[e.id]; logged += e.points; }
    });
    var left = possible - logged;
    var needPts = grading.passingPoints - earned;
    return {
      earned: earned, logged: logged, possible: possible, left: left,
      pct: logged ? Math.round(earned / logged * 100) : null,
      needPoints: Math.max(0, needPts),
      needPct: left ? Math.round(Math.max(0, needPts) / left * 100) : null,
      passed: earned >= grading.passingPoints,
      passPct: grading.passingPercent
    };
  }

  /* ---------- Countdown strip (tracker homepage) ----------
     One square per day from the day after the last exam through the next one (the next exam,
     then the ATI, then the Final). */
  function strip(exams, semester, today){
    var target = P.nextExam(exams, today);
    if (!target) return null;
    var prev = previousExam(exams, target);
    var first = prev ? addDays(prev.date, 1) : semester.start;
    var windowStart = addDays(target.date, -3);
    var days = [];
    for (var d = first; d <= target.date; d = addDays(d, 1)){
      days.push({
        date: d,
        letter: DAY_LETTERS[weekday(d)],
        past: d < today,
        today: d === today,
        window: d >= windowStart && d < target.date,
        exam: d === target.date,
        brk: !!inBreak(d, semester.breaks)
      });
    }
    var breaks = (semester.breaks || []).filter(function(b){ return b.end >= first && b.start <= target.date; });
    return {target: target, prev: prev, days: days, daysLeft: daysBetween(today, target.date), breaks: breaks};
  }

  /* ---------- Semester recap (after the semester ends) ---------- */
  function recap(questions, store, totals, streak, gradeInfo){
    var answered = Object.keys(totals).reduce(function(n, d){ return n + totals[d]; }, 0);
    var mastered = questions.filter(function(q){ var r = store[q.id]; return r && r.mastered; }).length;
    return {answered: answered, mastered: mastered, best: streak.best, examPct: gradeInfo.pct};
  }

  var api = {
    daysBetween: daysBetween, addDays: addDays, weekday: weekday, weekStart: weekStart,
    shortDate: shortDate, longDate: longDate, inBreak: inBreak,
    stats: stats, readiness: readiness, READINESS_LABEL: READINESS_LABEL,
    GROUPS: GROUPS, groupCounts: groupCounts, rank: rank, examUnitsQuestions: examUnitsQuestions, previousExam: previousExam,
    planToday: planToday, examReady: examReady, isWeak: isWeak, weakSpotsQuiz: weakSpotsQuiz,
    minSeen: minSeen, DAILY_SIZES: DAILY_SIZES, DEFAULT_DAILY: DEFAULT_DAILY, SET_SIZE: SET_SIZE, dailySize: dailySize,
    pickPlan: pickPlan, readinessCheck: readinessCheck, bestCheck: bestCheck, checkLabel: checkLabel,
    CHECK_SIZE: CHECK_SIZE, CHECK_READY: CHECK_READY, CHECK_ALMOST: CHECK_ALMOST,
    dailyTotals: dailyTotals, weekProgress: weekProgress, weekKind: weekKind, passesLeft: passesLeft, streaks: streaks,
    grade: grade, strip: strip, recap: recap
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Study = api;
})(this);
