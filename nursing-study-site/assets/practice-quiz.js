function initPracticeQuiz(bank, catLabels){
  var ROUND_SIZE = 5;
  var mode = null, pool = [], missedMap = {};
  var singleQuestions = [], singleResults = [];
  var queue = [], currentRound = [], currentRoundIndex = 0, roundsTaken = 0;
  var attempts = {}, latestResult = {}, correctSoFar = 0, missedSoFar = 0, categoryTotals = {};
  var answered = false, userSelection = [], currentDisplayOptions = [];
  var LETTERS = "ABCDEFGH";

  /* Drag-drop questions are written with stem/rationale and options flagged correct;
     give them the same prompt/explanation/ids/correct shape as the other types */
  bank.forEach(function(q){
    if (q.type !== "dragdrop") return;
    if (q.prompt == null) q.prompt = q.stem;
    if (q.explanation == null) q.explanation = q.rationale || "";
    q.correct = [];
    q.options = q.options.map(function(o, i){
      var id = o.id || LETTERS.charAt(i).toLowerCase();
      if (o.correct) q.correct.push(id);
      return {id: id, text: o.text, correct: !!o.correct};
    });
  });

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
  document.getElementById("pq-start").addEventListener("click", function(){
    pool = stratifiedSample(bank, chosenCount);
    missedMap = {};
    hide("pq-setup-screen");
    if (mode === "single") startSingle(); else startRounds();
  });
  syncSetup();

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

  /* Highlight picked rows and only allow Check answer once something is picked */
  function syncSelection(){
    document.querySelectorAll("#pq-options .pq-option").forEach(function(row){
      var on = userSelection.indexOf(row.getAttribute("data-opt")) !== -1;
      row.classList.toggle("is-selected", on);
      row.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.getElementById("pq-submit").disabled = userSelection.length === 0;
  }

  function pickOption(q, optId){
    if (answered) return;
    if (q.type === "sata"){
      if (userSelection.indexOf(optId) === -1) userSelection.push(optId);
      else userSelection = userSelection.filter(function(id){ return id !== optId; });
    } else {
      userSelection = [optId];
    }
    document.getElementById("pq-error").style.display = "none";
    syncSelection();
  }

  function renderCurrentQuestion(){
    answered = false; userSelection = [];
    document.getElementById("pq-error").style.display = "none";
    document.getElementById("pq-error").textContent = "select at least one answer";
    var fbReset = document.getElementById("pq-feedback");
    fbReset.style.display = "none";
    fbReset.className = "pq-feedback";
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
      totalLabel = "round " + roundsTaken + " \u2014 question " + (currentRoundIndex + 1) + " of " + list.length;
      document.getElementById("pq-score").textContent = "";
    }
    document.getElementById("pq-progress").textContent = totalLabel;
    document.getElementById("pq-progress-bar").style.width = Math.round((currentRoundIndex / list.length) * 100) + "%";
    document.getElementById("pq-type-label").textContent = q.type === "sata" ? "select all that apply" : q.type === "dragdrop" ? "drag and drop \u00b7 or tap an option, then a box" : "select one";
    document.getElementById("pq-prompt").textContent = q.prompt;

    if (q.type === "dragdrop"){ renderDragDrop(q); return; }

    /* Each choice is a real button with a square letter box; pressed state carries the selection */
    var optsEl = document.getElementById("pq-options");
    optsEl.innerHTML = "";
    optsEl.setAttribute("role", "group");
    optsEl.setAttribute("aria-label", q.type === "sata" ? "Select all that apply" : "Select one");
    currentDisplayOptions.forEach(function(opt, i){
      var row = document.createElement("button");
      row.type = "button";
      row.className = "pq-option";
      row.setAttribute("data-opt", opt.id);
      row.setAttribute("aria-pressed", "false");
      var letter = document.createElement("span");
      letter.className = "pq-letter";
      letter.setAttribute("aria-hidden", "true");
      letter.textContent = LETTERS.charAt(i);
      var span = document.createElement("span");
      span.className = "pq-opt-text";
      span.textContent = opt.text;
      row.appendChild(letter); row.appendChild(span);
      row.addEventListener("click", function(){ pickOption(q, opt.id); });
      optsEl.appendChild(row);
    });

    var last = LETTERS.charAt(currentDisplayOptions.length - 1);
    document.getElementById("pq-hint").innerHTML = "<span>A&ndash;" + last + " &middot; pick</span><span>Enter &middot; check / next</span>";
  }

  /* ---------- Drag and drop ----------
     Two boxes; every option starts on the left. Options move by pointer drag
     (mouse, pen and touch all use pointer events), by tapping an option and then
     a box, or with the A-H keys. Only the answer box counts when checked. */
  var ddPicked = null, ddDrag = null, ddDragEnd = {item: null, at: 0};

  function ddBoxes(){ return document.querySelectorAll("#pq-options .pq-dd-box"); }
  function ddList(box){ return box.querySelector(".pq-dd-list"); }
  function ddBoxOf(item){ return item.closest(".pq-dd-box"); }
  function ddOtherBox(item){
    var b = ddBoxes();
    return ddBoxOf(item) === b[0] ? b[1] : b[0];
  }
  function ddAnswerIds(){
    var box = document.querySelector('#pq-options .pq-dd-box[data-box="answer"]');
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
      document.getElementById("pq-error").style.display = "none";
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
    document.querySelectorAll("#pq-options .pq-dd-box").forEach(function(b){ b.classList.toggle("is-target", b !== ddBoxOf(item)); });
  }

  function ddUnpick(){
    if (ddPicked){
      ddPicked.classList.remove("is-selected");
      ddPicked.setAttribute("aria-pressed", "false");
    }
    ddPicked = null;
    document.querySelectorAll("#pq-options .pq-dd-box").forEach(function(b){ b.classList.remove("is-target"); });
  }

  function ddSync(){
    ddBoxes().forEach(function(box){
      var n = box.querySelectorAll(".pq-dd-item").length;
      box.classList.toggle("is-empty", n === 0);
      box.querySelector(".pq-dd-count").textContent = n;
    });
  }

  function ddBoxAt(x, y){
    var el = document.elementFromPoint(x, y);
    return el ? el.closest("#pq-options .pq-dd-box") : null;
  }

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
    if (ddDrag.raf) cancelAnimationFrame(ddDrag.raf);
    if (ddDrag.ghost) ddDrag.ghost.remove();
    ddDrag.item.classList.remove("is-dragging");
    document.querySelectorAll("#pq-options .pq-dd-box").forEach(function(b){ b.classList.remove("is-over"); });
    ddDrag = null;
  }

  function ddPointerDown(e){
    if (answered || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    var item = e.currentTarget;
    ddCancelDrag();
    ddDrag = {item: item, id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, active: false};
    try { item.setPointerCapture(e.pointerId); } catch (err) {}
  }

  function ddPointerMove(e){
    if (!ddDrag || e.pointerId !== ddDrag.id) return;
    ddDrag.x = e.clientX; ddDrag.y = e.clientY;
    if (!ddDrag.active){
      if (Math.abs(e.clientX - ddDrag.sx) + Math.abs(e.clientY - ddDrag.sy) < 8) return;
      var item = ddDrag.item, r = item.getBoundingClientRect();
      ddUnpick();
      ddDrag.active = true;
      ddDrag.ox = ddDrag.sx - r.left; ddDrag.oy = ddDrag.sy - r.top;
      var ghost = item.cloneNode(true);
      ghost.className = "pq-option pq-dd-item pq-dd-ghost";
      ghost.removeAttribute("id");
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
      ddDrag = null;
    }
  }

  function renderDragDrop(q){
    ddPicked = null; ddCancelDrag();
    var optsEl = document.getElementById("pq-options");
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

    var pool = ddList(wrap.querySelector('[data-box="pool"]'));
    currentDisplayOptions.forEach(function(opt, i){
      var item = document.createElement("button");
      item.type = "button";
      item.className = "pq-option pq-dd-item";
      item.setAttribute("data-opt", opt.id);
      item.setAttribute("data-order", i);
      item.setAttribute("aria-pressed", "false");
      var letter = document.createElement("span");
      letter.className = "pq-letter";
      letter.setAttribute("aria-hidden", "true");
      letter.textContent = LETTERS.charAt(i);
      var span = document.createElement("span");
      span.className = "pq-opt-text";
      span.textContent = opt.text;
      item.appendChild(letter); item.appendChild(span);
      item.addEventListener("pointerdown", ddPointerDown);
      item.addEventListener("pointermove", ddPointerMove);
      item.addEventListener("pointerup", ddPointerUp);
      item.addEventListener("pointercancel", ddPointerUp);
      item.addEventListener("click", function(){
        /* A finished drag can fire a click on the item; don't treat it as a tap */
        if (ddDragEnd.item === item && Date.now() - ddDragEnd.at < 400) return;
        ddPick(item);
      });
      pool.appendChild(item);
    });
    ddSync();

    /* Checking with an empty answer box shows the inline message instead */
    document.getElementById("pq-error").textContent = "move at least one answer into the answer box";
    document.getElementById("pq-submit").disabled = false;
    var last = LETTERS.charAt(currentDisplayOptions.length - 1);
    document.getElementById("pq-hint").innerHTML = "<span>A&ndash;" + last + " &middot; move between boxes</span><span>Enter &middot; check / next</span>";
  }

  /* Green = correct option moved over, red = wrong option moved over,
     dashed red outline = correct option left behind */
  function markDragDrop(q){
    ddUnpick();
    document.querySelectorAll("#pq-options .pq-dd-item").forEach(function(item){
      var optId = item.getAttribute("data-opt");
      var letter = item.querySelector(".pq-letter");
      var inAnswer = ddBoxOf(item).getAttribute("data-box") === "answer";
      var isRight = q.correct.indexOf(optId) !== -1;
      item.disabled = true;
      if (inAnswer && isRight){ item.classList.add("is-correct"); letter.textContent = "✓"; }
      else if (inAnswer){ item.classList.add("is-wrong"); letter.textContent = "✕"; }
      else if (isRight){ item.classList.add("is-missed"); }
    });
    document.querySelectorAll("#pq-options .pq-dd-box").forEach(function(b){ b.classList.add("is-done"); });
  }

  document.getElementById("pq-submit").addEventListener("click", function(){
    if (answered) return;
    var list = activeQuestionList();
    var q = list[currentRoundIndex];
    if (q.type === "dragdrop") userSelection = ddAnswerIds();
    if (userSelection.length === 0){
      document.getElementById("pq-error").style.display = "block";
      return;
    }
    answered = true;
    ddCancelDrag();
    var isCorrect = arraysMatch(userSelection, q.correct);

    if (mode === "single"){
      singleResults.push({question: q, userSelection: userSelection.slice(), correct: isCorrect});
      if (!isCorrect) missedMap[q.id] = q; else delete missedMap[q.id];
      document.getElementById("pq-score").textContent = "score " + singleResults.filter(function(r){ return r.correct; }).length + "/" + singleResults.length;
    } else {
      attempts[q.id] = (attempts[q.id] || 0) + 1;
      latestResult[q.id] = {question: q, userSelection: userSelection.slice(), correct: isCorrect};
      if (!categoryTotals[q.cat]) categoryTotals[q.cat] = {correct:0, total:0};
      categoryTotals[q.cat].total++;
      if (isCorrect){ correctSoFar++; categoryTotals[q.cat].correct++; }
      else {
        missedSoFar++;
        var insertAt = queue.length === 0 ? 0 : Math.floor(Math.random() * (queue.length + 1));
        queue.splice(insertAt, 0, q);
      }
    }

    if (q.type === "dragdrop") markDragDrop(q);

    /* Correct choices turn green with a check; wrong picks turn red with an x; the rest stay neutral */
    if (q.type !== "dragdrop") document.querySelectorAll("#pq-options .pq-option").forEach(function(row){
      var optId = row.getAttribute("data-opt");
      var letter = row.querySelector(".pq-letter");
      row.classList.remove("is-selected");
      row.disabled = true;
      if (q.correct.indexOf(optId) !== -1){
        row.classList.add("is-correct"); letter.textContent = "\u2713";
      } else if (userSelection.indexOf(optId) !== -1){
        row.classList.add("is-wrong"); letter.textContent = "\u2715";
      }
    });

    /* The heading says correct / not quite, so drop that prefix if the explanation repeats it */
    var fb = document.getElementById("pq-feedback");
    fb.className = "pq-feedback " + (isCorrect ? "is-correct" : "is-wrong");
    fb.innerHTML = "";
    var head = document.createElement("p");
    head.className = "pq-fb-head";
    head.textContent = isCorrect ? "\u2713 Correct" : "\u2715 Not quite";
    var text = document.createElement("p");
    text.className = "pq-fb-text";
    text.textContent = String(q.explanation).replace(/^\s*(correct|not quite|incorrect)\s*[.!:\u2014\u2013-]\s*/i, "");
    fb.appendChild(head); fb.appendChild(text);
    fb.style.display = "block";

    document.getElementById("pq-submit").classList.add("hidden");
    var nextBtn = document.getElementById("pq-next");
    nextBtn.classList.remove("hidden");
    nextBtn.focus({preventScroll:true});
  });

  function optText(q, ids){
    return ids.map(function(id){
      var opt = q.options.filter(function(o){ return o.id === id; })[0];
      return opt ? opt.text : id;
    }).join(", ");
  }

  function arraysMatch(a, b){
    if (a.length !== b.length) return false;
    var as = a.slice().sort(), bs = b.slice().sort();
    for (var i = 0; i < as.length; i++) if (as[i] !== bs[i]) return false;
    return true;
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
      promptLine.textContent = (r.correct ? "\u2713 " : "\u2717 ") + r.question.prompt;
      item.appendChild(promptLine);
      var answerLine = document.createElement("div");
      answerLine.style.color = "var(--text2)"; answerLine.style.marginTop = "4px";
      answerLine.textContent = "your answer: " + optText(r.question, r.userSelection) + (r.correct ? "" : " | correct: " + optText(r.question, r.question.correct));
      item.appendChild(answerLine);
      var explLine = document.createElement("div");
      explLine.style.marginTop = "6px";
      explLine.textContent = r.question.explanation;
      item.appendChild(explLine);
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
      promptEl.style.fontWeight = "600"; promptEl.textContent = q.prompt;
      var triesEl = document.createElement("div");
      triesEl.style.whiteSpace = "nowrap"; triesEl.style.color = col.text;
      triesEl.textContent = isResolved ? (tries + (tries === 1 ? " try" : " tries")) : "not yet correct";
      topRow.appendChild(promptEl); topRow.appendChild(triesEl);
      item.appendChild(topRow);
      var answerLine = document.createElement("div");
      answerLine.style.color = "var(--text2)"; answerLine.style.marginTop = "4px";
      if (!isResolved){
        answerLine.textContent = "your answer: " + optText(q, res.userSelection) + " | correct: " + optText(q, q.correct);
      } else {
        answerLine.textContent = (tries === 1 ? "your answer: " : "correct: ") + optText(q, q.correct);
      }
      item.appendChild(answerLine);
      var explLine = document.createElement("div");
      explLine.style.marginTop = "6px";
      explLine.textContent = q.explanation;
      item.appendChild(explLine);
      listEl.appendChild(item);
    });
  }

  function finishSession(){
    hide("pq-quiz-screen"); hide("pq-round-complete-screen"); show("pq-end-screen");
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
    hide("pq-end-screen"); show("end-missed"); show("pq-setup-screen");
  });

  /* Keyboard: A-H or 1-8 pick a choice, Enter checks / goes to the next question */
  document.addEventListener("keydown", function(e){
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.getElementById("pq-quiz-screen").classList.contains("hidden")) return;
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    var nav = document.getElementById("navbtn");
    if (nav && nav.getAttribute("aria-expanded") === "true") return;
    if (e.key === "Enter"){
      if (t && (t.id === "pq-end-test" || t.tagName === "A")) return;
      e.preventDefault();
      var submit = document.getElementById("pq-submit");
      if (answered) document.getElementById("pq-next").click();
      else if (!submit.disabled) submit.click();
      return;
    }
    if (answered) return;
    var k = e.key.length === 1 ? e.key.toUpperCase() : "";
    var idx = LETTERS.indexOf(k);
    if (idx === -1 && k >= "1" && k <= "8") idx = Number(k) - 1;
    var q = currentQuestion();
    if (q && q.type === "dragdrop"){
      if (idx !== -1 && idx < currentDisplayOptions.length){
        e.preventDefault();
        var item = document.querySelector('#pq-options .pq-dd-item[data-opt="' + currentDisplayOptions[idx].id + '"]');
        if (item) ddMove(item, ddOtherBox(item));
      } else if (e.key === "Escape") ddUnpick();
      return;
    }
    var rows = document.querySelectorAll("#pq-options .pq-option");
    if (idx !== -1 && idx < rows.length){
      e.preventDefault();
      rows[idx].click();
    }
  });

  document.getElementById("end-missed").addEventListener("click", function(){
    if (document.getElementById("end-missed").disabled) return;
    var list = Object.keys(missedMap).map(function(id){ return missedMap[id]; });
    if (list.length === 0) return;
    hide("pq-end-screen");
    mode = "single";
    pool = list;
    missedMap = {};
    startSingle();
  });
}
