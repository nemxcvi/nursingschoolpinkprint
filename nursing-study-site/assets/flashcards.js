function measureFaceHeight(el){
  var prevPosition = el.style.position;
  var prevWidth = el.style.width;
  el.style.position = "static";
  el.style.width = "100%";
  var h = el.scrollHeight;
  el.style.position = prevPosition;
  el.style.width = prevWidth;
  return h;
}

function initFlashcards(CATS, CARDS){
  var cardMap = {};
  CARDS.forEach(function(c){ cardMap[c[0]] = c; });

  var state = { deckIds: CARDS.map(function(c){ return c[0]; }), pos: 0, flipped: false, grades: {} };

  function shuffleArr(arr){
    for (var i = arr.length - 1; i > 0; i--){
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function updateCounts(){
    var dk=0, al=0, kn=0;
    for (var k in state.grades){
      if (state.grades[k] === "dontknow") dk++;
      else if (state.grades[k] === "almost") al++;
      else if (state.grades[k] === "know") kn++;
    }
    document.getElementById("counts").innerHTML =
      "<span style='color:var(--danger-text)'>&#10005; " + dk + "</span>" +
      "<span style='color:var(--warn-text)'>~ " + al + "</span>" +
      "<span style='color:var(--success-text)'>&#10003; " + kn + "</span>";
  }

  function updateProgress(){
    var pct = state.deckIds.length ? Math.round((Math.min(state.pos, state.deckIds.length) / state.deckIds.length) * 100) : 100;
    document.getElementById("progressbar").style.width = pct + "%";
  }

  function updateCounter(){
    var shown = Math.min(state.pos + 1, state.deckIds.length);
    document.getElementById("cardcounter").textContent = state.deckIds.length ? ("card " + shown + " of " + state.deckIds.length) : "no cards";
  }

  function hasMisses(){
    var found = false;
    CARDS.forEach(function(c){ if (state.grades[c[0]] !== "know") found = true; });
    return found;
  }

  function renderCompletion(){
    var html = "<div class='fc-complete'><p>Deck complete</p>";
    if (hasMisses()) html += "<button class='btn small' style='display:inline-flex;max-width:220px;margin:0 auto;' onclick='reviewMisses(event)'>review misses</button>";
    html += "</div>";
    document.getElementById("completion").innerHTML = html;
  }

  function render(){
    var scene = document.getElementById("cardscene");
    var gradebtns = document.getElementById("gradebtns");
    var completion = document.getElementById("completion");

    updateCounter(); updateProgress(); updateCounts();

    if (state.pos >= state.deckIds.length){
      scene.style.display = "none";
      gradebtns.style.display = "none";
      completion.style.display = "block";
      renderCompletion();
      return;
    }

    scene.style.display = "block";
    completion.style.display = "none";

    var card = cardMap[state.deckIds[state.pos]];
    var cat = CATS[card[1]];
    document.getElementById("cardinner").className = "fc-inner" + (state.flipped ? " flipped" : "");

    var bg = "background:var(--hue-" + cat.hue + "-bg);color:var(--hue-" + cat.hue + "-text);";
    document.getElementById("cardfront").setAttribute("style", "");
    document.getElementById("cardfront").className = "fc-face";
    document.getElementById("cardfront").style.cssText = bg;
    document.getElementById("cardback").className = "fc-face back";
    document.getElementById("cardback").style.cssText = bg;

    document.getElementById("cardfront").innerHTML =
      "<p class='fc-cat'>" + cat.label + "</p><p class='fc-term'>" + card[2] + "</p><p class='fc-hint'>Tap to flip</p>";

    var exHtml = card[4] ? "<p class='fc-ex'>Ex: " + card[4] + "</p>" : "";
    document.getElementById("cardback").innerHTML =
      "<p class='fc-cat'>" + cat.label + "</p><p class='fc-def'>" + card[3] + "</p>" + exHtml;

    var defEl = document.querySelector("#cardback .fc-def");
    var exEl = document.querySelector("#cardback .fc-ex");
    if (defEl){
      var lineHeightPx = parseFloat(getComputedStyle(defEl).lineHeight);
      var isLong = defEl.scrollHeight > lineHeightPx * 2 + 2;
      defEl.classList.toggle("long-text", isLong);
      if (exEl) exEl.classList.toggle("long-text", isLong);
    }

    var cardInner = document.getElementById("cardinner");
    var frontFace = document.getElementById("cardfront");
    var backFace = document.getElementById("cardback");
    var neededHeight = Math.max(210, measureFaceHeight(frontFace), measureFaceHeight(backFace));
    cardInner.style.minHeight = neededHeight + "px";

    gradebtns.style.display = state.flipped ? "flex" : "none";
  }

  window.flipCard = function(){ state.flipped = !state.flipped; render(); };

  window.grade = function(g, e){
    e.stopPropagation();
    var id = state.deckIds[state.pos];
    state.grades[id] = g;
    state.pos++;
    state.flipped = false;
    render();
  };

  window.prevCard = function(e){
    e.stopPropagation();
    if (state.pos > 0){ state.pos--; state.flipped = false; render(); }
  };

  window.nextCard = function(e){
    e.stopPropagation();
    if (state.pos < state.deckIds.length){ state.pos++; state.flipped = false; render(); }
  };

  window.shuffleDeck = function(e){
    e.stopPropagation();
    state.deckIds = shuffleArr(state.deckIds.slice());
    state.pos = 0; state.flipped = false; render();
  };

  window.reviewMisses = function(e){
    e.stopPropagation();
    var missIds = CARDS.filter(function(c){ return state.grades[c[0]] !== "know"; }).map(function(c){ return c[0]; });
    if (missIds.length === 0){
      var note = document.getElementById("reviewnote");
      note.textContent = "No cards missed right now.";
      setTimeout(function(){ note.textContent = ""; }, 2200);
      return;
    }
    state.deckIds = missIds; state.pos = 0; state.flipped = false; render();
  };

  window.restartDeck = function(e){
    e.stopPropagation();
    state.grades = {};
    state.deckIds = CARDS.map(function(c){ return c[0]; });
    state.pos = 0; state.flipped = false; render();
  };

  render();
}
