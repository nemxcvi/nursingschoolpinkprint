/* Challenges (phase 6): the same 10, 20 or 40 questions for up to 10 friends, scores side by
   side by nickname. Links expire after 7 days. Each challenge someone made or joined is kept in
   their (encrypted) progress with its own random ticket: see Tracking.saveChallenge.
   Styles from design/source Challenges. */
var Challenges = (function(){
  var T = Tracking;
  var COUNTS = [10, 20, 40], MAX_PLAYERS = 10;

  function esc(s){ return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function day(iso){ return new Date(iso).toLocaleDateString("en-US", {month: "short", day: "numeric"}); }
  function link(id){ return location.origin + "/c/" + id; }
  function shuffle(a){
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--){ var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ---------- Talking to the server ---------- */
  /* Runs fn(nickname, proof). If the server doesn't see the nickname as ours (e.g. the claim
     lapsed), claims it again and retries once. */
  function asMe(fn){
    var s = T.state();
    var proof = function(){ return T.nicknameProof() || "none"; };
    return fn(s.nickname, proof()).catch(function(err){
      if (!/not your nickname/.test(err.message)) throw err;
      if (s.nickname === T.OWNER_NAME) throw new Error("To use Miss Pinkprint in challenges, open any page once more with #owner= and your phrase.");
      return T.claimNickname(s.nickname).then(function(ok){
        if (!ok) throw new Error("Someone else has your nickname now. Pick a new one in Settings, then try again.");
        return fn(s.nickname, proof());
      });
    });
  }
  function friendly(err){
    var m = String(err && err.message || "");
    if (/expired|not found/.test(m)) return "This challenge has expired or was deleted.";
    if (/full/.test(m)) return "This challenge is full (10 people).";
    if (/Failed to fetch|NetworkError|HTTP 5|unreachable|not set up/.test(m)) return "Couldn't reach the server. Check your connection and try again.";
    return m || "Something went wrong. Try again.";
  }

  function create(title, questionIds){
    var ticket = T.randomHex(32);
    return asMe(function(nickname, proof){
      return T.call("challenges/create", {title: title, questions: questionIds, ticket: ticket, nickname: nickname, proof: proof});
    }).then(function(id){
      return T.saveChallenge({id: id, ticket: ticket, title: title, count: questionIds.length, mine: true});
    });
  }
  /* Joins (or rejoins) and resolves with {entry, title, questions} */
  function join(id){
    var entry = T.challenge(id) || T.saveChallenge({id: String(id).toUpperCase()});
    return asMe(function(nickname, proof){
      return T.call("challenges/join", {id: entry.id, ticket: entry.ticket, nickname: nickname, proof: proof});
    }).then(function(rows){
      var r = rows && rows[0];
      if (!r) throw new Error("challenge not found or expired");
      entry = T.saveChallenge({id: entry.id, title: r.title, count: r.questions.length, joined: true});
      return {entry: entry, title: r.title, questions: r.questions};
    });
  }
  function load(id){
    var entry = T.challenge(id);
    return T.call("challenges/load", {id: id, ticket: entry ? entry.ticket : null});
  }
  /* Saves the first finished score only */
  function submit(id, score){
    var entry = T.challenge(id);
    if (!entry) return Promise.resolve(null);
    if (entry.done) return Promise.resolve(entry);
    return T.call("challenges/score", {id: entry.id, ticket: entry.ticket, score: score}).then(function(ok){
      return ok ? T.saveChallenge({id: entry.id, done: true, score: score}) : entry;
    });
  }
  function remove(id){
    var entry = T.challenge(id);
    if (!entry) return Promise.resolve();
    var del = entry.mine ? T.call("challenges/delete", {id: entry.id, ticket: entry.ticket}) : Promise.resolve();
    return del.then(function(){ T.saveChallenge({id: entry.id, gone: true}); });
  }
  function copy(text, btn){
    var done = function(){ var old = btn.textContent; btn.textContent = "Copied"; setTimeout(function(){ btn.textContent = old; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function(){ fallback(); });
    else fallback();
    function fallback(){
      var i = document.createElement("textarea");
      i.value = text; i.setAttribute("readonly", ""); i.style.position = "fixed"; i.style.opacity = "0";
      document.body.appendChild(i); i.select();
      try { document.execCommand("copy"); done(); } catch (e) {}
      i.remove();
    }
  }

  /* ---------- Challenges page ---------- */
  function intro(){
    return '<section class="tp-intro"><div class="tp-eyebrow">Study buddy</div><h1 class="tp-h1">Challenges</h1>' +
      '<p class="tp-lede">Send a friend the same questions before anyone takes them, then compare scores. Up to 10 people per challenge. Links expire after 7 days.</p></section>';
  }

  /* Someone without tracking opened a challenge link */
  function guestPage(host, joinId){
    var ret = "/challenges.html" + (joinId ? "?join=" + encodeURIComponent(joinId) : "");
    host.innerHTML = intro() +
      '<section class="ms-card ch-guest"><h2 class="ms-h2">' + (joinId ? "A friend sent you a challenge" : "Challenges are part of tracking") + "</h2>" +
      '<p class="tp-hint">Challenges are for students who track their progress, so your score has a nickname next to it. Tracking is free, needs no account or email, and takes a minute.</p>' +
      '<a class="ms-btn is-primary is-big ch-start" href="start-tracking.html?from=challenge&amp;return=' + encodeURIComponent(ret) + '">Start tracking &rarr;</a>' +
      '<p class="tp-hint">Already tracking on another device? Use <a href="start-tracking.html?return=' + encodeURIComponent(ret) + '">Already have a code?</a> on the same page.</p></section>';
  }

  function offPage(host){
    host.innerHTML = intro() +
      '<section class="ms-card"><h2 class="ms-h2">Challenges are turned off</h2><p class="tp-hint">You switched Challenges off in Settings.</p>' +
      '<button type="button" class="ms-btn is-primary ch-turnon">Turn challenges on</button></section>';
    host.querySelector(".ch-turnon").addEventListener("click", function(){ T.setFeature("challenges", true); location.reload(); });
  }

  function formHtml(d, pick){
    var units = d.units.filter(function(u){ return u.questions.length; });
    return '<form class="ms-card ch-new" novalidate><h2 class="ms-h2 ch-h2">New challenge</h2>' +
      '<div class="ch-field"><label for="ch-unit">Unit</label><select id="ch-unit" class="ch-select">' +
      units.map(function(u){
        return '<option value="' + u.unit + '"' + (u.unit === pick.unit ? " selected" : "") + ">Unit " + u.unit + " · " + esc(u.name) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="ch-field"><label for="ch-topic">Topic</label><select id="ch-topic" class="ch-select"></select></div>' +
      '<fieldset class="ch-field ch-counts"><legend>Questions</legend><div>' +
      COUNTS.map(function(n){ return '<button type="button" data-n="' + n + '" aria-pressed="' + (n === 20) + '">' + n + "</button>"; }).join("") +
      "</div></fieldset>" +
      '<button type="submit" class="ms-btn is-primary is-big ch-create">Create challenge link</button>' +
      '<p class="tp-note ch-msg hidden" role="alert"></p>' +
      '<div class="ch-ready hidden"><span class="ch-ready-label"></span><div class="ch-linkrow"><input class="ch-link" aria-label="Challenge link" readonly>' +
      '<button type="button" class="ch-copy">Copy</button></div><span class="tp-hint">Send it by text or group chat. Take it yourself from the list.</span></div>' +
      "</form>";
  }

  function wireForm(d, host, pick, onCreated){
    var form = host.querySelector(".ch-new");
    var unitSel = form.querySelector("#ch-unit"), topicSel = form.querySelector("#ch-topic");
    var count = 20;
    function unit(){ return d.units.filter(function(u){ return u.unit === +unitSel.value; })[0]; }
    function fillTopics(slug){
      var u = unit();
      topicSel.innerHTML = '<option value="">Whole unit</option>' + u.topics.map(function(t){
        return '<option value="' + esc(t.slug) + '"' + (t.slug === slug ? " selected" : "") + ">" + esc(t.topic) + "</option>";
      }).join("");
      syncCounts();
    }
    function pool(){
      var u = unit(), t = u.topics.filter(function(x){ return x.slug === topicSel.value; })[0];
      return {title: t ? t.topic : "Unit " + u.unit + " · " + u.name, questions: u.questions.filter(function(q){ return !t || q.topic === t.topic; })};
    }
    /* Sizes bigger than the topic are greyed out */
    function syncCounts(){
      var have = pool().questions.length;
      form.querySelectorAll(".ch-counts button").forEach(function(b){
        var n = +b.getAttribute("data-n");
        b.disabled = n > have;
        if (b.disabled && count === n) count = COUNTS.filter(function(c){ return c <= have; }).pop() || 10;
      });
      form.querySelectorAll(".ch-counts button").forEach(function(b){ b.setAttribute("aria-pressed", String(+b.getAttribute("data-n") === count)); });
    }
    unitSel.addEventListener("change", function(){ fillTopics(""); });
    topicSel.addEventListener("change", syncCounts);
    form.querySelectorAll(".ch-counts button").forEach(function(b){
      b.addEventListener("click", function(){ count = +b.getAttribute("data-n"); syncCounts(); });
    });
    fillTopics(pick.topic);

    var msg = form.querySelector(".ch-msg"), btn = form.querySelector(".ch-create");
    form.addEventListener("submit", function(e){
      e.preventDefault();
      var p = pool();
      if (p.questions.length < count) return;
      btn.disabled = true;
      msg.classList.add("hidden");
      var ids = shuffle(p.questions).slice(0, count).map(function(q){ return q.id; });
      create(p.title, ids).then(function(entry){
        btn.disabled = false;
        var ready = form.querySelector(".ch-ready");
        ready.classList.remove("hidden");
        ready.querySelector(".ch-ready-label").textContent = "Link ready · " + entry.title + " · " + entry.count + " questions";
        ready.querySelector(".ch-link").value = link(entry.id);
        onCreated(entry);
      }, function(err){
        btn.disabled = false;
        msg.textContent = friendly(err);
        msg.classList.remove("hidden");
      });
    });
    form.querySelector(".ch-copy").addEventListener("click", function(e){ copy(form.querySelector(".ch-link").value, e.currentTarget); });
  }

  /* One challenge card, from load_challenge */
  function cardHtml(entry, c){
    var head = '<div class="ch-head"><div class="tp-stack"><span class="ch-eyebrow">' +
      (c.is_creator ? "Sent by you" : c.from ? "From " + esc(c.from) : "Shared with you") + " · " + day(c.created_at) + "</span>" +
      '<h2 class="ms-h2 ch-h2">' + esc(c.title) + " · " + c.count + " questions</h2></div>" +
      '<span class="ch-meta">' + c.joined + " of " + MAX_PLAYERS + " joined · expires " + day(c.expires_at) + "</span></div>";
    var finished = c.me && c.me.finished;
    var body = "";
    if (c.players.length){
      var rank = 0;
      body += '<ol class="ch-scores">' + c.players.map(function(p){
        var done = p.finished;
        if (done) rank++;
        return '<li class="' + (p.me ? "is-me" : "") + (done ? "" : " is-taking") + '"><span class="ch-rank">' + (done ? rank : "·") + "</span>" +
          '<span class="ch-name">' + esc(p.nickname) + (p.me ? " (you)" : "") + "</span>" +
          '<span class="ch-score">' + (done ? p.score + "/" + p.total : "Taking it now") + "</span></li>";
      }).join("") + "</ol>";
    } else if (c.is_creator){
      body += '<p class="ch-note">Nobody has taken it yet. Send the link by text or group chat, then take it yourself.</p>';
    }
    if (!finished && !c.is_creator) body += '<p class="ch-note">Scores show after you finish, so nobody sees answers early.</p>';
    var btns = [];
    if (!finished){
      if (!c.me && c.joined >= MAX_PLAYERS) btns.push('<span class="ch-meta">This challenge is full.</span>');
      else btns.push('<a class="ms-btn is-primary ch-take" href="session.html?mode=challenge&amp;id=' + c.id + '">' + (c.me ? "Finish challenge" : "Take challenge") + " &rarr;</a>");
    }
    btns.push('<button type="button" class="ch-btn ch-copylink">Copy link</button>');
    btns.push(c.is_creator ? '<button type="button" class="ch-btn is-danger ch-delete">Delete challenge</button>'
                           : '<button type="button" class="ms-linkbtn ch-remove">Remove from my list</button>');
    return head + body + '<div class="ch-btns">' + btns.join("") + "</div>";
  }

  function drawCard(card, entry){
    load(entry.id).then(function(c){
      if (!c){
        /* Expired or deleted: drop it from the list */
        T.saveChallenge({id: entry.id, gone: true});
        card.remove();
        emptyCheck();
        return;
      }
      if (c.title && (!entry.title || !entry.count)) T.saveChallenge({id: entry.id, title: c.title, count: c.count});
      card.innerHTML = cardHtml(entry, c);
      if (location.hash === "#c-" + entry.id){ card.classList.add("is-new"); card.scrollIntoView({block: "center"}); }
      card.querySelector(".ch-copylink").addEventListener("click", function(e){ copy(link(c.id), e.currentTarget); });
      var del = card.querySelector(".ch-delete"), rm = card.querySelector(".ch-remove");
      if (del) del.addEventListener("click", function(){
        if (!confirm("Delete this challenge for everyone? The link will stop working.")) return;
        remove(entry.id).then(function(){ card.remove(); emptyCheck(); }, function(err){ alert(friendly(err)); });
      });
      if (rm) rm.addEventListener("click", function(){ remove(entry.id).then(function(){ card.remove(); emptyCheck(); }); });
    }, function(err){
      card.innerHTML = '<p class="tp-note">' + esc(friendly(err)) + "</p>";
    });
  }

  var listEl = null;
  function emptyCheck(){
    if (!listEl || listEl.querySelector(".ch-card")) return;
    listEl.innerHTML = '<div class="ms-card ch-empty"><h2 class="ms-h2 ch-h2">No challenges yet</h2><p class="tp-hint">Make one, send the link to a friend, and compare scores when you both finish. Challenge answers count toward your own progress too.</p></div>';
  }
  function addCard(entry, first){
    var empty = listEl.querySelector(".ch-empty");
    if (empty) empty.remove();
    var card = document.createElement("article");
    card.className = "ms-card ch-card";
    card.id = "c-" + entry.id;
    card.innerHTML = '<p class="tp-hint">Loading&hellip;</p>';
    if (first) listEl.insertBefore(card, listEl.firstChild); else listEl.appendChild(card);
    drawCard(card, entry);
    return card;
  }

  function mainPage(d, host, params){
    var exam = Progress.nextExam(d.exams, d.today);
    var withQs = d.units.filter(function(u){ return u.questions.length; });
    var pick = {unit: +params.get("unit") || 0, topic: params.get("topic") || ""};
    if (!withQs.some(function(u){ return u.unit === pick.unit; })){
      var cur = exam && withQs.filter(function(u){ return exam.units.indexOf(u.unit) !== -1; })[0];
      pick.unit = (cur || withQs[withQs.length - 1]).unit;
      pick.topic = "";
    }
    host.innerHTML = intro() + '<div class="tp-note ch-banner hidden" role="status"></div>' +
      '<section class="ch-layout">' + formHtml(d, pick) + '<div class="ch-list"></div></section>';
    listEl = host.querySelector(".ch-list");
    wireForm(d, host, pick, function(entry){ addCard(entry, true); });
    T.challenges().forEach(function(entry){ addCard(entry, false); });
    emptyCheck();

    /* Opened from a challenge link: add it to the list (joining happens when they take it) */
    var joinId = (params.get("join") || "").toUpperCase();
    if (joinId){
      history.replaceState(null, "", location.pathname);
      var known = T.challenge(joinId);
      var focus = function(card){ card.classList.add("is-new"); card.scrollIntoView({block: "center"}); };
      if (known){ focus(document.getElementById("c-" + joinId)); return; }
      T.call("challenges/load", {id: joinId}).then(function(c){
        if (!c) throw new Error("expired");
        focus(addCard(T.saveChallenge({id: c.id, title: c.title, count: c.count}), true));
      }).catch(function(err){
        var b = host.querySelector(".ch-banner");
        b.textContent = friendly(err);
        b.classList.remove("hidden");
      });
    }
  }

  function page(){
    var host = document.getElementById("ms-main");
    var params = new URLSearchParams(location.search);
    if (!T.isOn()){ document.getElementById("ms-header").innerHTML = '<a class="tp-brand" href="./">Nursing School <span>Pinkprint</span></a>'; document.getElementById("ms-header").className = "tp-header ms-header"; guestPage(host, params.get("join")); return; }
    MyStudy.header("challenges");
    if (!T.feature("challenges")){ offPage(host); return; }
    MyStudy.load().then(function(d){ mainPage(d, host, params); }, function(err){
      host.innerHTML = '<p class="tp-note">Couldn\'t load your study data. Refresh the page to try again.</p>';
      if (window.console) console.error(err);
    });
  }

  return {page: page, create: create, join: join, load: load, submit: submit, remove: remove, link: link, friendly: friendly};
})();
