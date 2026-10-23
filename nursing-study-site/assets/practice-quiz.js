/* ---------- Load questions from data/<course>/unit-N.json ----------
   Topic quiz: loadPracticeQuiz({data: "../data/nur114/", units: [3], topic: "Safety"})
     groups results by each question's category, in the order the topic lists them.
   Mix quiz:   loadPracticeQuiz({data: "../data/nur114/", units: [1, 2, 3]})
     takes every topic in those units and groups results by topic. */
function fetchQuizUnits(data, units){
  return Promise.all(units.map(function(n){
    return fetch(data + "unit-" + n + ".json").then(function(r){
      if (!r.ok) throw new Error("unit-" + n + ".json: HTTP " + r.status);
      return r.json();
    });
  }));
}

function buildQuizBank(units, topic){
  var bank = [], catLabels = {};
  units.forEach(function(u){
    u.topics.forEach(function(t){
      if (topic && t.topic !== topic) return;
      var mixKey = u.unit + ":" + t.topic;
      if (topic) t.categories.forEach(function(c){ catLabels[c] = c; });
      else catLabels[mixKey] = t.mixLabel;
      u.questions.forEach(function(q){
        if (q.topic !== t.topic) return;
        q.cat = topic ? q.category : mixKey;
        bank.push(q);
      });
    });
  });
  return {bank: bank, catLabels: catLabels};
}

function loadPracticeQuiz(opts){
  initPracticeQuiz(fetchQuizUnits(opts.data, opts.units).then(function(units){
    var d = buildQuizBank(units, opts.topic);
    /* Name for the Mastery box on the results page: the topic, the unit, or every unit */
    d.masteryLabel = opts.topic || (units.length === 1 ? units[0].name : "Overall");
    if (opts.topic){ noteTopicSeen(units[0], opts.topic); challengeLink(units[0], opts.topic); }
    return d;
  }), null, opts);
}

/* "Challenge a friend" under Start on topic quizzes (tracked students with Challenges on) */
function challengeLink(unit, topicName){
  if (typeof Tracking === "undefined" || !Tracking.isOn() || !Tracking.feature("challenges")) return;
  var t = unit.topics.filter(function(x){ return x.topic === topicName; })[0];
  var start = document.getElementById("pq-start");
  if (!t || !start || document.getElementById("pq-challenge")) return;
  var a = document.createElement("a");
  a.id = "pq-challenge";
  a.className = "pq-challenge-link";
  a.href = Tracking.ROOT + "challenges.html?unit=" + unit.unit + "&topic=" + encodeURIComponent(t.slug);
  a.textContent = "Challenge a friend \u2192";
  start.parentNode.insertBefore(a, start.nextSibling);
}

/* Class tally: every answer (tracked or not) sends only its question ID and right/wrong, in
   small batches. No code, nickname, device or time. */
var QuizTally = (function(){
  var queue = [], timer = null;
  function send(batch, beacon){
    var body = JSON.stringify({answers: batch});
    try {
      if (beacon && navigator.sendBeacon && navigator.sendBeacon("/api/tally/add", new Blob([body], {type: "application/json"}))) return;
      fetch("/api/tally/add", {method: "POST", headers: {"Content-Type": "application/json"}, body: body, keepalive: true}).catch(function(){});
    } catch (e) {}
  }
  function flush(beacon){
    clearTimeout(timer); timer = null;
    while (queue.length) send(queue.splice(0, 50), beacon);
  }
  if (typeof window !== "undefined" && /^https?:$/.test(location.protocol)){
    window.addEventListener("pagehide", function(){ flush(true); });
    document.addEventListener("visibilitychange", function(){ if (document.visibilityState === "hidden") flush(true); });
  }
  return {
    add: function(id, correct){
      if (!/^https?:$/.test(location.protocol)) return;
      queue.push({q: id, ok: !!correct});
      if (queue.length >= 10) flush(false);
      else if (!timer) timer = setTimeout(function(){ flush(false); }, 30000);
    },
    flush: flush
  };
})();

/* Opening a topic quiz clears its "N new questions" label (tracked students only) */
function noteTopicSeen(unit, topicName){
  if (typeof Tracking === "undefined" || !Tracking.isOn()) return;
  var t = unit.topics.filter(function(x){ return x.topic === topicName; })[0];
  if (!t) return;
  var key = unit.unit + ":" + t.slug;
  var count = unit.questions.filter(function(q){ return q.topic === topicName; }).length;
  var known = Tracking.state().knownCounts || {};
  if (known[key] === count) return;
  var next = {};
  Object.keys(known).forEach(function(k){ next[k] = known[k]; });
  next[key] = count;
  Tracking.update({knownCounts: next});
}

/* My study sessions (Today's plan, Weak spots, Mistake journal, Review, ...): every unit's
   questions are loaded, opts.pick(questions, store) chooses which ones, and the session starts
   straight away. Results group by topic. */
function loadSessionQuiz(opts){
  var ready = Progress.init(opts.data).then(function(){
    return fetchQuizUnits(opts.data, Progress.units);
  }).then(function(units){
    var d = buildQuizBank(units, null);
    var byId = {};
    d.bank.forEach(function(q){ byId[q.id] = q; });
    var ids = opts.pick(d.bank, Progress.load());
    d.bank = ids.map(function(q){ return byId[q.id || q]; }).filter(Boolean);
    d.masteryLabel = opts.title;
    return d;
  });
  initPracticeQuiz(ready, null, {data: opts.data, autoStart: true, onFinish: opts.onFinish});
}

/* Takes a bank and its category labels, or a promise of {bank, catLabels, masteryLabel}.
   opts.data (from loadPracticeQuiz) is where progress tracking finds exams.json. */
