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

  /* ---------- Readiness and mastery ---------- */
  /* For any group of questions (a topic, a unit, an exam):
     mastery % = mastered / all questions; readiness = accuracy on answered questions,
     "Not enough data" until 5 different questions have been answered. */
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
    s.readiness = readiness(s);
    return s;
  }
  function readiness(s){
    if (s.seen < 5) return "nodata";
    if (s.accuracy >= 0.85) return "strong";
    if (s.accuracy >= 0.75) return "ontrack";
    return "needswork";
  }
  var READINESS_LABEL = {strong: "Strong", ontrack: "On track", needswork: "Needs work", nodata: "Not enough data"};

  /* ---------- Priority groups ---------- */
  var GROUPS = [
    {key: "blindspot", name: "Blind spots", sub: "Wrong, but you were sure"},
    {key: "journal", name: "Mistake journal", sub: "Missed last time"},
    {key: "bookmarked", name: "Your bookmarks", sub: "Flagged as tricky"},
    {key: "reviewdue", name: "Due for review", sub: "Mastered, time for a refresher"},
    {key: "luckyguess", name: "Lucky guesses", sub: "Right, but you guessed"},
    {key: "new", name: "Never seen", sub: ""},
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

  /* Today's plan: spread the not-yet-mastered questions of the next exam's units over the days
     left before its exam ready window (recomputed each day, so a missed day re-spreads). In the
     window, spread the not-yet-exam-ready ones over the days left. When the next exam's unit has
     no questions yet, the plan reviews earlier units instead. */
  function planToday(questions, store, today, exams){
    var exam = P.nextExam(exams, today);
    if (!exam) return {exam: null, n: 0, fallback: true};
    var windowStart = addDays(exam.date, -3);
    var inWindow = today >= windowStart && today < exam.date;
    var qs = examUnitsQuestions(questions, exam);
    var plan = {exam: exam, windowStart: windowStart, inWindow: inWindow, daysLeft: daysBetween(today, exam.date), fallback: false};
    if (!qs.length){
      /* Nothing to learn for this exam yet: review what most needs it from earlier units */
      var urgent = groupCounts(questions, store, today, exams, false);
      var n = urgent.blindspot + urgent.journal + urgent.bookmarked + urgent.reviewdue + urgent.luckyguess;
      plan.fallback = true;
      plan.n = Math.min(20, Math.max(n, questions.length ? 10 : 0));
      plan.remaining = n;
      return plan;
    }
    if (inWindow){
      var notReady = qs.filter(function(q){ return !P.isExamReady(store[q.id], exam.id); }).length;
      plan.remaining = notReady;
      plan.n = Math.min(notReady, Math.ceil(notReady / Math.max(1, daysBetween(today, exam.date))));
    } else if (today === exam.date){
      plan.remaining = 0; plan.n = 0;
    } else {
      var notMastered = qs.filter(function(q){ var r = store[q.id]; return !(r && r.mastered); }).length;
      plan.remaining = notMastered;
      plan.n = Math.min(notMastered, Math.ceil(notMastered / Math.max(1, daysBetween(today, windowStart))));
    }
    return plan;
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

  /* ---------- Weak spots ----------
     Missed last time first (most misses first), then lowest accuracy; fills with
     still-learning questions if short. */
  function weakSpots(questions, store, n){
    var acc = function(r){ return r.seen ? (r.correct || 0) / r.seen : 1; };
    var seen = questions.filter(function(q){ var r = store[q.id]; return r && r.seen; });
    var missed = seen.filter(function(q){ return store[q.id].lastCorrect === false; })
      .sort(function(a, b){ var ra = store[a.id], rb = store[b.id]; return (rb.wrong || 0) - (ra.wrong || 0) || acc(ra) - acc(rb); });
    var lowAcc = seen.filter(function(q){ var r = store[q.id]; return r.lastCorrect !== false && !r.mastered && acc(r) < 1; })
      .sort(function(a, b){ return acc(store[a.id]) - acc(store[b.id]); });
    var learning = seen.filter(function(q){ var r = store[q.id]; return !r.mastered && missed.indexOf(q) === -1 && lowAcc.indexOf(q) === -1; });
    return missed.concat(lowAcc, learning).slice(0, n);
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
       "bonus":    a break inside the semester (Thanksgiving): hit grows it, miss only pauses
       "break":    after the semester: with a break goal, hit grows it and miss pauses; without one, it pauses */
  function weekKind(start, semester){
    var end = addDays(start, 6);
    if (end < semester.start) return "before";
    if (start > semester.end) return "break";
    for (var i = 0; i < 7; i++) if (inBreak(addDays(start, i), semester.breaks)) return "bonus";
    return "semester";
  }
  /* Busy week pass: one per month (by the week's Monday), keeps the streak without counting the week */
  function passesLeft(busyWeeks, today){
    var month = today.slice(0, 7);
    return (busyWeeks || []).some(function(w){ return w.slice(0, 7) === month; }) ? 0 : 1;
  }
  function streaks(totals, goal, today, semester, busyWeeks, breakGoal){
    var cur = 0, best = 0, thisWeek = weekStart(today);
    var start = weekStart(semester.start);
    for (var w = start; w < thisWeek; w = addDays(w, 7)){
      var kind = weekKind(w, semester);
      if (kind === "before") continue;
      if ((busyWeeks || []).indexOf(w) !== -1) continue;              // pass used: paused
      var g = kind === "break" ? breakGoal : goal;
      if (!g){ continue; }                                            // break without a goal: paused
      var met = weekProgress(totals, g, w).met;
      if (met){ cur++; best = Math.max(best, cur); }
      else if (kind === "semester") cur = 0;                          // bonus/break weeks only pause
    }
    /* This week counts as soon as the goal is met; until then it can't break the streak */
    var kindNow = weekKind(thisWeek, semester);
    var gNow = kindNow === "break" ? breakGoal : goal;
    var progress = gNow ? weekProgress(totals, gNow, thisWeek) : null;
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
    planToday: planToday, examReady: examReady, weakSpots: weakSpots,
    dailyTotals: dailyTotals, weekProgress: weekProgress, weekKind: weekKind, passesLeft: passesLeft, streaks: streaks,
    grade: grade, strip: strip, recap: recap
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Study = api;
})(this);
