function initPracticeQuiz(bank, catLabels){
  var ROUND_SIZE = 5;
  var mode = null, pool = [], missedMap = {};
  var singleQuestions = [], singleResults = [];
  var queue = [], currentRound = [], currentRoundIndex = 0, roundsTaken = 0;
  var attempts = {}, latestResult = {}, correctSoFar = 0, missedSoFar = 0, categoryTotals = {};
  var answered = false, userSelection = [], currentDisplayOptions = [];

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

  document.querySelectorAll(".pq-mode-btn").forEach(function(btn){
    btn.addEventListener("click", function(){
      mode = btn.getAttribute("data-mode");
      hide("pq-mode-screen"); show("pq-count-screen");
      document.getElementById("pq-count-single").classList.toggle("hidden", mode !== "single");
      document.getElementById("pq-count-rounds").classList.toggle("hidden", mode !== "rounds");
    });
  });

  document.getElementById("pq-back").addEventListener("click", function(){
    hide("pq-count-screen"); show("pq-mode-screen");
  });

  document.querySelectorAll(".pq-count-btn").forEach(function(btn){
    btn.addEventListener("click", function(){
      var count = parseInt(btn.getAttribute("data-count"), 10);
      pool = stratifiedSample(bank, count);
      missedMap = {};
      hide("pq-count-screen");
      if (mode === "single") startSingle(); else startRounds();
    });
  });

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

  function renderCurrentQuestion(){
    answered = false; userSelection = [];
    document.getElementById("pq-error").style.display = "none";
    document.getElementById("pq-feedback").style.display = "none";
    document.getElementById("pq-submit").classList.remove("hidden");
    document.getElementById("pq-next").classList.add("hidden");

    var list = activeQuestionList();
    var q = list[currentRoundIndex];
    currentDisplayOptions = shuffle(q.options);

    var totalLabel;
    if (mode === "single"){
      totalLabel = "question " + (currentRoundIndex + 1) + " of " + list.length;
      document.getElementById("pq-score").textContent = "score: " + singleResults.filter(function(r){ return r.correct; }).length + "/" + currentRoundIndex;
    } else {
      totalLabel = "round " + roundsTaken + " \u2014 question " + (currentRoundIndex + 1) + " of " + list.length;
      document.getElementById("pq-score").textContent = "";
    }
    document.getElementById("pq-progress").textContent = totalLabel;
    document.getElementById("pq-progress-bar").style.width = Math.round((currentRoundIndex / list.length) * 100) + "%";
    document.getElementById("pq-type-label").textContent = q.type === "sata" ? "select all that apply" : "select one";
    document.getElementById("pq-prompt").textContent = q.prompt;

    var optsEl = document.getElementById("pq-options");
    optsEl.innerHTML = "";
    currentDisplayOptions.forEach(function(opt){
      var row = document.createElement("label");
      row.className = "pq-option-row";
      row.setAttribute("data-opt", opt.id);
      var input = document.createElement("input");
      input.type = q.type === "sata" ? "checkbox" : "radio";
      input.name = "pq-opt";
      input.value = opt.id;
      input.addEventListener("change", function(){
        if (q.type === "sata"){
          if (input.checked) userSelection.push(opt.id);
          else userSelection = userSelection.filter(function(id){ return id !== opt.id; });
        } else {
          userSelection = [opt.id];
        }
        document.getElementById("pq-error").style.display = "none";
      });
      var span = document.createElement("span");
      span.textContent = opt.text;
      row.appendChild(input); row.appendChild(span);
      optsEl.appendChild(row);
    });
  }

  document.getElementById("pq-submit").addEventListener("click", function(){
    if (answered) return;
    if (userSelection.length === 0){
      document.getElementById("pq-error").style.display = "block";
      return;
    }
    answered = true;
    var list = activeQuestionList();
    var q = list[currentRoundIndex];
    var isCorrect = arraysMatch(userSelection, q.correct);

    if (mode === "single"){
      singleResults.push({question: q, userSelection: userSelection.slice(), correct: isCorrect});
      if (!isCorrect) missedMap[q.id] = q; else delete missedMap[q.id];
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

    document.querySelectorAll("#pq-options label").forEach(function(row){
      var optId = row.getAttribute("data-opt");
      if (q.correct.indexOf(optId) !== -1){
        row.style.borderColor = "var(--success-border)";
      } else if (userSelection.indexOf(optId) !== -1){
        row.style.borderColor = "var(--danger-border)";
      }
    });

    var fb = document.getElementById("pq-feedback");
    fb.style.display = "block";
    fb.style.color = isCorrect ? "var(--success-text)" : "var(--danger-text)";
    fb.textContent = (isCorrect ? "Correct. " : "Not quite. ") + q.explanation;

    document.getElementById("pq-submit").classList.add("hidden");
    document.getElementById("pq-next").classList.remove("hidden");
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
    hide("pq-end-screen"); show("end-missed"); show("pq-mode-screen");
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