function initPracticeQuiz(bank, catLabels, opts){
  /* Progress tracking only runs when the tracking flag is on (js/progress.js) */
  var tracking = typeof Progress !== "undefined" && Progress.enabled() && !!(opts && opts.data);
  /* Study features a tracked student can switch off in Settings */
  var useSure = tracking && Tracking.feature("sure");
  var useNotes = tracking && Tracking.feature("notes");
  var ready = Promise.resolve(Array.isArray(bank) ? {bank: bank, catLabels: catLabels} : bank).then(function(d){
    bank = d.bank; catLabels = d.catLabels; masteryLabel = d.masteryLabel || "";
    normalizeBank(bank);
    if (tracking) return Progress.init(opts.data).catch(function(err){
      console.warn("[progress] tracking is off for this page: couldn't load exam data", err);
      tracking = false;
    });
  });
  var autoStart = !!(opts && opts.autoStart);
  ready.catch(function(err){
    console.error("[quiz] couldn't load questions", err);
    var msg = document.createElement("p");
    msg.className = "pq-error";
    msg.style.display = "block";
    msg.textContent = "Couldn't load the questions. Refresh the page to try again.";
    document.getElementById("pq-setup-screen").appendChild(msg);
  });
  var masteryLabel = "";
  var ROUND_SIZE = 5;
  var mode = null, pool = [], missedMap = {};
  var singleQuestions = [], singleResults = [];
  var queue = [], currentRound = [], currentRoundIndex = 0, roundsTaken = 0;
  var attempts = {}, latestResult = {}, correctSoFar = 0, missedSoFar = 0, categoryTotals = {};
  var answered = false, userSelection = [], currentDisplayOptions = [];
  var LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  var PREFIX_RE = /^\s*(correct|incorrect|not quite|missed)\s*[.!:—–-]\s*/i;

  /* ---------- Normalize every question into one shape ----------
     Accepts the older format (prompt, options with ids, correct: ["a"], explanation)
     and the newer one (stem, options flagged correct: true with their own rationale,
     optional summary). After this, every question has:
       id, prompt, options [{id, text, correct, rationale}], correct [ids],
       multi (more than one correct answer), summary, explanation (older question-level text)
     and type is "dragdrop", "order", or else "sata"/"mc" decided by how many answers are correct.
     Ordered response ("order"): options are listed in the correct order; every one is
     marked correct and q.correct keeps that order.
     Drop-down ("cloze"): q.sentence holds {1}, {2}... and each option has a blank number;
     one correct option per blank, so it grades like select-all-that-apply. */
  function normalizeBank(bank){
    var missingRationale = [];
    bank.forEach(function(q, qi){
      if (q.id == null) q.id = "q" + (qi + 1);
      if (q.prompt == null) q.prompt = q.stem || "";
      var qText = q.explanation != null ? q.explanation : q.rationale;
      q.explanation = qText ? String(qText).replace(PREFIX_RE, "") : "";
      q.summary = q.summary ? String(q.summary) : "";
      var listed = Array.isArray(q.correct) ? q.correct.map(String) : [];
      var gaps = [];
      var ordered = q.type === "order";
      q.options = (q.options || []).map(function(o, i){
        var id = o.id != null ? String(o.id) : (i < LETTERS.length ? LETTERS.charAt(i).toLowerCase() : "o" + i);
        var rationale = o.rationale ? String(o.rationale).replace(PREFIX_RE, "") : "";
        if (!rationale) gaps.push(id);
        return {id: id, text: o.text, correct: ordered || o.correct === true || listed.indexOf(id) !== -1, rationale: rationale, blank: o.blank};
      });
      q.correct = q.options.filter(function(o){ return o.correct; }).map(function(o){ return o.id; });
      q.multi = q.correct.length > 1;
      if (q.type !== "dragdrop" && q.type !== "cloze" && !ordered) q.type = q.multi ? "sata" : "mc";
      if (q.correct.length === 0) console.warn("[quiz] question " + q.id + " has no correct option: " + q.prompt);
      if (gaps.length) missingRationale.push({q: q, ids: gaps});
    });
    if (missingRationale.length){
      console.groupCollapsed("[quiz] " + missingRationale.length + " of " + bank.length + " questions have options without a rationale");
      missingRationale.forEach(function(m){
        console.warn("[quiz] question " + m.q.id + (m.q.cat ? " (" + m.q.cat + ")" : "") + ": option" + (m.ids.length === 1 ? " " : "s ") + m.ids.join(", ") + " missing a rationale — " + m.q.prompt.slice(0, 80));
      });
      console.groupEnd();
    }
  }

  /* ---------- Scoring: one place for every question type ----------
     All-or-nothing: correct only when every correct option is chosen and nothing else.
     Each option also gets its result state and the prefix shown before its rationale. */
  function gradeQuestion(q, selected){
    var states = {}, allRight = true;
    /* Ordered response: right only when every option is in its exact spot */
    if (q.type === "order"){
      q.correct.forEach(function(id, i){
        var at = selected.indexOf(id), ok = at === i;
        if (!ok) allRight = false;
        states[id] = {state: ok ? "correct" : "wrong", chosen: true,
          prefix: ok ? "Step " + (i + 1) + "." : "Step " + (i + 1) + (at === -1 ? "." : " (you had " + (at + 1) + ").")};
      });
      return {correct: allRight, states: states};
    }
    q.options.forEach(function(o){
      var chosen = selected.indexOf(o.id) !== -1;
      var state = o.correct ? (chosen ? "correct" : "missed") : (chosen ? "wrong" : "neutral");
      if (state === "missed" || state === "wrong") allRight = false;
      states[o.id] = {state: state, chosen: chosen, prefix: o.correct ? (chosen ? "Correct." : "Missed.") : "Incorrect."};
    });
    return {correct: allRight, states: states};
  }

  function shuffle(arr){
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--){
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function stratifiedSample(source, count){
    var byCat = {};
    source.forEach(function(q){ (byCat[q.cat] = byCat[q.cat] || []).push(q); });
    var cats = Object.keys(byCat);
    cats.forEach(function(c){ byCat[c] = shuffle(byCat[c]); });
    var k = cats.length;
    if (k === 0) return [];
    var shares = {};
    var base = Math.floor(count / k);
    cats.forEach(function(c){ shares[c] = Math.min(base, byCat[c].length); });
    var used = 0;
    cats.forEach(function(c){ used += shares[c]; });
    var leftover = Math.min(count, source.length) - used;
    var idx = 0;
    while (leftover > 0){
      var progressed = false;
      for (var i = 0; i < k && leftover > 0; i++){
        var c = cats[(idx + i) % k];
        if (shares[c] < byCat[c].length){
          shares[c]++; leftover--; progressed = true;
        }
      }
      idx++;
      if (!progressed) break;
    }
    var result = [];
    cats.forEach(function(c){ result = result.concat(byCat[c].slice(0, shares[c])); });
    return shuffle(result);
  }

  /* Every session mixes question types: drag-and-drop and select-all-that-apply each
     get about 15% of the questions, ordered response and drop-down about 10% each (at least one of each
     when the bank has any), and multiple choice fills the rest. If a bank is short on a type, its spare slots go to the
     others. Within each type, questions are still spread across categories. */
  var TYPE_SHARE = {dragdrop: 0.15, sata: 0.15, order: 0.1, cloze: 0.1};
  function mixedSample(source, count){
    count = Math.min(count, source.length);
    var byType = {};
    source.forEach(function(q){ (byType[q.type] = byType[q.type] || []).push(q); });
    var quota = {}, used = 0;
    Object.keys(TYPE_SHARE).forEach(function(t){
      if (!byType[t]) return;
      quota[t] = Math.min(byType[t].length, Math.max(1, Math.ceil(count * TYPE_SHARE[t])));
      used += quota[t];
    });
    var rest = Object.keys(byType).filter(function(t){ return !(t in TYPE_SHARE); });
    var restPool = [];
    rest.forEach(function(t){ restPool = restPool.concat(byType[t]); });
    var restCount = Math.min(restPool.length, Math.max(0, count - used));
    var picked = stratifiedSample(restPool, restCount);
    Object.keys(quota).forEach(function(t){ picked = picked.concat(stratifiedSample(byType[t], quota[t])); });
    /* Top up from whatever is left if any type ran short */
    if (picked.length < count){
      var left = source.filter(function(q){ return picked.indexOf(q) === -1; });
      picked = picked.concat(stratifiedSample(left, count - picked.length));
    }
    return shuffle(picked.slice(0, count));
  }

  function show(id){ document.getElementById(id).classList.remove("hidden"); }
  function hide(id){ document.getElementById(id).classList.add("hidden"); }

  /* ---------- Setup: pick a mode and a question count on one screen ---------- */
  var countRow = document.getElementById("pq-counts");
  var countsFor = {
    single: countRow.getAttribute("data-single").split(",").map(Number),
    rounds: countRow.getAttribute("data-rounds").split(",").map(Number)
  };
  var chosenCount = 10;
  mode = "single";

  /* Counts a mode doesn't offer (e.g. 5/15/25/35 for mastery rounds) are disabled */
  function syncSetup(){
    document.querySelectorAll(".pq-mode-btn").forEach(function(btn){
      var on = btn.getAttribute("data-mode") === mode;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var allowed = countsFor[mode];
    if (allowed.indexOf(chosenCount) === -1) chosenCount = allowed.indexOf(10) !== -1 ? 10 : allowed[0];
    document.querySelectorAll(".pq-count-btn").forEach(function(btn){
      var c = Number(btn.getAttribute("data-count"));
      btn.disabled = allowed.indexOf(c) === -1;
      btn.classList.toggle("is-selected", c === chosenCount);
      btn.setAttribute("aria-pressed", c === chosenCount ? "true" : "false");
    });
  }

  document.querySelectorAll(".pq-mode-btn").forEach(function(btn){
    btn.addEventListener("click", function(){ mode = btn.getAttribute("data-mode"); syncSetup(); });
  });
  document.querySelectorAll(".pq-count-btn").forEach(function(btn){
    btn.addEventListener("click", function(){ chosenCount = Number(btn.getAttribute("data-count")); syncSetup(); });
  });
  /* The setup screen works right away; starting waits for the questions if they're still loading */
  document.getElementById("pq-start").addEventListener("click", function(){
    ready.then(function(){
      if (document.getElementById("pq-setup-screen").classList.contains("hidden")) return;
      pool = mixedSample(bank, chosenCount);
      missedMap = {};
      startSessionTracking();
      hide("pq-setup-screen");
      if (mode === "single") startSingle(); else startRounds();
    });
  });
  syncSetup();

  /* Sessions from My study start straight away with every chosen question */
  if (autoStart){
    ready.then(function(){
      hide("pq-setup-screen");
      if (!bank.length){ show("pq-empty"); return; }
      pool = bank.slice();
      mode = "single";
      missedMap = {};
      startSessionTracking();
      startSingle();
    });
  }

  function startSingle(){
    singleQuestions = shuffle(pool);
    singleResults = [];
    currentRoundIndex = 0;
    show("pq-quiz-screen");
    renderCurrentQuestion();
  }

  function startRounds(){
    queue = shuffle(pool);
    roundsTaken = 0; attempts = {}; latestResult = {}; correctSoFar = 0; missedSoFar = 0; categoryTotals = {};
    drawRound();
  }

  function drawRound(){
    roundsTaken++;
    var take = Math.min(ROUND_SIZE, queue.length);
    currentRound = queue.slice(0, take);
    queue = queue.slice(take);
    currentRoundIndex = 0;
    hide("pq-round-complete-screen"); show("pq-quiz-screen");
    renderCurrentQuestion();
  }

  function activeQuestionList(){ return mode === "single" ? singleQuestions : currentRound; }
  function currentQuestion(){ return activeQuestionList()[currentRoundIndex]; }

  var optsEl = document.getElementById("pq-options");
  var fbEl = document.getElementById("pq-feedback");
  var errEl = document.getElementById("pq-error");
  /* The summary and result heading sit above the per-option rationales */
  optsEl.parentNode.insertBefore(fbEl, optsEl);

  /* ---------- Calculator ----------
     Questions flagged calc: true (med math) get a Calculator button under the prompt.
     It opens a small keypad under the button that stays open while the next questions need it.
     Typing works while the keypad has focus, and those keys never reach the quiz shortcuts. */
  var calc = (function(){
    var row = null, panel = null, exprEl = null, resultEl = null;
    var expr = "", result = null;
    var SHOW = {"*": "×", "/": "÷", "-": "−", "+": "+"};

    function tokens(s){ return s.match(/\d*\.?\d+|\d+\.|[+\-*\/]/g) || []; }
    /* Left to right, × and ÷ before + and − */
    function evaluate(s){
      var t = tokens(s);
      if (!t.length || /[+\-*\/]/.test(t[t.length - 1])) return null;
      var vals = [], ops = [];
      t.forEach(function(tok, i){
        if (i % 2 === 0) vals.push(parseFloat(tok)); else ops.push(tok);
      });
      for (var i = 0; i < ops.length; i++){
        if (ops[i] === "*" || ops[i] === "/"){
          vals.splice(i, 2, ops[i] === "*" ? vals[i] * vals[i + 1] : vals[i] / vals[i + 1]);
          ops.splice(i, 1); i--;
        }
      }
      var total = vals[0];
      ops.forEach(function(op, j){ total = op === "+" ? total + vals[j + 1] : total - vals[j + 1]; });
      return isFinite(total) ? Number(total.toPrecision(12)) : NaN;
    }
    function pretty(s){ return s.replace(/[+\-*\/]/g, function(o){ return " " + SHOW[o] + " "; }); }
    function render(){
      exprEl.textContent = expr ? pretty(expr) + (result !== null ? " =" : "") : "";
      resultEl.textContent = result === null ? (expr ? "" : "0") : (isNaN(result) ? "Error" : String(result));
    }
    function press(k){
      var last = expr.slice(-1), isOp = /[+\-*\/]/;
      if (/^[0-9]$/.test(k)){
        if (result !== null){ expr = ""; result = null; }
        expr += k;
      } else if (k === "."){
        if (result !== null){ expr = ""; result = null; }
        var cur = expr.split(/[+\-*\/]/).pop();
        if (cur.indexOf(".") === -1) expr += cur === "" ? "0." : ".";
      } else if (isOp.test(k)){
        if (result !== null && !isNaN(result)){ expr = String(result); result = null; }
        if (!expr) return;
        expr = isOp.test(last) ? expr.slice(0, -1) + k : expr + k;
      } else if (k === "="){
        var v = evaluate(expr);
        if (v !== null) result = v;
      } else if (k === "back"){
        if (result !== null){ result = null; return render(); }
        expr = expr.slice(0, -1);
      } else if (k === "clear"){
        expr = ""; result = null;
      }
      render();
    }
    function build(){
      var label = document.getElementById("pq-type-label");
      row = document.createElement("div");
      row.className = "pq-calc-row hidden";
      var btn = document.createElement("button");
      btn.type = "button"; btn.className = "pq-calc-btn"; btn.id = "pq-calc-btn";
      btn.setAttribute("aria-expanded", "false");
      btn.innerHTML = '<i class="ti ti-calculator" aria-hidden="true"></i> Calculator';
      btn.addEventListener("click", function(){ isOpen() ? close() : open(); });
      row.appendChild(btn);
      label.parentNode.insertBefore(row, label.nextSibling);

      panel = document.createElement("div");
      panel.className = "pq-calc hidden";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "Calculator");
      panel.tabIndex = -1;
      var head = document.createElement("div");
      head.className = "pq-calc-head";
      head.innerHTML = '<span>Calculator</span>';
      var x = document.createElement("button");
      x.type = "button"; x.className = "pq-calc-close"; x.setAttribute("aria-label", "Close calculator");
      x.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
      x.addEventListener("click", function(){ close(); btn.focus({preventScroll:true}); });
      head.appendChild(x);
      var screen = document.createElement("div");
      screen.className = "pq-calc-screen";
      exprEl = document.createElement("div"); exprEl.className = "pq-calc-expr";
      resultEl = document.createElement("div"); resultEl.className = "pq-calc-result";
      resultEl.setAttribute("aria-live", "polite");
      screen.appendChild(exprEl); screen.appendChild(resultEl);
      var keys = document.createElement("div");
      keys.className = "pq-calc-keys";
      [["C","clear","fn"],["⌫","back","fn"],["÷","/","op"],["×","*","op"],
       ["7","7"],["8","8"],["9","9"],["−","-","op"],
       ["4","4"],["5","5"],["6","6"],["+","+","op"],
       ["1","1"],["2","2"],["3","3"],["=","=","eq"],
       ["0","0","zero"],[".","."]].forEach(function(k){
        var b = document.createElement("button");
        b.type = "button"; b.textContent = k[0];
        b.className = "pq-calc-key" + (k[2] ? " is-" + k[2] : "");
        b.setAttribute("aria-label", {clear:"Clear", back:"Backspace", "/":"Divide", "*":"Multiply", "-":"Minus", "+":"Plus", "=":"Equals", ".":"Decimal point"}[k[1]] || k[0]);
        b.addEventListener("click", function(){ press(k[1]); });
        keys.appendChild(b);
      });
      panel.appendChild(head); panel.appendChild(screen); panel.appendChild(keys);
      panel.addEventListener("keydown", function(e){
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        var k = e.key, map = {"x":"*", "X":"*", "Enter":"=", "=":"=", "Backspace":"back", "Delete":"clear", "c":"clear", "C":"clear"};
        if (/^[0-9.+\-*\/]$/.test(k)) press(k);
        else if (map[k]) press(map[k]);
        else if (k === "Escape"){ close(); btn.focus({preventScroll:true}); }
        else if (k === "Tab") { e.stopPropagation(); return; }
        else return;
        /* Keep calculator keys away from the quiz's letter, number and Enter shortcuts */
        e.preventDefault(); e.stopPropagation();
      });
      row.appendChild(panel);
      render();
    }
    function isOpen(){ return panel && !panel.classList.contains("hidden"); }
    function open(){
      if (!panel) build();
      panel.classList.remove("hidden");
      document.getElementById("pq-calc-btn").setAttribute("aria-expanded", "true");
      panel.focus({preventScroll:true});
    }
    function close(){
      if (!panel) return;
      panel.classList.add("hidden");
      document.getElementById("pq-calc-btn").setAttribute("aria-expanded", "false");
    }
    return {
      /* Show the button only on calculator questions; keep the keypad open between them */
      sync: function(q){
        if (!q.calc && !row) return;
        if (!row) build();
        row.classList.toggle("hidden", !q.calc);
        if (!q.calc) close();
      },
      close: close
    };
  })();

  /* Option card: letter box, text, a slot for the rationale shown after checking,
     and (for choice questions) a square radio or checkbox mark */
  function buildOption(opt, i, tag){
    var el = document.createElement(tag || "button");
    if (el.tagName === "BUTTON") el.type = "button";
    el.className = "pq-option";
    el.setAttribute("data-opt", opt.id);
    var letter = document.createElement("span");
    letter.className = "pq-letter";
    letter.setAttribute("aria-hidden", "true");
    letter.textContent = LETTERS.charAt(i) || String(i + 1);
    var body = document.createElement("span");
    body.className = "pq-opt-body";
    var text = document.createElement("span");
    text.className = "pq-opt-text";
    text.textContent = opt.text;
    body.appendChild(text);
    el.appendChild(letter); el.appendChild(body);
    return el;
  }

  /* After checking: color the card, swap the letter for a check or x, and add
     "Correct." / "Incorrect." / "Missed." plus the option's rationale under its text */
  function showOptionResult(el, opt, res){
    var letter = el.querySelector(".pq-letter");
    el.classList.remove("is-selected");
    el.classList.add("is-graded");
    if (res.state === "correct"){ el.classList.add("is-correct"); letter.textContent = "✓"; }
    else if (res.state === "wrong"){ el.classList.add("is-wrong"); letter.textContent = "✕"; }
    else if (res.state === "missed"){ el.classList.add("is-missed"); }
    var body = el.querySelector(".pq-opt-body");
    if (opt.rationale){
      var rat = document.createElement("span");
      rat.className = "pq-opt-rat";
      var b = document.createElement("strong");
      b.textContent = res.prefix + " ";
      rat.appendChild(b);
      rat.appendChild(document.createTextNode(opt.rationale));
      body.appendChild(rat);
    }
  }

  /* Highlight picked rows and only allow Check answer once something is picked */
  function syncSelection(){
    optsEl.querySelectorAll(".pq-option").forEach(function(row){
      var on = userSelection.indexOf(row.getAttribute("data-opt")) !== -1;
      row.classList.toggle("is-selected", on);
      row.setAttribute("aria-checked", on ? "true" : "false");
    });
    document.getElementById("pq-submit").disabled = userSelection.length === 0;
  }

  function pickOption(q, optId){
    if (answered) return;
    if (q.multi){
      if (userSelection.indexOf(optId) === -1) userSelection.push(optId);
      else userSelection = userSelection.filter(function(id){ return id !== optId; });
    } else {
      userSelection = [optId];
    }
    errEl.style.display = "none";
    syncSelection();
  }

  function renderCurrentQuestion(){
    answered = false; userSelection = [];
    errEl.style.display = "none";
    fbEl.style.display = "none";
    fbEl.className = "pq-feedback";
    document.getElementById("pq-submit").classList.remove("hidden");
    document.getElementById("pq-submit").disabled = true;
    document.getElementById("pq-next").classList.add("hidden");

    var list = activeQuestionList();
    var q = list[currentRoundIndex];
    currentDisplayOptions = shuffle(q.options);

    var totalLabel;
    if (mode === "single"){
      totalLabel = "question " + (currentRoundIndex + 1) + " of " + list.length;
      document.getElementById("pq-score").textContent = "score " + singleResults.filter(function(r){ return r.correct; }).length + "/" + currentRoundIndex;
    } else {
      totalLabel = "round " + roundsTaken + " — question " + (currentRoundIndex + 1) + " of " + list.length;
      document.getElementById("pq-score").textContent = "";
    }
    document.getElementById("pq-progress").textContent = totalLabel;
    document.getElementById("pq-progress-bar").style.width = Math.round((currentRoundIndex / list.length) * 100) + "%";
    document.getElementById("pq-type-label").textContent = q.type === "dragdrop" ? "drag and drop · or tap an option, then a box"
      : q.type === "order" ? "put in order · drag, or use the arrows"
      : q.type === "cloze" ? "drop-down · choose an option for each blank" : q.multi ? "select all that apply" : "select one";
    document.getElementById("pq-prompt").textContent = q.prompt;
    calc.sync(q);
    if (tracking) syncBookmark(q);
    if (useNotes) hideNote();

    if (q.type === "dragdrop"){ renderDragDrop(q); return; }
    if (q.type === "order"){ renderOrder(q); return; }
    if (q.type === "cloze"){ renderCloze(q); return; }

    /* One correct answer: radio-style single select. More than one: checkboxes. */
    errEl.textContent = q.multi ? "Select at least one answer first" : "Select an answer first";
    optsEl.innerHTML = "";
    optsEl.setAttribute("role", q.multi ? "group" : "radiogroup");
    optsEl.setAttribute("aria-label", q.multi ? "Select all that apply" : "Select one");
    currentDisplayOptions.forEach(function(opt, i){
      var row = buildOption(opt, i);
      row.setAttribute("role", q.multi ? "checkbox" : "radio");
      row.setAttribute("aria-checked", "false");
      var mark = document.createElement("span");
      mark.className = "pq-mark " + (q.multi ? "is-check" : "is-radio");
      mark.setAttribute("aria-hidden", "true");
      row.appendChild(mark);
      row.addEventListener("click", function(){ pickOption(q, opt.id); });
      optsEl.appendChild(row);
    });

    var last = LETTERS.charAt(Math.min(currentDisplayOptions.length, LETTERS.length) - 1);
    document.getElementById("pq-hint").innerHTML = "<span>A&ndash;" + last + " &middot; " + (q.multi ? "toggle" : "pick") + "</span>" + checkHint();
  }

  /* ---------- Drag and drop ----------
     Two boxes; every option starts on the left, shuffled. Options move by pointer
     drag (mouse, pen and touch all use pointer events), by tapping an option and
     then a box, or with the letter keys. Only the answer box counts when checked.
     On touch screens a drag starts only after a short press and hold, so swiping
     over the options still scrolls the page and keeps the picked option picked. */
  var ddPicked = null, ddDrag = null, ddDragEnd = {item: null, at: 0};
  var DD_HOLD = 250;

  function ddBoxes(){ return optsEl.querySelectorAll(".pq-dd-box"); }
  function ddList(box){ return box.querySelector(".pq-dd-list"); }
  function ddBoxOf(item){ return item.closest(".pq-dd-box"); }
  function ddOtherBox(item){
    var b = ddBoxes();
    return ddBoxOf(item) === b[0] ? b[1] : b[0];
  }
  function ddAnswerIds(){
    var box = optsEl.querySelector('.pq-dd-box[data-box="answer"]');
    if (!box) return [];
    return Array.prototype.map.call(box.querySelectorAll(".pq-dd-item"), function(el){ return el.getAttribute("data-opt"); });
  }

  /* Keep each box in the original shuffled order so items don't jump around */
  function ddMove(item, box){
    if (answered || !box) return;
    ddUnpick();
    if (ddBoxOf(item) !== box){
      var list = ddList(box);
      var order = Number(item.getAttribute("data-order"));
      var before = null;
      Array.prototype.some.call(list.children, function(el){
        if (Number(el.getAttribute("data-order")) > order){ before = el; return true; }
        return false;
      });
      list.insertBefore(item, before);
      errEl.style.display = "none";
    }
    ddSync();
  }

  function ddPick(item){
    if (answered) return;
    if (ddPicked === item){ ddUnpick(); return; }
    ddUnpick();
    ddPicked = item;
    item.classList.add("is-selected");
    item.setAttribute("aria-pressed", "true");
    ddBoxes().forEach(function(b){ b.classList.toggle("is-target", b !== ddBoxOf(item)); });
  }

  function ddUnpick(){
    if (ddPicked){
      ddPicked.classList.remove("is-selected");
      ddPicked.setAttribute("aria-pressed", "false");
    }
    ddPicked = null;
    ddBoxes().forEach(function(b){ b.classList.remove("is-target"); });
  }

  function ddSync(){
    ddBoxes().forEach(function(box){
      var n = box.querySelectorAll(".pq-dd-item").length;
      box.classList.toggle("is-empty", n === 0);
      box.querySelector(".pq-dd-count").textContent = n;
    });
  }

  /* Both boxes keep one fixed size while options move: the height of the options box
     with every option still in it. Re-measured when the screen width changes. */
  function ddLockSize(){
    var boxes = ddBoxes();
    if (boxes.length !== 2) return;
    var pool = boxes[0];
    boxes.forEach(function(b){ b.style.minHeight = ""; });
    var moved = Array.prototype.slice.call(boxes[1].querySelectorAll(".pq-dd-item"));
    var list = ddList(pool);
    moved.forEach(function(el){ list.appendChild(el); });
    pool.classList.remove("is-empty");
    var h = pool.getBoundingClientRect().height;
    moved.forEach(function(el){ ddList(boxes[1]).appendChild(el); });
    ddResort(list); ddResort(ddList(boxes[1]));
    ddSync();
    boxes.forEach(function(b){ b.style.minHeight = Math.ceil(h) + "px"; });
  }
  function ddResort(list){
    Array.prototype.slice.call(list.children)
      .sort(function(a, b){ return Number(a.getAttribute("data-order")) - Number(b.getAttribute("data-order")); })
      .forEach(function(el){ list.appendChild(el); });
  }
  var ddLastWidth = window.innerWidth;
  window.addEventListener("resize", function(){
    if (window.innerWidth === ddLastWidth || answered) return;
    ddLastWidth = window.innerWidth;
    if (optsEl.querySelector(".pq-dd")) ddLockSize();
  });

  function ddBoxAt(x, y){
    var el = document.elementFromPoint(x, y);
    return el ? el.closest("#pq-options .pq-dd-box") : null;
  }

  /* While dragging near the top or bottom of the screen, scroll so the other box can be reached */
  function ddAutoScroll(){
    if (!ddDrag || !ddDrag.active) return;
    var edge = 70, y = ddDrag.y, h = window.innerHeight, dy = 0;
    if (y < edge) dy = -Math.ceil((edge - y) / 5);
    else if (y > h - edge) dy = Math.ceil((y - (h - edge)) / 5);
    if (dy) window.scrollBy(0, dy);
    ddDrag.raf = requestAnimationFrame(ddAutoScroll);
  }

  function ddCancelDrag(){
    if (!ddDrag) return;
    if (ddDrag.hold) clearTimeout(ddDrag.hold);
    if (ddDrag.raf) cancelAnimationFrame(ddDrag.raf);
    if (ddDrag.ghost) ddDrag.ghost.remove();
    ddDrag.item.classList.remove("is-dragging", "is-held");
    ddBoxes().forEach(function(b){ b.classList.remove("is-over"); });
    ddDrag = null;
  }

  function ddPointerDown(e){
    if (answered || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    var item = e.currentTarget;
    ddCancelDrag();
    var touch = e.pointerType === "touch";
    var drag = ddDrag = {item: item, id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, active: false, ready: !touch};
    if (touch) drag.hold = setTimeout(function(){
      if (ddDrag !== drag) return;
      drag.ready = true;
      item.classList.add("is-held");
    }, DD_HOLD);
    try { item.setPointerCapture(e.pointerId); } catch (err) {}
  }

  function ddPointerMove(e){
    if (!ddDrag || e.pointerId !== ddDrag.id) return;
    ddDrag.x = e.clientX; ddDrag.y = e.clientY;
    if (!ddDrag.active){
      if (Math.abs(e.clientX - ddDrag.sx) + Math.abs(e.clientY - ddDrag.sy) < 8) return;
      /* Moved before the hold finished: it's a scroll, not a drag */
      if (!ddDrag.ready){ ddCancelDrag(); return; }
      var item = ddDrag.item, r = item.getBoundingClientRect();
      ddUnpick();
      ddDrag.active = true;
      ddDrag.ox = ddDrag.sx - r.left; ddDrag.oy = ddDrag.sy - r.top;
      var ghost = item.cloneNode(true);
      ghost.className = "pq-option pq-dd-item pq-dd-ghost";
      ghost.style.width = r.width + "px";
      document.body.appendChild(ghost);
      ddDrag.ghost = ghost;
      item.classList.add("is-dragging");
      ddDrag.raf = requestAnimationFrame(ddAutoScroll);
    }
    e.preventDefault();
    ddDrag.ghost.style.transform = "translate(" + (e.clientX - ddDrag.ox) + "px," + (e.clientY - ddDrag.oy) + "px)";
    var over = ddBoxAt(e.clientX, e.clientY);
    ddBoxes().forEach(function(b){ b.classList.toggle("is-over", b === over && b !== ddBoxOf(ddDrag.item)); });
  }

  function ddPointerUp(e){
    if (!ddDrag || e.pointerId !== ddDrag.id) return;
    var drag = ddDrag;
    if (drag.active){
      var over = ddBoxAt(e.clientX, e.clientY);
      ddCancelDrag();
      ddDragEnd = {item: drag.item, at: Date.now()};
      if (over && e.type === "pointerup") ddMove(drag.item, over);
    } else {
      ddCancelDrag();
    }
  }

  function renderDragDrop(q){
    ddPicked = null; ddCancelDrag();
    optsEl.innerHTML = "";
    optsEl.removeAttribute("role");
    optsEl.removeAttribute("aria-label");
    var wrap = document.createElement("div");
    wrap.className = "pq-dd";

    [["pool", q.leftLabel || "Options"], ["answer", q.rightLabel || "Answer"]].forEach(function(b){
      var box = document.createElement("div");
      box.className = "pq-dd-box";
      box.setAttribute("data-box", b[0]);
      box.setAttribute("role", "group");
      box.setAttribute("aria-label", b[1]);
      var head = document.createElement("div");
      head.className = "pq-dd-head";
      var title = document.createElement("span");
      title.textContent = b[1];
      var count = document.createElement("span");
      count.className = "pq-dd-count";
      head.appendChild(title); head.appendChild(count);
      var list = document.createElement("div");
      list.className = "pq-dd-list";
      var empty = document.createElement("p");
      empty.className = "pq-dd-empty";
      empty.textContent = b[0] === "answer" ? "Drag or tap answers here" : "Empty";
      box.appendChild(head); box.appendChild(list); box.appendChild(empty);
      /* Tap-then-tap: with an option picked, tapping anywhere in the other box moves it */
      box.addEventListener("click", function(e){
        if (answered || !ddPicked || e.target.closest(".pq-dd-item")) return;
        ddMove(ddPicked, box);
      });
      wrap.appendChild(box);
    });
    optsEl.appendChild(wrap);

    var poolList = ddList(wrap.querySelector('[data-box="pool"]'));
    currentDisplayOptions.forEach(function(opt, i){
      var item = buildOption(opt, i);
      item.classList.add("pq-dd-item");
      item.setAttribute("data-order", i);
      item.setAttribute("aria-pressed", "false");
      item.addEventListener("pointerdown", ddPointerDown);
      item.addEventListener("pointermove", ddPointerMove);
      item.addEventListener("pointerup", ddPointerUp);
      item.addEventListener("pointercancel", ddPointerUp);
      /* Once a touch has been held long enough to drag, stop the page from scrolling */
      item.addEventListener("touchmove", function(e){
        if (ddDrag && ddDrag.item === item && ddDrag.ready) e.preventDefault();
      }, {passive: false});
      item.addEventListener("contextmenu", function(e){ if (ddDrag) e.preventDefault(); });
      item.addEventListener("click", function(){
        /* A finished drag can fire a click on the item; don't treat it as a tap */
        if (ddDragEnd.item === item && Date.now() - ddDragEnd.at < 400) return;
        /* With an option picked, tapping an option in the other box moves the picked one there */
        if (ddPicked && ddBoxOf(ddPicked) !== ddBoxOf(item)){ ddMove(ddPicked, ddBoxOf(item)); return; }
        ddPick(item);
      });
      poolList.appendChild(item);
    });
    ddSync();
    ddLockSize();

    /* Checking with an empty answer box shows the inline message instead of grading */
    errEl.textContent = "Move at least one option first";
    document.getElementById("pq-submit").disabled = false;
    var last = LETTERS.charAt(Math.min(currentDisplayOptions.length, LETTERS.length) - 1);
    document.getElementById("pq-hint").innerHTML = "<span>A&ndash;" + last + " &middot; move between boxes</span>" + checkHint();
  }

  /* ---------- Ordered response ----------
     One list, shuffled; the badge on each option shows its current spot. Options move
     by pointer drag (touch waits for the same short hold as drag and drop, so swiping
     still scrolls), by tapping one and then the option whose spot it should take, by
     the up/down arrows on each option, or with the keyboard: a number picks the option
     in that spot, then the arrow keys move it. Graded all-or-nothing. */
  var ordPicked = null, ordDrag = null, ordDragEnd = {item: null, at: 0};

  function ordList(){ return optsEl.querySelector(".pq-ord"); }
  function ordItems(){ var l = ordList(); return l ? Array.prototype.slice.call(l.children) : []; }
  function ordIds(){ return ordItems().map(function(el){ return el.getAttribute("data-opt"); }); }

  function ordSync(){
    var items = ordItems();
    items.forEach(function(el, i){
      if (!answered) el.querySelector(".pq-letter").textContent = i + 1;
      el.querySelector(".pq-ord-up").disabled = answered || i === 0;
      el.querySelector(".pq-ord-down").disabled = answered || i === items.length - 1;
    });
  }

  function ordPick(item){
    if (answered) return;
    if (ordPicked === item){ ordUnpick(); return; }
    ordUnpick();
    ordPicked = item;
    item.classList.add("is-selected");
    item.setAttribute("aria-selected", "true");
  }
  function ordUnpick(){
    if (ordPicked){
      ordPicked.classList.remove("is-selected");
      ordPicked.setAttribute("aria-selected", "false");
    }
    ordPicked = null;
  }

  /* Move an option to spot `to` (0-based) */
  function ordMoveTo(item, to){
    if (answered) return;
    var items = ordItems(), from = items.indexOf(item);
    to = Math.max(0, Math.min(items.length - 1, to));
    if (from === -1 || from === to) return;
    var list = ordList();
    list.removeChild(item);
    list.insertBefore(item, list.children[to] || null);
    ordSync();
  }

  function ordCancelDrag(){
    if (!ordDrag) return;
    if (ordDrag.hold) clearTimeout(ordDrag.hold);
    if (ordDrag.raf) cancelAnimationFrame(ordDrag.raf);
    ordDrag.item.classList.remove("is-dragging", "is-held");
    ordDrag = null;
  }

  /* While dragging, the option takes the spot of whichever option the pointer is over */
  function ordFollow(){
    if (!ordDrag || !ordDrag.active) return;
    var item = ordDrag.item, y = ordDrag.y, to = -1;
    ordItems().forEach(function(el, i){
      if (el === item) return;
      var r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) to = i;
    });
    if (to !== -1) ordMoveTo(item, to);
  }

  function ordAutoScroll(){
    if (!ordDrag || !ordDrag.active) return;
    var edge = 70, y = ordDrag.y, h = window.innerHeight, dy = 0;
    if (y < edge) dy = -Math.ceil((edge - y) / 5);
    else if (y > h - edge) dy = Math.ceil((y - (h - edge)) / 5);
    if (dy){ window.scrollBy(0, dy); ordFollow(); }
    ordDrag.raf = requestAnimationFrame(ordAutoScroll);
  }

  function ordPointerDown(e){
    if (answered || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (e.target.closest(".pq-ord-btn")) return;
    var item = e.currentTarget;
    ordCancelDrag();
    var touch = e.pointerType === "touch";
    var drag = ordDrag = {item: item, id: e.pointerId, sx: e.clientX, sy: e.clientY, y: e.clientY, active: false, ready: !touch};
    if (touch) drag.hold = setTimeout(function(){
      if (ordDrag !== drag) return;
      drag.ready = true;
      item.classList.add("is-held");
    }, DD_HOLD);
    try { item.setPointerCapture(e.pointerId); } catch (err) {}
  }

  function ordPointerMove(e){
    if (!ordDrag || e.pointerId !== ordDrag.id) return;
    ordDrag.y = e.clientY;
    if (!ordDrag.active){
      if (Math.abs(e.clientX - ordDrag.sx) + Math.abs(e.clientY - ordDrag.sy) < 8) return;
      /* Moved before the hold finished: it's a scroll, not a drag */
      if (!ordDrag.ready){ ordCancelDrag(); return; }
      ordUnpick();
      ordDrag.active = true;
      ordDrag.item.classList.add("is-dragging");
      ordDrag.raf = requestAnimationFrame(ordAutoScroll);
    }
    e.preventDefault();
    ordFollow();
  }

  function ordPointerUp(e){
    if (!ordDrag || e.pointerId !== ordDrag.id) return;
    if (ordDrag.active) ordDragEnd = {item: ordDrag.item, at: Date.now()};
    ordCancelDrag();
  }

  function renderOrder(q){
    ordPicked = null; ordCancelDrag();
    /* Never start in the right order */
    if (currentDisplayOptions.length > 1){
      while (currentDisplayOptions.map(function(o){ return o.id; }).join() === q.correct.join()) currentDisplayOptions = shuffle(q.options);
    }
    optsEl.innerHTML = "";
    optsEl.removeAttribute("role");
    optsEl.removeAttribute("aria-label");
    var list = document.createElement("div");
    list.className = "pq-ord";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Put these in order, first at the top");
    currentDisplayOptions.forEach(function(opt, i){
      var item = buildOption(opt, i, "div");
      item.classList.add("pq-ord-item");
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", "false");
      var btns = document.createElement("span");
      btns.className = "pq-ord-btns";
      [["pq-ord-up", "Move up", "▲", -1], ["pq-ord-down", "Move down", "▼", 1]].forEach(function(b){
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pq-ord-btn " + b[0];
        btn.setAttribute("aria-label", b[1] + ": " + opt.text);
        btn.textContent = b[2];
        btn.addEventListener("click", function(e){
          e.stopPropagation();
          ordUnpick();
          ordMoveTo(item, ordItems().indexOf(item) + b[3]);
          btn.focus();
          if (btn.disabled){ var other = item.querySelector(b[3] < 0 ? ".pq-ord-down" : ".pq-ord-up"); if (other) other.focus(); }
        });
        btns.appendChild(btn);
      });
      item.appendChild(btns);
      item.addEventListener("pointerdown", ordPointerDown);
      item.addEventListener("pointermove", ordPointerMove);
      item.addEventListener("pointerup", ordPointerUp);
      item.addEventListener("pointercancel", ordPointerUp);
      item.addEventListener("touchmove", function(e){
        if (ordDrag && ordDrag.item === item && ordDrag.ready) e.preventDefault();
      }, {passive: false});
      item.addEventListener("contextmenu", function(e){ if (ordDrag) e.preventDefault(); });
      item.addEventListener("click", function(e){
        if (answered || e.target.closest(".pq-ord-btn")) return;
        /* A finished drag can fire a click on the item; don't treat it as a tap */
        if (ordDragEnd.item === item && Date.now() - ordDragEnd.at < 400) return;
        /* With an option picked, tapping another one moves the picked one into its spot */
        if (ordPicked && ordPicked !== item){ var p = ordPicked; ordUnpick(); ordMoveTo(p, ordItems().indexOf(item)); return; }
        ordPick(item);
      });
      list.appendChild(item);
    });
    optsEl.appendChild(list);
    ordSync();

    document.getElementById("pq-submit").disabled = false;
    document.getElementById("pq-hint").innerHTML = "<span>1&ndash;" + currentDisplayOptions.length + " &middot; pick &middot; &uarr;&darr; move</span>" + checkHint();
  }

  /* ---------- Drop-down (cloze) ----------
     The sentence with one menu per blank, each holding that blank's options in a shuffled
     order. Check answer waits until every blank has a choice. After checking, each menu is
     marked right or wrong and every option is listed under its blank with its rationale. */
  function clozeSelects(){ return Array.prototype.slice.call(optsEl.querySelectorAll(".pq-cloze-sel")); }
  function clozeIds(){ return clozeSelects().map(function(sel){ return sel.value; }).filter(Boolean); }

  function renderCloze(q){
    optsEl.innerHTML = "";
    optsEl.removeAttribute("role");
    optsEl.removeAttribute("aria-label");
    var wrap = document.createElement("div");
    wrap.className = "pq-cloze";
    var para = document.createElement("p");
    para.className = "pq-cloze-text";
    var parts = String(q.sentence || "").split(/\{(\d+)\}/);
    var blanks = [];
    parts.forEach(function(part, i){
      if (i % 2 === 0){ if (part) para.appendChild(document.createTextNode(part)); return; }
      var n = Number(part);
      blanks.push(n);
      var sel = document.createElement("select");
      sel.className = "pq-cloze-sel";
      sel.setAttribute("data-blank", n);
      sel.setAttribute("aria-label", "Blank " + n);
      var ph = document.createElement("option");
      ph.value = ""; ph.textContent = "Select\u2026";
      sel.appendChild(ph);
      currentDisplayOptions.filter(function(o){ return Number(o.blank) === n; }).forEach(function(o){
        var opt = document.createElement("option");
        opt.value = o.id; opt.textContent = o.text;
        sel.appendChild(opt);
      });
      sel.addEventListener("change", function(){
        errEl.style.display = "none";
        document.getElementById("pq-submit").disabled = clozeIds().length < clozeSelects().length;
      });
      para.appendChild(sel);
    });
    wrap.appendChild(para);

    /* Result rows, shown after checking */
    var results = document.createElement("div");
    results.className = "pq-cloze-results hidden";
    blanks.forEach(function(n){
      var head = document.createElement("p");
      head.className = "pq-cloze-blank";
      head.textContent = "Blank " + n;
      results.appendChild(head);
      currentDisplayOptions.filter(function(o){ return Number(o.blank) === n; }).forEach(function(o, i){
        results.appendChild(buildOption(o, i, "div"));
      });
    });
    wrap.appendChild(results);
    optsEl.appendChild(wrap);

    errEl.textContent = "Choose an option for every blank";
    document.getElementById("pq-submit").disabled = true;
    document.getElementById("pq-hint").innerHTML = "<span>Tab &middot; next menu</span>" + checkHint();
  }

  function clozeShowResults(graded){
    clozeSelects().forEach(function(sel){
      sel.disabled = true;
      var st = graded.states[sel.value];
      sel.classList.add(st && st.state === "correct" ? "is-right" : "is-wrong");
    });
    var res = optsEl.querySelector(".pq-cloze-results");
    if (res) res.classList.remove("hidden");
  }

  /* ---------- Check answer (every type) ---------- */
  document.getElementById("pq-submit").addEventListener("click", function(){
    if (answered) return;
    var q = currentQuestion();
    if (q.type === "dragdrop") userSelection = ddAnswerIds();
    if (q.type === "order") userSelection = ordIds();
    if (q.type === "cloze") userSelection = clozeIds();
    if (userSelection.length === 0){
      errEl.style.display = "block";
      return;
    }
    answered = true;
    ddCancelDrag(); ddUnpick(); ordCancelDrag(); ordUnpick();
    var graded = gradeQuestion(q, userSelection);
    var isCorrect = graded.correct;
    /* "Check · I'm sure" / "Check · I guessed" (tracking on); Enter counts as sure */
    var sure = useSure ? pendingSure : null;
    pendingSure = true;
    QuizTally.add(q.id, isCorrect);
    if (tracking){
      noteProgress(q, Progress.record(q, isCorrect, sure, userSelection.slice()));
      if (useNotes) showNote(q);
    } else {
      guestAnswers.push({id: q.id, unit: q.unit, correct: isCorrect, picked: userSelection.slice()});
    }

    if (mode === "single"){
      singleResults.push({question: q, userSelection: userSelection.slice(), correct: isCorrect, sure: sure});
      if (!isCorrect) missedMap[q.id] = q; else delete missedMap[q.id];
      document.getElementById("pq-score").textContent = "score " + singleResults.filter(function(r){ return r.correct; }).length + "/" + singleResults.length;
    } else {
      attempts[q.id] = (attempts[q.id] || 0) + 1;
      latestResult[q.id] = {question: q, userSelection: userSelection.slice(), correct: isCorrect, sure: sure};
      if (!categoryTotals[q.cat]) categoryTotals[q.cat] = {correct:0, total:0};
      categoryTotals[q.cat].total++;
      if (isCorrect){ correctSoFar++; categoryTotals[q.cat].correct++; }
      else {
        /* Anything short of fully correct goes back into the pool */
        missedSoFar++;
        var insertAt = queue.length === 0 ? 0 : Math.floor(Math.random() * (queue.length + 1));
        queue.splice(insertAt, 0, q);
      }
    }

    /* Every option shows its result and rationale, wherever it ended up */
    optsEl.querySelectorAll(".pq-option").forEach(function(el){
      var id = el.getAttribute("data-opt");
      var opt = q.options.filter(function(o){ return o.id === id; })[0];
      el.disabled = true;
      showOptionResult(el, opt, graded.states[id]);
    });
    if (q.type === "dragdrop") ddBoxes().forEach(function(b){ b.classList.add("is-done"); });
    if (q.type === "order"){ ordList().classList.add("is-done"); ordSync(); }
    if (q.type === "cloze") clozeShowResults(graded);

    /* Heading, then the optional summary, then any older question-level explanation */
    fbEl.className = "pq-feedback " + (isCorrect ? "is-correct" : "is-wrong");
    fbEl.innerHTML = "";
    var head = document.createElement("p");
    head.className = "pq-fb-head";
    head.textContent = isCorrect ? "✓ Correct" : "✕ Not quite";
    if (useSure){
      var sureTag = document.createElement("span");
      sureTag.className = "pq-sure-tag";
      sureTag.textContent = sure ? "You were sure" : "You guessed";
      head.appendChild(sureTag);
    }
    fbEl.appendChild(head);
    [isCorrect || q.type !== "order" ? "" : "Correct order: " + optText(q, q.correct), q.summary, q.explanation].forEach(function(t){
      if (!t) return;
      var p = document.createElement("p");
      p.className = "pq-fb-text";
      p.textContent = t;
      fbEl.appendChild(p);
    });
    fbEl.style.display = "block";
    if (fbEl.getBoundingClientRect().top < 0) fbEl.scrollIntoView({block: "start", behavior: "smooth"});

    document.getElementById("pq-submit").classList.add("hidden");
    var nextBtn = document.getElementById("pq-next");
    nextBtn.classList.remove("hidden");
    nextBtn.focus({preventScroll:true});
  });

  /* Drop-down questions keep their sentence in review lists, with the blanks as lines */
  function fullPrompt(q){ return q.prompt + (q.sentence ? " " + q.sentence.replace(/\{\d+\}/g, "_____") : ""); }

  /* Ordered response reads as numbered steps: "1. First → 2. Second" */
  function optText(q, ids){
    var order = q.type === "order";
    return ids.map(function(id, i){
      var opt = q.options.filter(function(o){ return o.id === id; })[0];
      return (order ? (i + 1) + ". " : "") + (opt ? opt.text : id);
    }).join(order ? " \u2192 " : ", ");
  }

  /* Review screen: summary or older explanation, then the rationale for every option
     that was picked or should have been */
  function appendReviewDetail(item, q, selection){
    [q.summary, q.explanation].forEach(function(t){
      if (!t) return;
      var line = document.createElement("div");
      line.style.marginTop = "6px";
      line.textContent = t;
      item.appendChild(line);
    });
    var graded = gradeQuestion(q, selection);
    q.options.forEach(function(o){
      var res = graded.states[o.id];
      if (!o.rationale || res.state === "neutral") return;
      var line = document.createElement("div");
      line.className = "pq-review-rat is-" + res.state;
      var b = document.createElement("strong");
      b.textContent = res.prefix + " ";
      line.appendChild(b);
      line.appendChild(document.createTextNode(o.text + ": " + o.rationale));
      item.appendChild(line);
    });
  }

  document.getElementById("pq-next").addEventListener("click", function(){
    currentRoundIndex++;
    var list = activeQuestionList();
    if (currentRoundIndex >= list.length){
      if (mode === "single") finishSession(); else showRoundComplete();
      return;
    }
    renderCurrentQuestion();
  });

  document.getElementById("pq-end-test").addEventListener("click", function(){ finishSession(); });

  function showRoundComplete(){
    calc.close();
    hide("pq-quiz-screen"); show("pq-round-complete-screen");
    var correctThisRound = currentRound.filter(function(q){ return latestResult[q.id] && latestResult[q.id].correct; }).length;
    document.getElementById("rc-title").textContent = "round " + roundsTaken + " complete";
    document.getElementById("rc-score").textContent = correctThisRound + " / " + currentRound.length;
    var remaining = queue.length;
    document.getElementById("rc-detail").textContent = remaining > 0 ? (remaining + " question" + (remaining === 1 ? "" : "s") + " left in the pool") : "pool cleared \u2014 nice work";
  }

  document.getElementById("rc-continue").addEventListener("click", function(){
    if (queue.length === 0) finishSession(); else drawRound();
  });

  function buildCategoryGrid(statsByCat){
    var gridEl = document.getElementById("category-grid");
    gridEl.innerHTML = "";
    Object.keys(catLabels).forEach(function(cat){
      var s = statsByCat[cat] || {correct:0, total:0};
      if (s.total === 0) return;
      var pct = Math.round((s.correct / s.total) * 100);
      var card = document.createElement("div");
      card.className = "pq-cat-card";
      var label = document.createElement("div");
      label.className = "pq-cat-label"; label.textContent = catLabels[cat];
      var val = document.createElement("div");
      val.className = "pq-cat-val"; val.textContent = pct + "%";
      card.appendChild(label); card.appendChild(val);
      gridEl.appendChild(card);
    });
  }

  function buildReviewListSingle(entries){
    var listEl = document.getElementById("review-list");
    listEl.innerHTML = "";
    entries.forEach(function(r){
      var item = document.createElement("div");
      item.className = "pq-review-item";
      var promptLine = document.createElement("div");
      promptLine.style.fontWeight = "600";
      promptLine.textContent = (r.correct ? "\u2713 " : "\u2717 ") + fullPrompt(r.question);
      var tag = confidenceTag(r.correct, r.sure);
      if (tag){
        var row = document.createElement("div");
        row.className = "pq-review-top";
        row.appendChild(promptLine); row.appendChild(tag);
        item.appendChild(row);
      } else item.appendChild(promptLine);
      var answerLine = document.createElement("div");
      answerLine.style.color = "var(--text2)"; answerLine.style.marginTop = "4px";
      answerLine.textContent = "your answer: " + optText(r.question, r.userSelection) + (r.correct ? "" : " | correct: " + optText(r.question, r.question.correct));
      item.appendChild(answerLine);
      appendReviewDetail(item, r.question, r.userSelection);
      listEl.appendChild(item);
    });
  }

  function tryColor(n){
    if (n <= 1) return {text:"var(--success-text)"};
    if (n === 2) return {text:"var(--warn-text)"};
    return {text:"var(--danger-text)"};
  }

  function buildReviewListRounds(attemptedPool){
    var listEl = document.getElementById("review-list");
    listEl.innerHTML = "";
    attemptedPool.forEach(function(q){
      var tries = attempts[q.id];
      var res = latestResult[q.id];
      var isResolved = res.correct;
      var col = isResolved ? tryColor(tries) : {text:"var(--danger-text)"};
      var item = document.createElement("div");
      item.className = "pq-review-item";
      var topRow = document.createElement("div");
      topRow.style.display = "flex"; topRow.style.justifyContent = "space-between"; topRow.style.gap = "10px";
      var promptEl = document.createElement("div");
      promptEl.style.fontWeight = "600"; promptEl.textContent = fullPrompt(q);
      var triesEl = document.createElement("div");
      triesEl.style.whiteSpace = "nowrap"; triesEl.style.color = col.text;
      triesEl.textContent = isResolved ? (tries + (tries === 1 ? " try" : " tries")) : "not yet correct";
      topRow.appendChild(promptEl);
      var tag = confidenceTag(res.correct, res.sure);
      if (tag) topRow.appendChild(tag);
      topRow.appendChild(triesEl);
      item.appendChild(topRow);
      var answerLine = document.createElement("div");
      answerLine.style.color = "var(--text2)"; answerLine.style.marginTop = "4px";
      if (!isResolved){
        answerLine.textContent = "your answer: " + optText(q, res.userSelection) + " | correct: " + optText(q, q.correct);
      } else {
        answerLine.textContent = (tries === 1 ? "your answer: " : "correct: ") + optText(q, q.correct);
      }
      item.appendChild(answerLine);
      appendReviewDetail(item, q, res.userSelection);
      listEl.appendChild(item);
    });
  }

  /* ---------- Session start: tracked students get a mastery snapshot; guests a fresh
     answer list, kept only in this page unless they tap "Start tracking" ---------- */
  var guestAnswers = [];
  function startSessionTracking(){
    if (tracking) startTrackedSession();
    else { guestAnswers = []; removeHeaderCta(); }
  }

  /* Guest results: "Start tracking to save this score" with this session's real numbers,
     plus a Start tracking button in the header. Tapping either carries this session's answers
     (this tab only) to Start tracking, which saves them once tracking starts. */
  function startTrackingHref(){
    var ret = location.pathname + location.search;
    return Tracking.ROOT + "start-tracking.html?from=results&return=" + encodeURIComponent(ret);
  }
  function carryAndGo(e){
    e.preventDefault();
    Tracking.carrySession(guestAnswers);
    location.href = startTrackingHref();
  }
  function guestBanner(){
    var old = document.getElementById("pq-guest-banner");
    if (old) old.remove();
    if (typeof Tracking === "undefined" || !guestAnswers.length) return;
    var n = guestAnswers.length;
    var missed = {};
    guestAnswers.forEach(function(a){ if (!a.correct) missed[a.id] = true; });
    var m = Object.keys(missed).length;
    var area = masteryLabel === "Overall" ? "overall mastery" : masteryLabel + " mastery";
    var text = (n === 1 ? "This answer" : "These " + n + " answers") + " would count toward your " + area +
      (m ? ", and the " + m + " you missed would go into your Mistake journal." : ".");
    var a = document.createElement("a");
    a.id = "pq-guest-banner";
    a.className = "pq-guest-banner";
    a.href = startTrackingHref();
    a.innerHTML = "<span class='pq-gb-text'><span class='pq-gb-title'>Start tracking to save this score</span><span class='pq-gb-sub'></span></span>" +
      "<span class='pq-gb-btn'>Start tracking &rarr;</span>";
    a.querySelector(".pq-gb-sub").textContent = text;
    a.addEventListener("click", carryAndGo);
    var center = document.querySelector("#pq-end-screen .pq-center");
    center.parentNode.insertBefore(a, center.nextSibling);

    removeHeaderCta();
    var right = document.querySelector(".cbar-right");
    if (right){
      var cta = document.createElement("a");
      cta.id = "hdr-start-tracking";
      cta.className = "hdr-cta";
      cta.href = startTrackingHref();
      cta.textContent = "Start tracking";
      cta.addEventListener("click", carryAndGo);
      right.insertBefore(cta, right.firstChild);
    }
  }
  function removeHeaderCta(){
    var c = document.getElementById("hdr-start-tracking");
    if (c) c.remove();
  }

  /* After a tracked student's third finished session: a one-time reminder to save their code */
  function codeReminder(){
    var old = document.getElementById("pq-code-reminder");
    if (old) old.remove();
    var count = Tracking.noteFinishedSession();
    var st = Tracking.state();
    if (count < 3 || !st || st.codeReminderDone) return;
    Tracking.update({codeReminderDone: true});
    var box = document.createElement("div");
    box.id = "pq-code-reminder";
    box.className = "pq-code-reminder";
    box.innerHTML = "<span>Have you saved your code? Nobody can recover a lost code, not even the site owner.</span>" +
      "<a class='btn btn-secondary' href='" + Tracking.ROOT + "settings.html'>Save my code</a>";
    var center = document.querySelector("#pq-end-screen .pq-center");
    center.parentNode.insertBefore(box, center.nextSibling);
  }

  /* ---------- Progress tracking (flag on only) ---------- */
  /* At the start of each session, note which of this quiz's questions are already mastered,
     so the results can show the before -> after change */
  var masteredAtStart = {}, journaledThisSession = {};
  function startTrackedSession(){
    var store = Progress.load();
    masteredAtStart = {};
    journaledThisSession = {};
    celebrateThisSession = false;
    bank.forEach(function(q){ if (store[q.id] && store[q.id].mastered) masteredAtStart[q.id] = true; });
  }

  var celebrateThisSession = false;
  function noteProgress(q, ev){
    if (ev.journaled) journaledThisSession[q.id] = true;
    if (ev.mastered || (ev.ready && ev.ready.length)) celebrateThisSession = true;
  }

  var BOOKMARK_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>';

  /* Bookmark button at the top right of the question, and the "My note" box under the
     rationales, shown once the answer is checked */
  var bookmarkBtn = null, noteBox = null, noteInput = null, noteText = null, addNoteBtn = null, pendingSure = true;
  if (tracking){
    var qhead = document.createElement("div");
    qhead.className = "pq-qhead";
    bookmarkBtn = document.createElement("button");
    bookmarkBtn.type = "button";
    bookmarkBtn.id = "pq-bookmark";
    bookmarkBtn.className = "pq-bookmark";
    qhead.appendChild(bookmarkBtn);
    var promptEl = document.getElementById("pq-prompt");
    promptEl.parentNode.insertBefore(qhead, promptEl);
    bookmarkBtn.addEventListener("click", function(e){
      var q = currentQuestion();
      if (!q) return;
      Progress.toggleBookmark(q.id);
      syncBookmark(q);
      /* After a mouse click, give Enter back to check / next */
      if (e.detail > 0) bookmarkBtn.blur();
    });

  }
  if (useSure){
    /* Two check buttons stand in for "Check answer". The original button stays in the page
       (hidden) so everything that enables, disables or presses it keeps working. */
    var submitBtn = document.getElementById("pq-submit");
    var btnRow = submitBtn.parentNode;
    submitBtn.classList.add("is-tracked");
    var checkSure = makeButton("pq-check-sure", "btn btn-primary", "Check \u00b7 I'm sure");
    var checkGuess = makeButton("pq-check-guess", "btn btn-secondary", "Check \u00b7 I guessed");
    btnRow.insertBefore(checkSure, submitBtn);
    btnRow.insertBefore(checkGuess, submitBtn);
    [[checkSure, true], [checkGuess, false]].forEach(function(b){
      b[0].addEventListener("click", function(){ pendingSure = b[1]; submitBtn.click(); pendingSure = true; });
    });
    var syncChecks = function(){
      [checkSure, checkGuess].forEach(function(b){
        b.classList.toggle("hidden", submitBtn.classList.contains("hidden"));
        b.disabled = submitBtn.disabled;
      });
    };
    new MutationObserver(syncChecks).observe(submitBtn, {attributes: true, attributeFilter: ["class", "disabled"]});
    syncChecks();
  }
  if (useNotes){
    var btnRow = document.getElementById("pq-next").parentNode;
    /* After checking: "+ Add note" on its own line above "Next question". The note box opens only
       when it's tapped (Cancel / Save note); a saved note shows with an Edit button. */
    addNoteBtn = makeButton("pq-add-note", "btn btn-secondary pq-addnote hidden", "+ Add note");
    btnRow.parentNode.insertBefore(addNoteBtn, btnRow);

    noteBox = document.createElement("div");
    noteBox.className = "pq-note hidden";
    var noteHead = document.createElement("div");
    noteHead.className = "pq-note-head";
    var noteLabel = document.createElement("label");
    noteLabel.className = "pq-note-label";
    noteLabel.setAttribute("for", "pq-note-input");
    noteLabel.textContent = "My note \u00b7 shows every time this question comes back";
    var noteEdit = makeButton("pq-note-edit", "btn btn-secondary pq-note-btn", "Edit");
    noteHead.appendChild(noteLabel); noteHead.appendChild(noteEdit);
    noteText = document.createElement("p");
    noteText.className = "pq-note-text";
    noteInput = document.createElement("textarea");
    noteInput.id = "pq-note-input";
    noteInput.rows = 2;
    var noteActions = document.createElement("div");
    noteActions.className = "pq-note-actions";
    var noteCancel = makeButton("pq-note-cancel", "btn btn-secondary pq-note-btn", "Cancel");
    var noteSave = makeButton("pq-note-save", "btn btn-primary pq-note-btn", "Save note");
    noteActions.appendChild(noteCancel); noteActions.appendChild(noteSave);
    var noteWarn = document.createElement("p");
    noteWarn.className = "pq-note-warn hidden";
    noteWarn.textContent = "Keep notes about the content only. Never include client names, room numbers or anything from clinicals that could identify a real person.";
    noteBox.appendChild(noteHead); noteBox.appendChild(noteWarn); noteBox.appendChild(noteText); noteBox.appendChild(noteInput); noteBox.appendChild(noteActions);
    optsEl.parentNode.insertBefore(noteBox, optsEl.nextSibling);

    addNoteBtn.addEventListener("click", function(){ editNote(); });
    noteEdit.addEventListener("click", function(){ editNote(); });
    noteCancel.addEventListener("click", function(){ var q = currentQuestion(); if (q) showNote(q); });
    noteSave.addEventListener("click", function(){
      var q = currentQuestion();
      if (!q) return;
      Progress.setNote(q.id, noteInput.value);
      showNote(q);
    });
  }
  /* Keyboard hint: with tracking on, Enter checks as "I'm sure" and Shift+Enter as "I guessed" */
  function checkHint(){
    return useSure ? "<span>Enter &middot; I'm sure / next</span><span>Shift+Enter &middot; I guessed</span>" : "<span>Enter &middot; check / next</span>";
  }
  function makeButton(id, cls, text){
    var b = document.createElement("button");
    b.type = "button"; b.id = id; b.className = cls; b.textContent = text;
    return b;
  }
  function syncBookmark(q){
    var r = Progress.get(q.id);
    var on = !!(r && r.bookmarked);
    bookmarkBtn.innerHTML = BOOKMARK_ICON + (on ? "Bookmarked" : "Bookmark");
    bookmarkBtn.classList.toggle("is-on", on);
    bookmarkBtn.setAttribute("aria-pressed", on ? "true" : "false");
  }
  /* Note states: hidden with "+ Add note" (no note yet), showing a saved note with Edit,
     or editing with Cancel / Save note */
  function hideNote(){
    noteBox.classList.add("hidden");
    addNoteBtn.classList.add("hidden");
  }
  function showNote(q){
    noteBox.querySelector(".pq-note-warn").classList.add("hidden");
    var r = Progress.get(q.id);
    var note = (r && r.note) || "";
    noteBox.classList.remove("is-editing");
    noteBox.classList.toggle("hidden", !note);
    addNoteBtn.classList.toggle("hidden", !!note);
    noteText.textContent = note;
  }
  function editNote(){
    /* Shown once, the first time someone adds a note */
    var warn = noteBox.querySelector(".pq-note-warn");
    var st = Tracking.state();
    if (st && !st.noteReminderDone){
      warn.classList.remove("hidden");
      Tracking.update({noteReminderDone: true});
    }
    var r = Progress.get(currentQuestion().id);
    noteInput.value = (r && r.note) || "";
    noteBox.classList.add("is-editing");
    noteBox.classList.remove("hidden");
    addNoteBtn.classList.add("hidden");
    noteInput.focus();
  }

  /* Mastery box under the score: this quiz's questions mastered before -> after the session,
     a bar (mastered / newly mastered / still learning / not seen) and a one-line summary */
  function buildMasteryBox(){
    var old = document.getElementById("pq-mastery");
    if (old) old.remove();
    var store = Progress.load();
    var total = bank.length, kept = 0, fresh = 0, learning = 0, before = Object.keys(masteredAtStart).length;
    bank.forEach(function(q){
      var r = store[q.id];
      if (r && r.mastered){ if (masteredAtStart[q.id]) kept++; else fresh++; }
      else if (r && r.seen) learning++;
    });
    var pct = function(n){ return total ? Math.round(n / total * 100) : 0; };
    var journaled = Object.keys(journaledThisSession).filter(function(id){ return store[id] && store[id].journal; }).length;

    var box = document.createElement("section");
    box.id = "pq-mastery";
    box.className = "pq-mastery";
    var head = document.createElement("div");
    head.className = "pq-mastery-head";
    var title = document.createElement("span");
    title.className = "pq-mastery-title";
    title.textContent = masteryLabel + " mastery";
    var change = document.createElement("span");
    change.className = "pq-mastery-change";
    change.appendChild(document.createTextNode(pct(before) + "% \u2192 "));
    var after = document.createElement("strong");
    after.textContent = pct(kept + fresh) + "%";
    change.appendChild(after);
    head.appendChild(title); head.appendChild(change);

    var bar = document.createElement("div");
    bar.className = "pq-mbar";
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", "Mastery went from " + pct(before) + " to " + pct(kept + fresh) + " percent");
    [["is-mastered", kept], ["is-new", fresh], ["is-learning", learning]].forEach(function(seg){
      if (!seg[1]) return;
      var el = document.createElement("div");
      el.className = "pq-mbar-seg " + seg[0];
      el.style.width = (seg[1] / total * 100) + "%";
      bar.appendChild(el);
    });

    var line = document.createElement("div");
    line.className = "pq-mastery-line";
    line.appendChild(document.createTextNode(fresh === 0 ? "No questions newly mastered." : fresh + (fresh === 1 ? " question" : " questions") + " newly mastered."));
    if (journaled){
      line.appendChild(document.createTextNode(" " + journaled + (journaled === 1 ? " missed question was" : " missed questions were") + " added to your "));
      /* The Mistake journal page comes in a later phase; until then this is plain text */
      var journal = document.createElement(Progress.JOURNAL_URL ? "a" : "span");
      if (Progress.JOURNAL_URL) journal.href = Progress.JOURNAL_URL;
      journal.textContent = "Mistake journal";
      line.appendChild(journal);
      line.appendChild(document.createTextNode("."));
    }
    box.appendChild(head); box.appendChild(bar); box.appendChild(line);
    var center = document.querySelector("#pq-end-screen .pq-center");
    center.parentNode.insertBefore(box, center.nextSibling);
  }

  /* Review tags: "Sure" (right and sure), "Lucky guess" (right but guessed),
     "Blind spot" (wrong but sure). Wrong and guessed gets no tag. */
  function confidenceTag(correct, sure){
    if (!tracking || sure == null || (!correct && !sure)) return null;
    var tag = document.createElement("span");
    tag.className = correct ? (sure ? "pq-tag-sure" : "pq-tag-lucky") : "pq-tag-blind";
    tag.textContent = correct ? (sure ? "Sure" : "Lucky guess") : "Blind spot";
    return tag;
  }

  function finishSession(){
    calc.close();
    hide("pq-quiz-screen"); hide("pq-round-complete-screen"); show("pq-end-screen");
    if (tracking){
      buildMasteryBox();
      codeReminder();
      if (celebrateThisSession) Tracking.celebrate();
    } else guestBanner();
    document.getElementById("category-heading").textContent = "by category";

    if (mode === "single"){
      document.getElementById("end-title").textContent = "session complete";
      hide("end-rounds-subtitle");
      show("end-stats-single"); hide("end-stats-rounds");

      var totalAnswered = singleResults.length;
      var correctCount = singleResults.filter(function(r){ return r.correct; }).length;
      document.getElementById("end-score").textContent = correctCount + " / " + totalAnswered;
      document.getElementById("end-percent").textContent = totalAnswered > 0 ? (Math.round((correctCount / totalAnswered) * 100) + "% correct") : "no questions answered";

      var statsByCat = {};
      singleResults.forEach(function(r){
        var c = r.question.cat;
        if (!statsByCat[c]) statsByCat[c] = {correct:0, total:0};
        statsByCat[c].total++;
        if (r.correct) statsByCat[c].correct++;
      });
      buildCategoryGrid(statsByCat);
      buildReviewListSingle(singleResults);
      QuizTally.flush(false);
      /* Challenges save the score here (only the first finish counts) */
      if (opts && opts.onFinish) opts.onFinish({correct: correctCount, answered: totalAnswered, total: bank.length,
        answers: singleResults.map(function(r){ return {q: r.question.id, ok: !!r.correct}; })});

      var missedCount = Object.keys(missedMap).length;
      var missedBtn = document.getElementById("end-missed");
      missedBtn.classList.remove("hidden");
      if (missedCount === 0){
        missedBtn.textContent = "no missed questions";
        missedBtn.disabled = true;
      } else {
        missedBtn.textContent = "redo " + missedCount + " missed question" + (missedCount === 1 ? "" : "s");
        missedBtn.disabled = false;
      }
    } else {
      document.getElementById("end-title").textContent = "final stats";
      show("end-rounds-subtitle");
      document.getElementById("end-rounds-subtitle").textContent = roundsTaken + " round" + (roundsTaken === 1 ? "" : "s") + " completed";
      hide("end-stats-single"); show("end-stats-rounds");

      var attemptedPool = pool.filter(function(q){ return attempts[q.id]; });
      var completedCount = attemptedPool.filter(function(q){ return latestResult[q.id] && latestResult[q.id].correct; }).length;
      var pctCompleted = pool.length > 0 ? Math.round((completedCount / pool.length) * 100) : 0;
      var totalSubs = correctSoFar + missedSoFar;
      var overallPct = totalSubs > 0 ? Math.round((correctSoFar / totalSubs) * 100) : 0;
      document.getElementById("end-pool-pct").textContent = pctCompleted + "%";
      document.getElementById("end-accuracy-pct").textContent = overallPct + "%";

      var statsByCat2 = categoryTotals;
      buildCategoryGrid(statsByCat2);
      buildReviewListRounds(attemptedPool);
      hide("end-missed");
    }
  }

  document.getElementById("end-restart").addEventListener("click", function(){
    hide("pq-end-screen"); show("end-missed");
    removeHeaderCta();
    if (autoStart){
      /* Practice the same session again */
      pool = bank.slice(); mode = "single"; missedMap = {};
      startSessionTracking();
      startSingle();
      return;
    }
    show("pq-setup-screen");
  });

  /* Keyboard: letters or 1-9 pick (or, for drag and drop, move) an option; Enter checks / goes next */
  document.addEventListener("keydown", function(e){
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.getElementById("pq-quiz-screen").classList.contains("hidden")) return;
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    var nav = document.getElementById("navbtn");
    if (nav && nav.getAttribute("aria-expanded") === "true") return;
    if (e.key === "Enter"){
      if (t && (t.id === "pq-end-test" || t.id === "pq-bookmark" || t.tagName === "A")) return;
      if (t && t.closest && t.closest(".pq-note, #pq-add-note, #pq-check-sure, #pq-check-guess")) return;
      e.preventDefault();
      var submit = document.getElementById("pq-submit");
      if (answered) document.getElementById("pq-next").click();
      else if (!submit.disabled){
        if (useSure && e.shiftKey) pendingSure = false;
        submit.click();
        pendingSure = true;
      }
      return;
    }
    if (answered) return;
    var q = currentQuestion();
    if (!q) return;
    if (e.key === "Escape"){ ddUnpick(); ordUnpick(); return; }
    if (q.type === "order" && ordPicked && (e.key === "ArrowUp" || e.key === "ArrowDown")){
      e.preventDefault();
      ordMoveTo(ordPicked, ordItems().indexOf(ordPicked) + (e.key === "ArrowUp" ? -1 : 1));
      return;
    }
    var k = e.key.length === 1 ? e.key.toUpperCase() : "";
    var idx = k ? LETTERS.indexOf(k) : -1;
    if (idx === -1 && k >= "1" && k <= "9") idx = Number(k) - 1;
    if (idx === -1 || idx >= currentDisplayOptions.length) return;
    e.preventDefault();
    /* Ordered response: the number is the spot, not the option's starting letter */
    if (q.type === "order"){ if (/[1-9]/.test(k)) ordPick(ordItems()[idx]); return; }
    if (q.type === "cloze") return;
    var el = optsEl.querySelector('.pq-option[data-opt="' + currentDisplayOptions[idx].id + '"]');
    if (!el) return;
    if (q.type === "dragdrop") ddMove(el, ddOtherBox(el));
    else el.click();
  });

  document.getElementById("end-missed").addEventListener("click", function(){
    if (document.getElementById("end-missed").disabled) return;
    var list = Object.keys(missedMap).map(function(id){ return missedMap[id]; });
    if (list.length === 0) return;
    hide("pq-end-screen");
    mode = "single";
    pool = list;
    missedMap = {};
    startSessionTracking();
    startSingle();
  });
}
