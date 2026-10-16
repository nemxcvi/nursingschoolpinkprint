/* Progress tracking on this device. All progress code lives here so it can be
   encrypted and synced later.

   On only while tracking is on (a code saved on this device, see js/tracking.js); nothing is
   written for guests. ?today=YYYY-MM-DD pretends it's another day (handy for testing exam
   windows, tracked devices only); ?today=off goes back to the real date.

   Progress is one object in localStorage "pinkprint-progress", keyed by question ID:
     seen, correct, wrong   times answered / fully correct / not fully correct
     streak                 correct in a row (a wrong answer resets it to 0)
     missStreak             wrong in a row
     lastAnswered           "YYYY-MM-DD", the day it was last answered
     lastCorrect, lastSure  how the latest answer went, and whether it was "I'm sure" (true),
                            "I guessed" (false) or not marked (null: the Sure / Guessed tap was off,
                            or the answer came from a guest session)
                            (wrong + sure = blind spot, right + guessed = lucky guess)
     lastWrong              {date, picked: [option ids], sure} for the latest wrong answer
     mastered, masteredOn   2 correct in a row; a wrong answer un-masters it
     bookmarked
     journal                in the mistake journal: added on a miss, leaves after 2 correct in a row
     resolved               left the mistake journal by being mastered (shown under Resolved)
     note                   the "My note" text, if any
     examReady              {examId: {base, streak, ready}} for the last 3 days before each exam */
