var FC_FIXED_HEIGHT = 260;
var FC_MIN_SCALE = 0.72;

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

function fitFaceToFixedHeight(face){
  var textEls = face.querySelectorAll(".fc-term, .fc-def, .fc-ex, .fc-cat, .fc-hint");
  textEls.forEach(function(el){ el.style.fontSize = ""; });

  var natural = measureFaceHeight(face);
  if (natural <= FC_FIXED_HEIGHT) return;

  var scale = Math.max(FC_MIN_SCALE, (FC_FIXED_HEIGHT / natural) * 0.97);
  textEls.forEach(function(el){
    var base = parseFloat(getComputedStyle(el).fontSize);
    el.style.fontSize = (base * scale) + "px";
  });
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

  /* Segmented bar: red / amber / green in proportion to the tallies out of the whole deck */
  function updateProgress(){
    var tally = {dontknow:0, almost:0, know:0};
    for (var k in state.grades) if (tally.hasOwnProperty(state.grades[k])) tally[state.grades[k]]++;
    var total = CARDS.length || 1;
    var bar = document.getElementById("progressbar");
    bar.querySelector(".seg.dk").style.width = (tally.dontknow / total * 100) + "%";
    bar.querySelector(".seg.al").style.width = (tally.almost / total * 100) + "%";
    bar.querySelector(".seg.kn").style.width = (tally.know / total * 100) + "%";
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

    fitFaceToFixedHeight(document.getElementById("cardfront"));
    fitFaceToFixedHeight(document.getElementById("cardback"));

    /* The rating row always takes its space so nothing shifts; it only works once the card is flipped */
    gradebtns.style.display = "flex";
    gradebtns.querySelectorAll("button").forEach(function(b){ b.disabled = !state.flipped; });
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

  /* Keyboard: Space flips, 1/2/3 rate (after the flip), arrows move between cards */
  var noop = {stopPropagation:function(){}};
  document.addEventListener("keydown", function(e){
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    var nav = document.getElementById("navbtn");
    if (nav && nav.getAttribute("aria-expanded") === "true") return;
    var onCard = state.pos < state.deckIds.length;
    if (e.key === " " || e.code === "Space"){
      if (!onCard) return;
      e.preventDefault();
      window.flipCard();
    } else if (e.key === "1" || e.key === "2" || e.key === "3"){
      if (!onCard || !state.flipped) return;
      window.grade(["dontknow", "almost", "know"][Number(e.key) - 1], noop);
    } else if (e.key === "ArrowLeft"){
      window.prevCard(noop);
    } else if (e.key === "ArrowRight"){
      window.nextCard(noop);
    }
  });

  render();
}
