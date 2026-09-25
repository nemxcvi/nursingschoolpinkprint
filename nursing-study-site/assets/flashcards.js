/* Shrink a face's text until it fits the card (the label is absolutely placed and never moves) */
var FC_MIN_SCALE = 0.55;

function fitFace(face){
  var body = face.querySelector(".fc-body");
  if (!body) return;
  var textEls = body.querySelectorAll(".fc-term, .fc-def, .fc-ex, .fc-hint");
  textEls.forEach(function(el){ el.style.fontSize = ""; });
  var cs = getComputedStyle(face);
  var avail = face.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (avail <= 0 || body.scrollHeight <= avail) return;
  var base = [];
  textEls.forEach(function(el){ base.push(parseFloat(getComputedStyle(el).fontSize)); });
  for (var scale = 0.95; scale >= FC_MIN_SCALE; scale -= 0.05){
    textEls.forEach(function(el, i){ el.style.fontSize = (base[i] * scale) + "px"; });
    if (body.scrollHeight <= avail) return;
  }
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

    var front = document.getElementById("cardfront");
    var back = document.getElementById("cardback");
    front.innerHTML =
      "<p class='fc-cat'>" + cat.label + "</p><div class='fc-body'><p class='fc-term'>" + card[2] + "</p><p class='fc-hint'>Tap to flip</p></div>";

    /* Examples get their own italic line under the definition */
    var exHtml = card[4] ? "<p class='fc-ex'>Ex: " + card[4] + "</p>" : "";
    back.innerHTML =
      "<p class='fc-cat'>" + cat.label + "</p><div class='fc-body'><p class='fc-def'>" + card[3] + "</p>" + exHtml + "</div>";

    fitFace(front);
    fitFace(back);

    /* The rating row always takes its space so nothing shifts; it only works once the card is flipped */
    gradebtns.style.display = "";
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

  /* Card height changes with the screen, so refit the text; and again once the web fonts load */
  var resizeTimer;
  window.addEventListener("resize", function(){ clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 120); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);

  render();
}