(function(){
  var STORE_KEY = "pinkprint-progress";
  var TODAY_KEY = "pinkprint-today";
  var MASTER_STREAK = 2;        // correct in a row to master a question
  var JOURNAL_EXIT_STREAK = 2;  // correct in a row to leave the mistake journal
  var REVIEW_BEFORE_EXAM = 3;   // a mastered question comes due this many days before its exam
  var REVIEW_EVERY = 28;        // ...and then every 4 weeks after it was last answered correctly
  var READY_WINDOW = 3;         // exam ready window: the last 3 days before an exam (not the exam day)

  /* Status priority, highest first. Review-due mastered questions sit right after bookmarked. */
  var STATUS_ORDER = ["blindspot", "journal", "bookmarked", "reviewdue", "luckyguess", "new", "learning", "mastered"];

  /* ---------- Dates: plain "YYYY-MM-DD" strings, math done in UTC so DST never shifts a day ---------- */
  function toUTC(d){ var p = d.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function fromUTC(ms){ return new Date(ms).toISOString().slice(0, 10); }
  function addDays(d, n){ return fromUTC(toUTC(d) + n * 86400000); }
  function localToday(){
    var n = new Date();
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
  }

  /* ---------- Exams ---------- */
  function covers(exam, unit){ return exam.units.indexOf(unit) !== -1; }
  function sortedExams(exams){ return exams.slice().sort(function(a, b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }); }

  /* The next exam on or after today (an exam is still "next" on its own day) */
  function nextExam(exams, today){
    var list = sortedExams(exams);
    for (var i = 0; i < list.length; i++) if (list[i].date >= today) return list[i];
    return null;
  }

  /* Exams covering this unit whose exam ready window (the 3 days before) includes today */
  function readyWindowExams(exams, unit, today){
    return sortedExams(exams).filter(function(e){
      return covers(e, unit) && today >= addDays(e.date, -READY_WINDOW) && today < e.date;
    });
  }

  /* ---------- Records ---------- */
  function blankRecord(){
    return {seen: 0, correct: 0, wrong: 0, streak: 0, missStreak: 0, lastAnswered: null,
            mastered: false, masteredOn: null, bookmarked: false, journal: false, examReady: {}};
  }

  /* Apply one answer. `correct` means fully correct (SATA and drag-drop are all-or-nothing);
     `sure` is true for "I'm sure", false for "I guessed" (a lucky guess still counts toward
     mastery) and null when not marked. `picked` is the chosen option ids, kept for wrong answers.
     Returns the updated record and what changed: {mastered, journaled, ready: [examIds]}. */
  function applyAnswer(rec, correct, today, unit, exams, sure, picked){
    var r = JSON.parse(JSON.stringify(rec || blankRecord()));
    if (!r.examReady) r.examReady = {};
    var events = {mastered: false, journaled: false, ready: []};
    var wasMastered = r.mastered;

    /* Exam ready windows open with the state the question was in before this answer */
    var windows = exams ? readyWindowExams(exams, unit, today) : [];
    windows.forEach(function(e){
      if (!r.examReady[e.id]) r.examReady[e.id] = {base: wasMastered ? "mastered" : "learning", streak: 0, ready: false};
    });

    r.seen++;
    r.lastAnswered = today;
    r.lastCorrect = !!correct;
    r.lastSure = sure === true || sure === false ? sure : null;
    if (correct){
      r.correct++;
      r.streak++;
      r.missStreak = 0;
      if (!r.mastered && r.streak >= MASTER_STREAK){
        r.mastered = true; r.masteredOn = today; events.mastered = true;
      }
      if (r.journal && r.streak >= JOURNAL_EXIT_STREAK){ r.journal = false; r.resolved = true; }
    } else {
      r.wrong = (r.wrong || 0) + 1;
      r.streak = 0;
      r.missStreak++;
      r.mastered = false; r.masteredOn = null;
      r.lastWrong = {date: today, picked: picked || [], sure: r.lastSure};
      r.resolved = false;
      if (!r.journal){ r.journal = true; events.journaled = true; }
    }

    /* Mastered going in: 1 correct in the window. Not mastered: 2 correct in a row in the window.
       A wrong answer in the window clears it, and the question now needs 2 in a row. */
    windows.forEach(function(e){
      var w = r.examReady[e.id];
      if (correct){
        w.streak++;
        var needed = w.base === "mastered" ? 1 : 2;
        if (!w.ready && w.streak >= needed){ w.ready = true; events.ready.push(e.id); }
      } else {
        w.streak = 0; w.base = "learning"; w.ready = false;
      }
    });

    /* Forget windows for exams that are over */
    if (exams){
      exams.forEach(function(e){ if (r.examReady[e.id] && e.date < today) delete r.examReady[e.id]; });
    }
    return {record: r, events: events};
  }

  /* A mastered question comes due 3 days before each exam covering its unit (the Final covers
     all of them), unless it was answered correctly since then. Otherwise it comes due 4 weeks
     after it was last answered correctly. A mastered question's last answer is always correct,
     so lastAnswered is the last correct date. */
  function isReviewDue(rec, unit, today, exams){
    if (!rec || !rec.mastered || !rec.lastAnswered) return false;
    var last = rec.lastAnswered;
    var examDue = (exams || []).some(function(e){
      var start = addDays(e.date, -REVIEW_BEFORE_EXAM);
      return covers(e, unit) && today >= start && today <= e.date && last < start;
    });
    return examDue || today >= addDays(last, REVIEW_EVERY);
  }

  function statusOf(rec, unit, today, exams){
    if (!rec) return "new";
    if (rec.lastCorrect === false && rec.lastSure === true) return "blindspot";
    if (rec.journal) return "journal";
    if (rec.bookmarked) return "bookmarked";
    if (isReviewDue(rec, unit, today, exams)) return "reviewdue";
    if (rec.lastCorrect === true && rec.lastSure === false) return "luckyguess";
    if (!rec.seen) return "new";
    if (!rec.mastered) return "learning";
    return "mastered";
  }

  function isExamReady(rec, examId){
    return !!(rec && rec.examReady && rec.examReady[examId] && rec.examReady[examId].ready);
  }

  /* Smart session: questions from the units of the next exam, in status priority order
     (random within a status). Other units fill in only when there aren't enough. */
  function pickSmart(questions, count, store, today, exams, random){
    random = random || Math.random;
    var exam = nextExam(exams, today);
    var inUnit = function(q){ return !exam || covers(exam, q.unit); };
    function ranked(list){
      return list.map(function(q){
        return {q: q, rank: STATUS_ORDER.indexOf(statusOf(store[q.id], q.unit, today, exams)), tie: random()};
      }).sort(function(a, b){ return a.rank - b.rank || a.tie - b.tie; }).map(function(x){ return x.q; });
    }
    var first = ranked(questions.filter(inUnit));
    var rest = first.length < count ? ranked(questions.filter(function(q){ return !inUnit(q); })) : [];
    return first.concat(rest).slice(0, count);
  }

  var api = {
    STATUS_ORDER: STATUS_ORDER,
    addDays: addDays, nextExam: nextExam, readyWindowExams: readyWindowExams,
    blankRecord: blankRecord, applyAnswer: applyAnswer, isReviewDue: isReviewDue,
    statusOf: statusOf, isExamReady: isExamReady, pickSmart: pickSmart
  };

  if (typeof module !== "undefined" && module.exports){ module.exports = api; return; }

  /* ---------- Browser: flag, storage and data loading ---------- */
  function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v){ try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }

  api.enabled = function(){ return typeof Tracking !== "undefined" && Tracking.isOn(); };

  var params = new URLSearchParams(location.search);
  if (params.has("today") && api.enabled()) lsSet(TODAY_KEY, /^\d{4}-\d{2}-\d{2}$/.test(params.get("today")) ? params.get("today") : null);

  api.today = function(){ return lsGet(TODAY_KEY) || localToday(); };

  api.load = function(){
    try { return JSON.parse(lsGet(STORE_KEY)) || {}; } catch (e) { return {}; }
  };
  /* Guests never get anything written */
  api.save = function(store){ if (api.enabled()) lsSet(STORE_KEY, JSON.stringify(store)); };
  api.get = function(id){ return api.load()[id] || null; };

  /* Exams and the list of unit files, fetched once per page */
  var dataCache = null;
  api.init = function(dataBase){
    if (!dataCache){
      var get = function(f){ return fetch(dataBase + f).then(function(r){ if (!r.ok) throw new Error(f + ": HTTP " + r.status); return r.json(); }); };
      dataCache = Promise.all([get("exams.json"), get("index.json")]).then(function(res){
        api.exams = res[0].exams;
        api.dataBase = dataBase;
        api.units = res[1].units;
        return api;
      });
    }
    return dataCache;
  };

  api.record = function(q, correct, sure, picked){
    var store = api.load();
    var res = applyAnswer(store[q.id], correct, api.today(), q.unit, api.exams || [], sure, picked);
    store[q.id] = res.record;
    api.save(store);
    return res.events;
  };

  api.toggleBookmark = function(id){
    var store = api.load();
    var r = store[id] || blankRecord();
    r.bookmarked = !r.bookmarked;
    store[id] = r;
    api.save(store);
    return r.bookmarked;
  };

  /* Set by a later phase once the Mistake journal page exists; until then it's plain text */
  api.JOURNAL_URL = null;

  api.status = function(q){
    return statusOf(api.get(q.id), q.unit, api.today(), api.exams || []);
  };

  api.setNote = function(id, text){
    var store = api.load();
    var r = store[id] || blankRecord();
    if (text.trim()) r.note = text; else delete r.note;
    store[id] = r;
    api.save(store);
  };

  /* Smart session picking, kept for My dashboard in a later phase */
  api.pick = function(questions, count){
    return pickSmart(questions, count, api.load(), api.today(), api.exams || []);
  };

  api.examName = function(id){
    var e = (api.exams || []).filter(function(x){ return x.id === id; })[0];
    return e ? e.name : id;
  };

  window.Progress = api;
})();
