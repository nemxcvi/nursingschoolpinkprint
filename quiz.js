function initQuiz(QUESTIONS){
  var state = { pos: 0, selected: [], answered: false, correctCount: 0 };

  function isSata(q){ return q.type === "sata"; }

  function arraysMatch(a, b){
    if (a.length !== b.length) return false;
    var as = a.slice().sort(), bs = b.slice().sort();
    for (var i = 0; i < as.length; i++) if (as[i] !== bs[i]) return false;
    return true;
  }

  function render(){
    var body = document.getElementById("qz-body");
    if (state.pos >= QUESTIONS.length){
      var pct = Math.round((state.correctCount / QUESTIONS.length) * 100);
      body.innerHTML =
        "<div class='qz-results'><p class='qz-score'>" + pct + "%</p>" +
        "<p class='muted'>" + state.correctCount + " of " + QUESTIONS.length + " correct</p>" +
        "<button class='btn small' style='margin-top:18px;max-width:200px;margin-left:auto;margin-right:auto;' onclick='restartQuiz()'>retake quiz</button></div>";
      document.getElementById("qz-topbar").style.display = "none";
      return;
    }
    document.getElementById("qz-topbar").style.display = "flex";
    document.getElementById("qz-counter").textContent = "question " + (state.pos + 1) + " of " + QUESTIONS.length;
    document.getElementById("qz-score").textContent = "correct " + state.correctCount;

    var q = QUESTIONS[state.pos];
    var hint = isSata(q) ? "<p class='muted' style='margin:-8px 0 14px;'>Select all that apply</p>" : "";
    var html = "<p class='qz-q'>" + q.prompt + "</p>" + hint;
    q.options.forEach(function(opt){
      var cls = "qz-opt";
      var isSelected = state.selected.indexOf(opt.id) !== -1;
      var isCorrect = q.correct.indexOf(opt.id) !== -1;
      if (state.answered){
        if (isCorrect) cls += " correct";
        else if (isSelected) cls += " incorrect";
      } else if (isSelected){
        cls += " selected";
      }
      html += "<button class='" + cls + "' onclick='selectOption(\"" + opt.id + "\")'" + (state.answered ? " disabled" : "") + ">" + opt.text + "</button>";
    });
    html += "<p id='qz-error' style='font-size:13px;color:var(--danger-text);display:none;margin:4px 0 0;'>Select an answer first</p>";
    if (state.answered){
      var gotIt = arraysMatch(state.selected, q.correct);
      html += "<div class='qz-feedback'><b>" + (gotIt ? "Correct." : "Not quite.") + "</b>" + q.explanation + "</div>";
      html += "<button class='btn' onclick='nextQuestion()'>" + (state.pos === QUESTIONS.length - 1 ? "see results" : "next question") + " &#8594;</button>";
    } else {
      html += "<button class='btn' onclick='checkAnswer()'>check answer</button>";
    }
    body.innerHTML = html;
  }

  window.selectOption = function(id){
    if (state.answered) return;
    var q = QUESTIONS[state.pos];
    if (isSata(q)){
      var idx = state.selected.indexOf(id);
      if (idx === -1) state.selected.push(id); else state.selected.splice(idx, 1);
    } else {
      state.selected = [id];
    }
    document.getElementById("qz-error").style.display = "none";
    render();
  };

  window.checkAnswer = function(){
    if (state.selected.length === 0){
      document.getElementById("qz-error").style.display = "block";
      return;
    }
    state.answered = true;
    if (arraysMatch(state.selected, QUESTIONS[state.pos].correct)) state.correctCount++;
    render();
  };

  window.nextQuestion = function(){
    state.pos++; state.selected = []; state.answered = false; render();
  };

  window.restartQuiz = function(){
    state = { pos: 0, selected: [], answered: false, correctCount: 0 }; render();
  };

  render();
}
