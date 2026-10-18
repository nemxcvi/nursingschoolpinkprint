/* My study pages (phase 5): My dashboard, Exam countdown, Progress, Journal, and the tracker
   homepage. Numbers come from js/study.js; progress from js/progress.js; settings from
   js/tracking.js. Styles from design/source Main, Exam, Mastery, Journal, SiteTracked. */
var MyStudy = (function(){
  var S = Study, P = Progress, T = Tracking;
  var ROOT = T.ROOT;
  var SLIDERS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>';
  var PREFIX_RE = /^\s*(correct|incorrect|not quite|missed)\s*[.!:—–-]\s*/i;

  function esc(s){ return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function plural(n, one, many){ return n + " " + (n === 1 ? one : (many || one + "s")); }
  function pct(n){ return Math.round(n * 100) + "%"; }

  /* ---------- Data ---------- */
  function load(){
    var base = ROOT + "data/nur114/";
    var getJSON = function(f){ return fetch(base + f).then(function(r){ if (!r.ok) throw new Error(f); return r.json(); }); };
    return Promise.all([P.init(base), getJSON("exams.json")]).then(function(r){
      var ex = r[1];
      return Promise.all(P.units.map(function(n){ return getJSON("unit-" + n + ".json"); })).then(function(units){
        var questions = [];
        units.forEach(function(u){ questions = questions.concat(u.questions); });
        var d = {exams: ex.exams, semester: ex.semester, grading: ex.grading, units: units, questions: questions,
                 store: P.load(), today: P.today(), state: T.state()};
        ensureKnownCounts(d);
        return d;
      });
    });
  }

  /* Unit names and codes for every unit, including ones without questions yet (from site-data.js) */
  function siteUnit(n){
    var units = SITE.getSheet("nur114").units;
    return units.filter(function(u){ return u.num === n; })[0] || {num: n, code: "U-0" + n, name: "Unit " + n, slug: ""};
  }
  function unitData(d, n){ return d.units.filter(function(u){ return u.unit === n; })[0] || null; }
  function topicQuestions(u, t){ return u.questions.filter(function(q){ return q.topic === t.topic; }); }
  function topicKey(u, t){ return u.unit + ":" + t.slug; }

  /* "12 new questions" labels: compare each topic's question count with the last time seen.
     The first visit just records today's counts. */
  function ensureKnownCounts(d){
    if (d.state.knownCounts && Object.keys(d.state.knownCounts).length) return;
    var known = {};
    d.units.forEach(function(u){ u.topics.forEach(function(t){ known[topicKey(u, t)] = topicQuestions(u, t).length; }); });
    T.update({knownCounts: known});
    d.state = T.state();
  }
  function newCount(d, u, t){
    var known = (d.state.knownCounts || {})[topicKey(u, t)];
    var now = topicQuestions(u, t).length;
    return known === undefined ? now : Math.max(0, now - known);
  }

  function examTitle(exam){
    if (exam.units.length > 1) return exam.name + " · All units";
    return exam.name + " · " + siteUnit(exam.units[0]).name;
  }
  function examSub(exam){
    return S.longDate(exam.date) + " · " + (exam.units.length > 1 ? "All units" : "Unit " + exam.units[0]);
  }

  /* ---------- Shared pieces ---------- */
  /* My study header: the site menu at the left (assets/header.js in "menu" mode, loaded after the
     page script), brand, My study links, then Settings and night mode at the right (icons; Settings
     is also in the menu). Built once; later calls only refresh the links (e.g. after the Challenges
     switch changes). */
  var MOON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  var SUN = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  function isDark(){ return document.documentElement.getAttribute("data-theme") === "dark"; }
  function header(active){
    var items = [["dashboard", "Dashboard", "dashboard.html"], ["journal", "Journal", "journal.html"]];
    if (T.feature("challenges")) items.push(["challenges", "Challenges", "challenges.html"]);
    items.push(["library", "Library", "library.html"]);
    var links = items.map(function(i){
      return '<a href="' + i[2] + '"' + (i[0] === active ? ' class="is-current" aria-current="page"' : "") + ">" + i[1] + "</a>";
    }).join("");
    var host = document.getElementById("ms-header");
    var nav = host.querySelector(".ms-nav");
    if (nav && host.querySelector(".ms-hdr-right")){ nav.innerHTML = links; return; }
    host.className = "tp-header ms-header";
    host.innerHTML = '<div class="ms-hdr-left"><div id="site-header" data-mode="menu"></div>' +
      '<a class="tp-brand" href="./">Nursing School <span>Pinkprint</span></a></div>' +
      '<nav class="ms-nav" aria-label="My study">' + links + "</nav>" +
      '<div class="ms-hdr-right"><a class="iconbtn ms-settings' + (active === "settings" ? " is-current" : "") + '" href="settings.html" aria-label="Settings" title="Settings"' +
      (active === "settings" ? ' aria-current="page"' : "") + ">" + SLIDERS.replace(/width="18" height="18"/, 'width="22" height="22"') + "</a>" +
      '<button type="button" class="iconbtn ms-theme" aria-label="Toggle dark mode">' + (isDark() ? SUN : MOON) + "</button></div>";
    host.querySelector(".ms-theme").addEventListener("click", function(e){
      var dark = !isDark();
      if (dark) document.documentElement.setAttribute("data-theme", "dark"); else document.documentElement.removeAttribute("data-theme");
      try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (err) {}
      e.currentTarget.innerHTML = dark ? SUN : MOON;
    });
  }

  /* Mastery bar: exam ready (window only), mastered, still learning, not seen (white) */
  function bar(st, opts){
    opts = opts || {};
    var total = st.total || 1, ready = opts.ready || 0;
    var segs = [["is-ready", ready], ["is-mastered", st.mastered - ready], ["is-learning", st.learning]];
    return '<span class="ms-bar' + (opts.thin ? " is-thin" : "") + '" role="img" aria-label="' + st.masteryPct + ' percent mastered">' +
      segs.filter(function(s){ return s[1] > 0; }).map(function(s){
        return '<span class="' + s[0] + '" style="width:' + (s[1] / total * 100) + '%"></span>';
      }).join("") + "</span>";
  }
  function legend(withReady){
    return '<div class="ms-legend">' +
      (withReady ? '<span><i class="is-ready"></i>Exam ready (3 days before an exam)</span>' : "") +
      '<span><i class="is-mastered"></i>Mastered (2 right in a row)</span><span><i class="is-learning"></i>Still learning</span><span><i class="is-unseen"></i>Not seen</span></div>';
  }
  function readyTag(key){ return '<span class="ms-ready is-' + key + '">' + S.READINESS_LABEL[key] + "</span>"; }
  function accText(st){ return (st.readiness === "nodata" || st.accuracy === null ? "—" : pct(st.accuracy)) + " · " + st.seen + " of " + st.total; }

  /* Topic (or unit) table: name, mastery bar, readiness, correct · seen, Practice */
  function table(rows, opts){
    opts = opts || {};
    return '<div class="ms-table">' +
      '<div class="ms-thead"><span class="c-name">' + (opts.first || "Topic") + '</span><span class="c-bar">Mastery</span><span class="c-ready">Readiness</span><span class="c-acc">Correct · seen</span><span class="c-go"></span></div>' +
      rows.map(function(r){
        return '<div class="ms-row' + (r.highlight ? " is-low" : "") + '">' +
          '<span class="c-name">' + esc(r.name) + (r.newCount ? ' <span class="ms-new">' + plural(r.newCount, "new question") + "</span>" : "") + "</span>" +
          '<span class="c-bar">' + bar(r.st, {ready: r.ready, thin: true}) + '<span class="c-pct">' + r.st.masteryPct + "%</span></span>" +
          '<span class="c-ready">' + readyTag(r.st.readiness) + "</span>" +
          '<span class="c-acc">' + accText(r.st) + "</span>" +
          '<span class="c-go">' + (r.href ? '<a href="' + r.href + '">Practice →</a>' : "") + "</span></div>";
      }).join("") + "</div>";
  }
  function topicRows(d, u, opts){
    opts = opts || {};
    return u.topics.map(function(t){
      var qs = topicQuestions(u, t);
      var st = S.stats(qs, d.store, d.today, d.exams);
      return {name: t.topic, st: st, href: ROOT + t.quiz, newCount: newCount(d, u, t),
              ready: opts.exam ? S.examReady(qs, d.store, opts.exam).ready : 0};
    });
  }

  function tiles(d){
    var missed = d.questions.filter(function(q){ var r = d.store[q.id]; return r && r.seen && r.lastCorrect === false; }).length;
    var weak = S.weakSpots(d.questions, d.store, 20).length;
    var journal = d.questions.filter(function(q){ var r = d.store[q.id]; return r && r.journal; }).length;
    var marks = d.questions.filter(function(q){ var r = d.store[q.id]; return r && r.bookmarked; });
    var notes = marks.filter(function(q){ return d.store[q.id].note; }).length;
    var t = [
      ["session.html?mode=weak", "Weak spots quiz", weak ? (missed ? "Your " + weak + " most-missed" : plural(weak, "question") + " to firm up") : "Nothing missed yet"],
      ["journal.html?tab=mistakes", "Mistake journal", journal ? journal + " to review" : "Nothing to review"],
      ["journal.html?tab=bookmarks", "Bookmarks", marks.length ? marks.length + " saved · " + notes + " with notes" : "None saved yet"]
    ];
    if (T.feature("challenges")){
      /* Saved challenges from the last 7 days (links expire after 7 days) */
      var week = Date.now() - 7 * 24 * 3600 * 1000;
      var open = T.challenges().filter(function(c){ return (c.at || 0) > week; }).length;
      t.push(["challenges.html", "Challenges", open ? plural(open, "challenge") + " this week" : "Send a friend the same questions"]);
    }
    return '<section class="ms-tiles" aria-label="Study tools">' + t.map(function(x){
      return '<a class="ms-tile" href="' + x[0] + '"><span class="ms-tile-title">' + x[1] + '</span><span class="ms-tile-sub">' + esc(x[2]) + "</span></a>";
    }).join("") + "</section>";
  }

  /* ---------- My dashboard ---------- */
  function dashboard(d, host){
    var st = d.state, plan = S.planToday(d.questions, d.store, d.today, d.exams);
    var html = '<section class="tp-intro tp-intro-tight"><div class="tp-eyebrow">NUR 114 · ' + esc(S.longDate(d.today)) + '</div>' +
      '<h1 class="tp-h1 ms-welcome">Welcome back, ' + esc(st.nickname) + "</h1></section>";

    var top = "";
    if (d.today > d.semester.end) top += recapCard(d);
    else if (T.feature("countdown") && plan.exam) top += examCard(d, plan);
    if (T.feature("goal")) top += weekCard(d);
    if (top) html += '<section class="ms-toprow">' + top + "</section>";
    html += tiles(d);
    html += currentUnitCard(d, plan);
    if (T.feature("grade")) html += gradeCard(d);
    host.innerHTML = html;
    wireDashboard(d, host);
  }

  function examCard(d, plan){
    var exam = plan.exam, n = plan.n;
    var sub;
    if (plan.fallback) sub = siteUnit(exam.units[0]).name + " questions are coming soon, so today's plan reviews earlier units.";
    else if (plan.inWindow) sub = "Exam ready window: " + plural(plan.daysLeft, "day") + " left";
    else if (plan.daysLeft === 0) sub = "Exam day. Good luck!";
    else sub = "Exam ready window opens " + S.longDate(plan.windowStart);
    return '<div class="ms-card ms-exam">' +
      '<div class="ms-exam-top"><div class="tp-stack"><div class="tp-eyebrow">Next exam</div><h2 class="ms-h2">' + esc(examTitle(exam)) + '</h2><div class="ms-sub">' + esc(examSub(exam)) + "</div></div>" +
      '<div class="ms-days"><div class="ms-bignum">' + (plan.daysLeft === 0 ? "Today" : plan.daysLeft) + "</div>" + (plan.daysLeft === 0 ? "" : '<div class="ms-sub">' + (plan.daysLeft === 1 ? "day left" : "days left") + "</div>") + "</div></div>" +
      '<div class="ms-exam-foot"><div class="tp-stack"><div class="ms-plan">' + (n ? "Today's plan: " + plural(n, "question") : "Today's plan: all caught up") + '</div><div class="tp-hint">' + esc(sub) + "</div></div>" +
      '<div class="ms-btns">' + (n ? '<a class="ms-btn is-primary" href="session.html?mode=today">Start today\'s ' + n + " →</a>" : "") +
      '<a class="ms-btn" href="exam.html">Exam plan</a></div></div></div>';
  }

  function weekCard(d){
    var st = d.state, goal = st.goal || T.DEFAULT_GOAL;
    var totals = S.dailyTotals(st.activity);
    var s = S.streaks(totals, goal, d.today, d.semester, st.busyWeeks || [], T.goalOnBreaks());
    var w = s.week;
    var month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+d.today.slice(5, 7) - 1];
    var left = S.passesLeft(st.busyWeeks, d.today);
    var thisWeek = S.weekStart(d.today);
    var passUsed = (st.busyWeeks || []).indexOf(thisWeek) !== -1;
    var body;
    if (!w){
      var q = S.weekProgress(totals, {type: "questions", value: 1}, thisWeek).questions;
      body = '<div class="ms-weeknum"><span class="ms-bignum">' + q + '</span><span class="ms-sub">' + (q === 1 ? "question" : "questions") + ' this week</span></div><p class="tp-hint">Holiday break: your streak is paused this week. You turned off weekly goals during breaks in Settings.</p>';
    } else {
      var unit = goal.type === "days" ? (w.target === 1 ? "study day" : "study days") : "questions";
      body = '<div class="ms-weeknum"><span class="ms-bignum">' + w.done + '</span><span class="ms-sub">of ' + w.target + " " + unit + "</span></div>" +
        '<div class="ms-goalbar" role="img" aria-label="' + Math.min(100, Math.round(w.done / w.target * 100)) + ' percent of weekly goal"><span style="width:' + Math.min(100, w.done / w.target * 100) + '%"></span></div>' +
        (s.kind === "break" ? '<p class="tp-hint">Holiday break: hitting your goal grows your streak; missing it only pauses it.</p>' : "");
    }
    var canPass = w && !w.met && left > 0 && !passUsed && s.kind === "semester";
    if (w && w.met && st.celebratedWeek !== thisWeek){ T.update({celebratedWeek: thisWeek}); setTimeout(T.celebrate, 300); }
    return '<div class="ms-card ms-week"><div class="tp-eyebrow">This week</div>' + body +
      '<div class="ms-kv"><div><span>Streak</span><strong>' + plural(s.current, "week") + "</strong></div>" +
      "<div><span>Best streak</span><strong>" + plural(s.best, "week") + "</strong></div>" +
      "<div><span>Busy week pass</span><strong>" + (passUsed ? "Used this week" : (left ? "1 left in " + month : "Used in " + month)) + "</strong></div></div>" +
      (canPass ? '<button type="button" class="ms-linkbtn" id="ms-usepass">Use this week\'s busy week pass</button>' : "") + "</div>";
  }

  function recapCard(d){
    var st = d.state, totals = S.dailyTotals(st.activity);
    var s = S.streaks(totals, st.goal || T.DEFAULT_GOAL, d.today, d.semester, st.busyWeeks || [], T.goalOnBreaks());
    var r = S.recap(d.questions, d.store, totals, s, S.grade(d.exams, st.scores || {}, d.grading));
    return '<div class="ms-card ms-exam"><div class="tp-eyebrow">Semester recap · NUR 114</div><h2 class="ms-h2">You finished the semester</h2>' +
      '<div class="ms-recap"><div><span class="ms-bignum">' + r.answered + '</span><span class="ms-sub">questions answered</span></div>' +
      '<div><span class="ms-bignum">' + r.mastered + '</span><span class="ms-sub">questions mastered</span></div>' +
      '<div><span class="ms-bignum">' + r.best + '</span><span class="ms-sub">best streak (weeks)</span></div>' +
      (T.feature("grade") ? '<div><span class="ms-bignum">' + (r.examPct === null ? "—" : r.examPct + "%") + '</span><span class="ms-sub">exam average</span></div>' : "") + "</div></div>";
  }

  function currentUnitCard(d, plan){
    var exam = plan.exam;
    var units = exam ? exam.units : d.units.map(function(u){ return u.unit; });
    var head, body;
    if (units.length === 1){
      var su = siteUnit(units[0]), u = unitData(d, units[0]);
      head = '<span class="tp-eyebrow">Current unit' + (exam ? " · " + esc(exam.name) + " on " + esc(S.shortDate(exam.date)) : "") + '</span><h2 class="ms-h2">Unit ' + su.num + " · " + esc(su.name) + "</h2>";
      if (!u) body = '<p class="tp-hint">Questions for this unit are coming soon. Until then, keep earlier units fresh with today\'s plan and your Mistake journal.</p>';
      else {
        var st = S.stats(u.questions, d.store, d.today, d.exams);
        var ready = plan.inWindow ? S.examReady(u.questions, d.store, exam).ready : 0;
        body = '<div class="ms-unitbar"><div class="ms-unitbar-top"><span>Unit mastery</span><strong>' + st.masteryPct + "% mastered</strong></div>" + bar(st, {ready: ready}) + legend(plan.inWindow) + "</div>" +
          table(topicRows(d, u, {exam: plan.inWindow ? exam : null}));
      }
    } else {
      head = '<span class="tp-eyebrow">All units' + (exam ? " · " + esc(exam.name) + " on " + esc(S.shortDate(exam.date)) : "") + '</span><h2 class="ms-h2">All units</h2>';
      var all = S.stats(d.questions, d.store, d.today, d.exams);
      var readyAll = plan.inWindow ? S.examReady(d.questions, d.store, exam).ready : 0;
      body = '<div class="ms-unitbar"><div class="ms-unitbar-top"><span>Overall mastery</span><strong>' + all.masteryPct + "% mastered</strong></div>" + bar(all, {ready: readyAll}) + legend(plan.inWindow) + "</div>" +
        table(d.units.map(function(u){
          return {name: "Unit " + u.unit + " · " + u.name, st: S.stats(u.questions, d.store, d.today, d.exams), href: ROOT + siteUnit(u.unit).slug + "mix-quiz.html",
                  ready: plan.inWindow ? S.examReady(u.questions, d.store, exam).ready : 0};
        }), {first: "Unit"});
    }
    /* The link sits on the eyebrow line (like Edit scores) so the title keeps the full width */
    head = head.replace("</span>", '</span><a class="ms-linkbtn ms-toplink" href="journal.html">All units<span class="ms-wide"> in Progress</span></a></div>');
    return '<section class="ms-card ms-current"><div class="tp-stack"><div class="ms-grade-top">' + head + "</div>" + body + "</section>";
  }

  /* Exam average (only on this person's devices) */
  var editingScores = false;
  function gradeCard(d){
    var scores = d.state.scores || {}, g = S.grade(d.exams, scores, d.grading);
    var graded = d.exams.filter(function(e){ return e.graded; });
    var rows = "";
    graded.forEach(function(e){
      var has = typeof scores[e.id] === "number";
      var past = e.date <= d.today;
      var name = '<span class="g-name">' + esc(e.name) + '</span><span class="g-date">' + esc(S.shortDate(e.date)) + "</span>";
      if (editingScores && (has || past)){
        rows += '<div class="g-row is-input">' + name + '<span class="g-pts">' + (has ? (+scores[e.id].toFixed(2)) : "—") + " / " + e.points + "</span>" +
          '<span class="g-pct"><input class="ms-score" data-exam="' + e.id + '" inputmode="decimal" placeholder="Score" aria-label="' + esc(e.name) + ' score in percent" value="' + (has ? scorePct(scores[e.id], e.points) : "") + '"><span class="g-of">%</span></span></div>';
      } else if (has){
        rows += '<div class="g-row">' + name + '<span class="g-pts">' + (+scores[e.id].toFixed(2)) + " / " + e.points + '</span><span class="g-pct">' + scorePct(scores[e.id], e.points) + "%</span></div>";
      } else {
        rows += '<div class="g-row is-future">' + name + '<span class="g-pts">— / ' + e.points + '</span><span class="g-pct">—</span></div>';
      }
    });
    var above = g.pct !== null && g.pct >= g.passPct;
    var need;
    if (g.passed) need = "You've already earned the points to pass.";
    else if (g.needPct === null) need = "";
    else if (g.needPct > 100) need = "You'd need more than 100% on everything left to reach " + g.passPct + "%. Talk with your instructor about your options.";
    else need = "To pass, you need about <strong>" + g.needPct + "%</strong> on everything left.";
    var saveBtns = editingScores ? '<div class="ms-btns ms-grade-save"><button type="button" class="ms-btn is-small" id="ms-cancelscores">Cancel</button><button type="button" class="ms-btn is-small is-primary" id="ms-savescores">Save</button></div>' : "";
    var parts = '<div class="ms-grade-left">' +
      '<div class="ms-grade-big"><span class="ms-bignum">' + (g.pct === null ? "—" : g.pct + "%") + "</span>" +
      (g.pct === null ? '<span class="ms-sub">Use Edit scores to log your first exam</span>' : '<span class="ms-pass ' + (above ? "is-above" : "is-below") + '">' + (above ? "Above" : "Below") + " the " + g.passPct + "% to pass</span>") + "</div>" +
      '<div class="ms-gradebar" role="img" aria-label="Exam average with the ' + g.passPct + ' percent passing line marked"><span style="width:' + (g.pct || 0) + '%"></span><i style="left:' + g.passPct + '%"></i></div>' +
      '<div class="ms-gradelabel"><span style="left:' + g.passPct + '%">' + g.passPct + "% to pass</span></div>" +
      (need ? '<p class="ms-need">' + need + "</p>" : "") +
      '<p class="tp-hint">' + (g.passed ? "" : g.needPoints + " of the " + g.left + " points left · ") + "Exams 1–6 are 100 points each, the final is 300</p></div>" +
      '<div class="ms-grade-right"><div class="g-row g-head"><span class="g-name">Exam</span><span class="g-date">Date</span><span class="g-pts">Points</span><span class="g-pct">Score</span></div>' + rows + saveBtns + "</div>";
    return '<section class="ms-card ms-grade"><div class="tp-stack ms-grade-head">' +
      '<div class="ms-grade-top"><span class="tp-eyebrow">Exam average</span>' + (editingScores ? "" : '<button type="button" class="ms-linkbtn" id="ms-editscores">Edit scores</button>') + "</div>" +
      '<h2 class="ms-h2">Your grade so far</h2><span class="tp-hint">Just a reminder that only you can see this.</span></div>' +
      '<div class="ms-grade-body">' + parts + '</div><p class="tp-note hidden" id="ms-scoremsg" role="status"></p></section>';
  }

  /* Scores are saved as points; students type them as a percent */
  function scorePct(points, total){ return Math.round(points / total * 1000) / 10; }

  function wireDashboard(d, host){
    var rerender = function(){ d.state = T.state(); dashboard(d, host); };
    var pass = document.getElementById("ms-usepass");
    if (pass) pass.addEventListener("click", function(){
      T.update({busyWeeks: (d.state.busyWeeks || []).concat([S.weekStart(d.today)])});
      rerender();
    });
    var edit = document.getElementById("ms-editscores");
    if (edit) edit.addEventListener("click", function(){ editingScores = true; rerender(); });
    var cancel = document.getElementById("ms-cancelscores");
    if (cancel) cancel.addEventListener("click", function(){ editingScores = false; rerender(); });
    function readScores(){
      var scores = {}, bad = null;
      Object.keys(d.state.scores || {}).forEach(function(k){ scores[k] = d.state.scores[k]; });
      host.querySelectorAll(".ms-score").forEach(function(inp){
        var id = inp.getAttribute("data-exam");
        var exam = d.exams.filter(function(e){ return e.id === id; })[0];
        var v = inp.value.trim();
        if (v === ""){ delete scores[id]; return; }
        var n = Number(v);
        if (!isFinite(n) || n < 0 || n > 100) bad = exam;
        else scores[id] = Math.round(n * exam.points) / 100;
      });
      if (bad){
        var msg = document.getElementById("ms-scoremsg");
        msg.textContent = "Enter " + bad.name + " as a percent from 0 to 100.";
        msg.classList.remove("hidden");
        return null;
      }
      return scores;
    }
    var save = document.getElementById("ms-savescores");
    if (save) save.addEventListener("click", function(){
      var s = readScores();
      if (!s) return;
      T.update({scores: s});
      editingScores = false; rerender();
    });
  }

  /* ---------- Exam countdown / exam plan ---------- */
  function examPage(d, host){
    var exam = P.nextExam(d.exams, d.today);
    if (!exam){
      host.innerHTML = '<section class="tp-intro"><a class="ms-back" href="dashboard.html">← Dashboard</a><h1 class="tp-h1">No exams left</h1><p class="tp-lede">That\'s the end of the NUR 114 exams. Your recap is on My dashboard.</p></section>';
      return;
    }
    var plan = S.planToday(d.questions, d.store, d.today, d.exams);
    var qs = S.examUnitsQuestions(d.questions, exam);
    var topics = [];
    exam.units.forEach(function(n){ var u = unitData(d, n); if (u) u.topics.forEach(function(t){ topics.push({u: u, t: t}); }); });
    var html = '<section class="tp-intro tp-intro-tight"><a class="ms-back" href="dashboard.html">← Dashboard</a>' +
      '<div class="tp-eyebrow">Exam ready window · ' + esc(S.longDate(plan.windowStart)) + '</div><h1 class="tp-h1">' + esc(examTitle(exam)) + "</h1>" +
      '<div class="ms-sub">' + esc(examSub(exam)) + (qs.length ? " · " + plural(topics.length, "topic") + " · " + plural(qs.length, "question") : "") + "</div></section>";
    if (!qs.length){
      html += '<section class="ms-card"><p class="tp-hint">' + esc(siteUnit(exam.units[0]).name) + " questions are coming soon. Until then, today's plan reviews earlier units.</p>" +
        (plan.n ? '<div class="ms-btns"><a class="ms-btn is-primary" href="session.html?mode=today">Start today\'s ' + plan.n + " →</a></div>" : "") + "</section>";
      host.innerHTML = html;
      return;
    }
    var counts = S.groupCounts(qs, d.store, d.today, d.exams, plan.inWindow);
    var days = plan.daysLeft;
    if (plan.inWindow || days === 0){
      var r = S.examReady(qs, d.store, exam);
      var togo = r.total - r.ready;
      html += '<section class="ms-card ms-examtop"><div class="ms-days-left"><span class="ms-bignum">' + days + '</span><span class="ms-sub">' + (days === 1 ? "day left" : "days left") + "</span></div>" +
        '<div class="ms-examprog"><div class="ms-examprog-top"><h2 class="ms-h2">' + r.ready + " of " + r.total + ' exam ready</h2><span class="ms-sub">' + togo + " to go" + (days ? " · about " + Math.ceil(togo / days) + " a day" : "") + "</span></div>" +
        '<span class="ms-bar is-tall"><span class="is-ready" style="width:' + (r.ready / r.total * 100) + '%"></span><span class="is-mastered" style="width:' + (r.mastered / r.total * 100) + '%"></span></span>' +
        '<div class="ms-keys"><div><i class="is-ready"></i><span class="k-title"><strong>' + r.ready + "</strong> exam ready</span><span class=\"k-sub\">Done for this exam</span></div>" +
        '<div><i class="is-mastered"></i><span class="k-title"><strong>' + r.mastered + "</strong> mastered</span><span class=\"k-sub\">Answer right once to make exam ready</span></div>" +
        '<div><i class="is-unseen"></i><span class="k-title"><strong>' + r.notMastered + "</strong> not mastered yet</span><span class=\"k-sub\">Answer right twice in a row to make exam ready</span></div></div></div>" +
        (togo ? '<a class="ms-btn is-primary is-big" href="session.html?mode=examready">Start exam ready session →</a>' : "") + "</section>";
    } else {
      var st = S.stats(qs, d.store, d.today, d.exams);
      var left = st.total - st.mastered;
      var before = S.daysBetween(d.today, plan.windowStart);
      html += '<section class="ms-card ms-examtop"><div class="ms-days-left"><span class="ms-bignum">' + days + '</span><span class="ms-sub">' + (days === 1 ? "day left" : "days left") + "</span></div>" +
        '<div class="ms-examprog"><div class="ms-examprog-top"><h2 class="ms-h2">' + st.mastered + " of " + st.total + ' mastered</h2><span class="ms-sub">' + left + " to go · about " + Math.ceil(left / Math.max(1, before)) + " a day until " + esc(S.longDate(plan.windowStart)) + "</span></div>" +
        bar(st, {}) +
        '<div class="ms-keys"><div><i class="is-mastered"></i><span class="k-title"><strong>' + st.mastered + "</strong> mastered</span><span class=\"k-sub\">2 right in a row</span></div>" +
        '<div><i class="is-learning"></i><span class="k-title"><strong>' + st.learning + "</strong> still learning</span><span class=\"k-sub\">Seen, not mastered yet</span></div>" +
        '<div><i class="is-unseen"></i><span class="k-title"><strong>' + st.unseen + "</strong> not seen</span><span class=\"k-sub\">Spread over the days before the window</span></div></div></div>" +
        (plan.n ? '<a class="ms-btn is-primary is-big" href="session.html?mode=today">Start today\'s ' + plan.n + " →</a>" : "") + "</section>";
    }
    var groups = S.GROUPS.filter(function(g){ return !(plan.inWindow && g.key === "reviewdue"); });
    var i = 0;
    html += '<section class="ms-split"><div class="ms-card ms-groups"><h2 class="ms-h2">Up next, riskiest first</h2><p class="tp-hint">Sessions work down this list. Questions are shuffled within each group.</p><ol>' +
      groups.map(function(g){
        i++;
        var sub = g.key === "mastered" && plan.inWindow ? "1 correct answer each" : g.sub;
        return '<li><span class="g-num">' + i + '</span><span class="g-text"><strong>' + g.name + "</strong>" + (sub ? "<span>" + sub + "</span>" : "") + '</span><span class="g-count">' + counts[g.key] + "</span></li>";
      }).join("") + "</ol></div>";
    var rows = topics.map(function(x){ return {t: x.t, st: S.stats(topicQuestions(x.u, x.t), d.store, d.today, d.exams)}; });
    var lowest = rows.filter(function(r){ return r.st.readiness === "needswork"; }).sort(function(a, b){ return a.st.accuracy - b.st.accuracy; })[0];
    html += '<div class="ms-card ms-confidence"><div class="ms-confidence-head"><h2 class="ms-h2">Confidence check</h2><span class="ms-sub">Based on your answers so far</span></div>' +
      '<div class="ms-ctable"><div class="ms-thead"><span class="c-name">Topic</span><span class="c-ready">Readiness</span><span class="c-acc">Correct · seen</span></div>' +
      rows.map(function(r){
        return '<div class="ms-row' + (r === lowest ? " is-low" : "") + '"><span class="c-name">' + esc(r.t.topic) + '</span><span class="c-ready">' + readyTag(r.st.readiness) + '</span><span class="c-acc">' + accText(r.st) + "</span></div>";
      }).join("") + "</div>" +
      '<div class="ms-meaning"><span class="tp-label">What readiness means</span><div>' + readyTag("strong") + "<span>85% or more correct</span>" + readyTag("ontrack") + "<span>75–84%</span></div>" +
      "<div>" + readyTag("needswork") + "<span>Under 75%</span>" + readyTag("nodata") + "<span>Fewer than 5 answered</span></div></div></div></section>";
    host.innerHTML = html;
  }

  /* ---------- Progress (the Journal's first tab) ---------- */
  var openUnits = {};
  function progressTotals(d){
    var all = S.stats(d.questions, d.store, d.today, d.exams);
    return '<div class="ms-totals"><div><span class="ms-total">' + all.mastered + '<small> / ' + all.total + '</small></span><span class="ms-sub">Mastered</span></div>' +
      (T.feature("review") ? '<div><span class="ms-total">' + all.due + '</span><span class="ms-sub">Due for review</span></div>' : "") +
      '<div><span class="ms-total is-blind">' + all.blind + '</span><span class="ms-sub">Blind spots</span></div></div>';
  }
  function progressBody(d){
    var exam = P.nextExam(d.exams, d.today);
    var inWindow = exam && d.today >= S.addDays(exam.date, -3) && d.today < exam.date;
    var showDue = T.feature("review");
    var html = legend(inWindow);
    html += '<section class="ms-card ms-units">' + d.units.map(function(u){
      var st = S.stats(u.questions, d.store, d.today, d.exams);
      var ready = inWindow && exam.units.indexOf(u.unit) !== -1 ? S.examReady(u.questions, d.store, exam).ready : 0;
      var open = !!openUnits[u.unit];
      var btn = showDue && st.due ? '<a class="ms-btn is-small" href="session.html?mode=review&unit=' + u.unit + '">Review ' + st.due + " due</a>"
        : '<button type="button" class="ms-btn is-small' + (open ? " is-primary" : "") + '" data-unit="' + u.unit + '" aria-expanded="' + open + '">' + (open ? "Hide topics" : "Show topics") + "</button>";
      return '<div class="ms-unit" id="unit-' + u.unit + '"><div class="ms-unit-row">' +
        '<button type="button" class="ms-unit-name" data-unit="' + u.unit + '" aria-expanded="' + open + '"><span class="ms-sub">' + siteUnit(u.unit).code + " · " + plural(u.questions.length, "question") + "</span><span class=\"ms-unit-title\">" + esc(u.name) + "</span></button>" +
        bar(st, {ready: ready}) + '<strong class="ms-unit-pct">' + st.masteryPct + "%</strong>" + btn + "</div>" +
        (open ? '<div class="ms-topics">' + table(topicRows(d, u, {exam: ready ? exam : null})) + "</div>" : "") + "</div>";
    }).join("") + "</section>";
    return html;
  }
  function topicOf(d, q){
    var u = unitData(d, q.unit);
    return u ? u.topics.filter(function(t){ return t.topic === q.topic; })[0] : null;
  }

  /* ---------- Journal: Progress, Mistake journal and Bookmarks ---------- */
  var journalState = {tab: "progress", scrollTo: "", unit: "", topic: "", sort: "missed", showResolved: false};
  function letterIndex(id){ return "abcdefghijklmnopqrstuvwxyz".indexOf(String(id)); }
  function optionTexts(q, ids){ return (ids || []).map(function(id){ var o = q.options[letterIndex(id)]; return o ? o.text : ""; }).filter(Boolean); }
  function correctTexts(q){ return q.options.filter(function(o){ return o.correct; }).map(function(o){ return o.text; }); }
  function rationale(q){
    if (q.explanation) return q.explanation;
    return q.options.filter(function(o){ return o.correct && o.rationale; }).map(function(o){ return o.rationale.replace(PREFIX_RE, ""); }).join(" ");
  }

  function journalCard(d, q, kind){
    var r = d.store[q.id] || {}, t = topicOf(d, q);
    var status = P.statusOf(r, q.unit, d.today, d.exams);
    var tags = (status === "blindspot" ? '<span class="pq-tag-blind">Blind spot</span>' : "") + (r.bookmarked && kind === "journal" ? '<span class="ms-tag">Bookmarked</span>' : "");
    var meta = r.wrong ? "Missed " + r.wrong + "×" + (r.lastWrong ? " · Last " + S.shortDate(r.lastWrong.date) : "") : (r.seen ? plural(r.seen, "answer") : "Not answered yet");
    var lw = r.lastWrong || {};
    var mine = optionTexts(q, lw.picked);
    var sure = lw.sure === true ? " · You were sure" : lw.sure === false ? " · You guessed" : "";
    return '<article class="ms-card ms-jcard"><div class="ms-jtop"><span class="ms-jwhere">' + siteUnit(q.unit).code + " · " + esc(t ? t.topic : q.topic) + '</span><span class="ms-jmeta">' + tags + "<span>" + esc(meta) + "</span></span></div>" +
      '<h3 class="ms-jq">' + esc(q.prompt) + "</h3>" +
      '<div class="ms-jans">' + (kind === "journal" && mine.length ? '<div class="ms-jmine"><span class="tp-label">Your answer' + sure + "</span><span>" + esc(mine.join("; ")) + "</span></div>" : "") +
      '<div class="ms-jright"><span class="tp-label">Correct answer</span><span>' + esc(correctTexts(q).join("; ")) + "</span></div></div>" +
      (rationale(q) ? '<p class="ms-jwhy">' + esc(rationale(q)) + "</p>" : "") +
      (r.note && T.feature("notes") ? '<div class="ms-jnote"><span class="tp-label">My note</span><span>' + esc(r.note) + "</span></div>" : "") + "</article>";
  }

  function journalPage(d, host){
    var js = journalState;
    var inJournal = d.questions.filter(function(q){ var r = d.store[q.id]; return r && r.journal; });
    var resolved = d.questions.filter(function(q){ var r = d.store[q.id]; return r && r.resolved && !r.journal; });
    var marks = d.questions.filter(function(q){ var r = d.store[q.id]; return r && r.bookmarked; });
    var list = js.tab === "bookmarks" ? marks : inJournal;
    var filtered = list.filter(function(q){ return (!js.unit || q.unit === +js.unit) && (!js.topic || q.topic === js.topic); });
    var order = {};
    d.questions.forEach(function(q, i){ order[q.id] = i; });
    var rec = function(q){ return d.store[q.id] || {}; };
    if (js.sort === "missed") filtered.sort(function(a, b){ return (rec(b).wrong || 0) - (rec(a).wrong || 0) || order[a.id] - order[b.id]; });
    else if (js.sort === "recent") filtered.sort(function(a, b){ var x = (rec(a).t || 0), y = (rec(b).t || 0); return y - x; });
    else filtered.sort(function(a, b){ return order[a.id] - order[b.id]; });

    var unitOpts = d.units.map(function(u){ return '<option value="' + u.unit + '"' + (+js.unit === u.unit ? " selected" : "") + ">Unit " + u.unit + " · " + esc(u.name) + "</option>"; }).join("");
    var topicList = [];
    d.units.forEach(function(u){ if (!js.unit || u.unit === +js.unit) u.topics.forEach(function(t){ topicList.push(t.topic); }); });
    var topicOpts = topicList.map(function(t){ return '<option value="' + esc(t) + '"' + (js.topic === t ? " selected" : "") + ">" + esc(t) + "</option>"; }).join("");
    var scope = (js.unit ? "&unit=" + js.unit : "") + (js.topic ? "&topic=" + encodeURIComponent(js.topic) : "");
    var quizHref = "session.html?mode=" + (js.tab === "journal" ? "journal" : "bookmarks") + scope;
    /* Blind spots (wrong while sure) get their own quiz on the Mistakes tab, following the same filters */
    var blind = js.tab !== "journal" ? [] : d.questions.filter(function(q){
      return (!js.unit || q.unit === +js.unit) && (!js.topic || q.topic === js.topic) && P.statusOf(d.store[q.id], q.unit, d.today, d.exams) === "blindspot";
    });
    var noun = js.tab === "journal" ? ["mistake", "mistakes"] : ["bookmark", "bookmarks"];
    var term = (+d.semester.start.slice(5, 7) >= 8 ? "Fall " : "Spring ") + d.semester.start.slice(0, 4);
    var isProgress = js.tab === "progress";
    var tab = function(key, label){ return '<button type="button" role="tab" data-tab="' + key + '" aria-selected="' + (js.tab === key) + '"' + (js.tab === key ? ' class="is-on"' : "") + ">" + label + "</button>"; };
    var html = '<section class="ms-journal-head"><div class="tp-stack"><div class="tp-eyebrow">' + (isProgress ? "NUR 114 · " + term : "Review before exams") + '</div><h1 class="tp-h1">Journal</h1></div>' +
      (isProgress ? progressTotals(d) : filtered.length || blind.length ? '<div class="ms-jbtns">' +
        (filtered.length ? '<a class="ms-btn is-primary is-big" href="' + quizHref + '">Quiz my ' + filtered.length + " " + (filtered.length === 1 ? noun[0] : noun[1]) + " →</a>" : "") +
        (blind.length ? '<a class="ms-btn is-blind is-big" href="session.html?mode=blind' + scope + '">Quiz my ' + plural(blind.length, "blind spot") + " →</a>" : "") + "</div>" : "") + "</section>" +
      '<div class="ms-tabs" role="tablist">' + tab("progress", "Progress") + tab("journal", "Mistakes · " + inJournal.length) + tab("bookmarks", "Bookmarks · " + marks.length) + "</div>";
    if (isProgress){
      host.innerHTML = html + progressBody(d);
      bindJournal(d, host);
      host.querySelectorAll("[data-unit]").forEach(function(b){
        b.addEventListener("click", function(){
          var n = +b.getAttribute("data-unit");
          openUnits[n] = !openUnits[n];
          journalPage(d, host);
        });
      });
      if (js.scrollTo){
        var el = document.getElementById(js.scrollTo);
        js.scrollTo = "";
        if (el) el.scrollIntoView();
      }
      return;
    }
    html += '<div class="ms-filters"><label><span class="tp-label">Unit</span><select id="j-unit"><option value="">All units</option>' + unitOpts + "</select></label>" +
      '<label><span class="tp-label">Topic</span><select id="j-topic"><option value="">All topics</option>' + topicOpts + "</select></label>" +
      '<label><span class="tp-label">Sort</span><select id="j-sort"><option value="missed"' + (js.sort === "missed" ? " selected" : "") + ">Most missed</option>" +
      '<option value="recent"' + (js.sort === "recent" ? " selected" : "") + ">Most recent</option><option value=\"unit\"" + (js.sort === "unit" ? " selected" : "") + ">Unit order</option></select></label></div>";
    html += filtered.length ? filtered.map(function(q){ return journalCard(d, q, js.tab); }).join("")
      : '<p class="ms-empty">' + (js.tab === "journal" ? (inJournal.length ? "Nothing matches these filters." : "No mistakes to review. Every missed question shows up here until you master it.") : (marks.length ? "Nothing matches these filters." : "No bookmarks yet. Tap Bookmark on any quiz question to save it here.")) + "</p>";
    if (js.tab === "journal" && resolved.length){
      html += '<section class="ms-resolved"><div class="ms-resolved-head"><span><strong>Resolved · ' + resolved.length + "</strong> " + (resolved.length === 1 ? "question you've" : "questions you've") + ' mastered since missing ' + (resolved.length === 1 ? "it" : "them") + '</span><button type="button" class="ms-btn is-small" id="j-resolved">' + (js.showResolved ? "Hide" : "Show") + "</button></div>" +
        (js.showResolved ? resolved.map(function(q){ return journalCard(d, q, "resolved"); }).join("") : "") + "</section>";
    }
    host.innerHTML = html;
    bindJournal(d, host);
    document.getElementById("j-unit").addEventListener("change", function(e){ js.unit = e.target.value; js.topic = ""; journalPage(d, host); });
    document.getElementById("j-topic").addEventListener("change", function(e){ js.topic = e.target.value; journalPage(d, host); });
    document.getElementById("j-sort").addEventListener("change", function(e){ js.sort = e.target.value; journalPage(d, host); });
    var rb = document.getElementById("j-resolved");
    if (rb) rb.addEventListener("click", function(){ js.showResolved = !js.showResolved; journalPage(d, host); });
  }
  /* Tabs; the address keeps the open tab so refresh and Back stay on it */
  var TAB_PARAM = {progress: "", journal: "mistakes", bookmarks: "bookmarks"};
  function bindJournal(d, host){
    host.querySelectorAll("[data-tab]").forEach(function(b){
      b.addEventListener("click", function(){
        var js = journalState;
        js.tab = b.getAttribute("data-tab");
        js.sort = js.tab === "journal" ? "missed" : "recent";
        try { history.replaceState(null, "", "journal.html" + (TAB_PARAM[js.tab] ? "?tab=" + TAB_PARAM[js.tab] : "")); } catch (e) {}
        journalPage(d, host);
      });
    });
  }

  /* ---------- Tracker homepage: countdown strip and the current unit ---------- */
  function home(d){
    var plan = S.planToday(d.questions, d.store, d.today, d.exams);
    var currentUnits = plan.exam ? plan.exam.units : [];
    if (T.feature("countdown")){
      var s = S.strip(d.exams, d.semester, d.today);
      var quote = document.querySelector(".pp-quote");
      if (s && quote && !document.getElementById("pp-strip")){
        var a = document.createElement("a");
        a.id = "pp-strip";
        a.className = "pp-strip";
        a.href = "exam.html";
        var brk = s.breaks[0];
        var left = "Since " + (s.prev ? s.prev.name : "the semester started") + (brk ? " · " + brk.name + " " + S.shortDate(brk.start) + "–" + (brk.end.slice(0, 7) === brk.start.slice(0, 7) ? +brk.end.slice(8) : S.shortDate(brk.end)) : "");
        var days = s.days.map(function(x){
          var cls = x.exam ? "is-exam" : x.today ? "is-today" : x.past ? "is-past" : x.window ? "is-window" : "";
          if (x.brk && !x.exam) cls += x.window ? " is-break is-window" : " is-break";
          return '<span class="pp-day"><span class="pp-sq ' + cls + '"></span><span class="pp-dl' + (x.today || x.exam ? " is-strong" : "") + '">' + x.letter + "</span></span>";
        }).join("");
        var tags = brk ? '<span class="pp-strip-tags"><span>Break</span><span class="is-ready">Exam ready</span></span>' : '<span class="is-ready">Exam ready window ▾</span>';
        a.setAttribute("aria-label", s.target.name + " in " + plural(s.daysLeft, "day") + ", " + S.longDate(s.target.date) + ". Open the exam plan.");
        a.innerHTML = '<span class="pp-strip-main"><span class="pp-strip-top"><span>' + esc(left) + "</span>" + tags + '</span><span class="pp-days">' + days + "</span></span>" +
          '<span class="pp-strip-count"><span class="pp-strip-num">' + s.daysLeft + '</span><span class="pp-strip-text"><span>' + (s.daysLeft === 1 ? "day" : "days") + " to " + esc(s.target.name) + "</span>" +
          '<span class="pp-strip-link">' + esc(S.longDate(s.target.date)) + " · Exam plan →</span></span></span>";
        quote.parentNode.insertBefore(a, quote.nextSibling);
      }
    }
    /* Unit cards: the current unit gets the highlighted border (its Ready / In draft label stays) and opens My dashboard. No mastery bars here this semester. */
    document.querySelectorAll("#unitgrid .pp-card").forEach(function(card){
      var m = (card.getAttribute("href") || "").match(/unit-(\d+)-/);
      if (!m) return;
      var n = +m[1];
      var isCurrent = currentUnits.length === 1 && currentUnits[0] === n;
      if (isCurrent){
        card.classList.add("is-current");
        card.setAttribute("href", "dashboard.html");
        card.setAttribute("title", "Current unit · opens My dashboard");
      }
    });
  }

  /* Loads everything, then draws one page. Pages that aren't for guests send them to Start tracking. */
  function page(render, active){
    if (!T.isOn()){ location.replace("start-tracking.html"); return; }
    header(active);
    var host = document.getElementById("ms-main");
    load().then(function(d){
      render(d, host);
      document.addEventListener("pinkprint-synced", function(){
        load().then(function(nd){ render(nd, host); });
      });
    }, function(err){
      host.innerHTML = '<p class="tp-note">Couldn\'t load your study data. Refresh the page to try again.</p>';
      if (window.console) console.error(err);
    });
  }

  return {
    load: load, header: header, bar: bar, home: home, page: page,
    dashboard: function(){ page(dashboard, "dashboard"); },
    exam: function(){ page(examPage, "dashboard"); },
    journal: function(){
      var tab = new URLSearchParams(location.search).get("tab");
      if (tab === "bookmarks"){ journalState.tab = "bookmarks"; journalState.sort = "recent"; }
      else if (tab === "mistakes" || tab === "journal") journalState.tab = "journal";
      /* #unit-N (old Progress links) opens that unit's topics */
      var m = location.hash.match(/^#unit-(\d+)$/);
      if (m && journalState.tab === "progress"){ openUnits[+m[1]] = true; journalState.scrollTo = "unit-" + m[1]; }
      page(journalPage, "journal");
    }
  };
})();
