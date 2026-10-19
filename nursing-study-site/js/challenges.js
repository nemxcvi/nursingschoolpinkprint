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
  function pct(n, total){ return total ? Math.round(n / total * 100) : 0; }
  /* "expires in 3 days"; on the last day it says so in red */
  function expiry(iso){
    var days = Math.ceil((new Date(iso) - Date.now()) / 86400000);
    if (days <= 1) return '<span class="ch-lastday">Last day to play</span>';
    return "expires in " + days + " days";
  }
  /* Challenge codes: 4 letters and numbers with no look-alikes (no 0/O, 1/I/L), like "7KQ2".
     The first challenges had 8 (shown as "7KQ2 XM4P"); those still work. */
  var CODE_RE = /^(?:[2-9A-HJ-NP-Z]{4}|[2-9A-HJ-NP-Z]{8})$/;
  function showCode(id){ return id.length === 8 ? id.slice(0, 4) + " " + id.slice(4) : id; }
  /* Takes a typed code (any case, spaces or dashes) or a pasted link; returns the code or null */
  function parseCode(s){
    s = String(s || "").trim();
    var m = s.match(/(?:\/c\/|join=)([^\/?#&\s]+)/i);
    if (m) s = m[1];
    s = s.replace(/[\s-]/g, "").toUpperCase();
    return CODE_RE.test(s) ? s : null;
  }
  var BAD_CODE = "That doesn't look like a challenge code. It's 4 letters and numbers, like 7KQ2.";
  /* inline: the small "Join a challenge" link under Create challenge opens it */
  function joinFormHtml(inline){
    if (inline) return '<div class="ch-joinwrap"><button type="button" class="ms-linkbtn ch-jointoggle" aria-expanded="false" aria-controls="ch-joinbox">Join a challenge with a code</button>' +
      '<form class="ch-joinform hidden" id="ch-joinbox" novalidate><div class="ch-field"><label for="ch-code">Code from a friend</label>' +
      '<div class="ch-linkrow"><input id="ch-code" class="ch-link ch-codein" placeholder="7KQ2" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="80">' +
      '<button type="submit" class="ch-copy">Join</button></div></div><p class="tp-note ch-joinmsg hidden" role="alert"></p></form></div>';
    return '<form class="ms-card ch-joinform" novalidate><h2 class="ms-h2 ch-h2">Join a challenge</h2>' +
      '<div class="ch-field"><label for="ch-code">Code from a friend</label>' +
      '<div class="ch-linkrow"><input id="ch-code" class="ch-link ch-codein" placeholder="7KQ2" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="80">' +
      '<button type="submit" class="ch-copy">Join</button></div></div><p class="tp-note ch-joinmsg hidden" role="alert"></p></form>';
  }
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
  /* Saves the first finished score only. answers: [{q, ok}] for every question in the challenge
     (unanswered = wrong); the score is counted from them, and they feed the group's Group focus. */
  function submit(id, score, answers){
    var entry = T.challenge(id);
    if (!entry) return Promise.resolve(null);
    if (entry.done) return Promise.resolve(entry);
    var body = {id: entry.id, ticket: entry.ticket, score: score};
    if (answers) body.answers = answers;
    return T.call("challenges/score", body).then(function(ok){
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
      '<p class="tp-lede">Challenges are for studying together: everyone answers the same set of questions.</p>' +
      '<ol class="ch-steps">' +
      '<li><span class="ch-stepn">1</span><strong>Create</strong><span>Pick a unit or topic and 10, 20 or 40 questions.</span></li>' +
      '<li><span class="ch-stepn">2</span><strong>Send</strong><span>Share the code or link with up to 10 people. Expires in 7 days.</span></li>' +
      '<li><span class="ch-stepn">3</span><strong>Study</strong><span>Group focus shows which units or topics your group should review.</span></li>' +
      '<li><span class="ch-stepn">4</span><strong>Progress</strong><span>Your answers count toward your own progress.</span></li>' +
      "</ol></section>";
  }

  /* Someone without tracking opened a challenge link */
  function guestPage(host, joinId){
    var ret = "/challenges.html" + (joinId ? "?join=" + encodeURIComponent(joinId) : "");
    host.innerHTML = intro() +
      '<section class="ms-card ch-guest"><h2 class="ms-h2">' + (joinId ? "A friend sent you a challenge" : "Challenges are part of tracking") + "</h2>" +
      '<p class="tp-hint">Challenges are for students who track their progress, so your score has a nickname next to it. Tracking is free, needs no account or email, and takes a minute.</p>' +
      '<a class="ms-btn is-primary is-big ch-start" href="start-tracking.html?from=challenge&amp;return=' + encodeURIComponent(ret) + '">Start tracking &rarr;</a>' +
      '<p class="tp-hint">Already tracking on another device? Use <a href="start-tracking.html?return=' + encodeURIComponent(ret) + '">Already have a code?</a> on the same page.</p></section>' +
      (joinId ? "" : joinFormHtml());
    var form = host.querySelector(".ch-joinform");
    if (form) form.addEventListener("submit", function(e){
      e.preventDefault();
      var code = parseCode(form.querySelector(".ch-codein").value), msg = form.querySelector(".ch-joinmsg");
      if (!code){ msg.textContent = BAD_CODE; msg.classList.remove("hidden"); return; }
      location.href = "start-tracking.html?from=challenge&return=" + encodeURIComponent("/challenges.html?join=" + code);
    });
  }

  function offPage(host){
    host.innerHTML = intro() +
      '<section class="ms-card"><h2 class="ms-h2">Challenges are turned off</h2><p class="tp-hint">You switched Challenges off in Settings.</p>' +
      '<button type="button" class="ms-btn is-primary ch-turnon">Turn challenges on</button></section>';
    host.querySelector(".ch-turnon").addEventListener("click", function(){ T.setFeature("challenges", true); location.reload(); });
  }

  function formHtml(d, pick){
    var units = d.units.filter(function(u){ return u.questions.length; });
    return '<div class="ms-card ch-newcard"><form class="ch-new" novalidate><h2 class="ms-h2 ch-h2">New challenge</h2>' +
      '<div class="ch-field"><label for="ch-unit">Unit</label><select id="ch-unit" class="ch-select">' +
      units.map(function(u){
        return '<option value="' + u.unit + '"' + (u.unit === pick.unit ? " selected" : "") + ">Unit " + u.unit + " · " + esc(u.name) + "</option>";
      }).join("") + '<option value="all"' + (pick.all ? " selected" : "") + ">All units</option></select></div>" +
      '<div class="ch-field"><label for="ch-topic">Topic</label><select id="ch-topic" class="ch-select"></select></div>' +
      '<fieldset class="ch-field ch-counts"><legend>Questions</legend><div>' +
      COUNTS.map(function(n){ return '<button type="button" data-n="' + n + '" aria-pressed="' + (n === 20) + '">' + n + "</button>"; }).join("") +
      "</div></fieldset>" +
      '<button type="submit" class="ms-btn is-primary is-big ch-create">Create challenge</button>' +
      '<p class="tp-note ch-msg hidden" role="alert"></p>' +
      '<div class="ch-ready hidden"><span class="ch-ready-label"></span>' +
      '<div class="ch-coderow"><span class="ch-bigcode"></span><button type="button" class="ch-copy ch-copycode">Copy code</button></div>' +
      '<div class="ch-linkrow"><input class="ch-link" aria-label="Challenge link" readonly><button type="button" class="ch-copy">Copy link</button></div>' +
      '<span class="tp-hint">Friends tap Join a challenge and type the code, or open the link. Take it yourself from the list.</span></div>' +
      "</form>" + joinFormHtml(true) + "</div>";
  }

  function wireForm(d, host, pick, onCreated){
    var form = host.querySelector(".ch-new");
    var unitSel = form.querySelector("#ch-unit"), topicSel = form.querySelector("#ch-topic");
    var count = 20;
    function unit(){ return d.units.filter(function(u){ return u.unit === +unitSel.value; })[0]; }
    /* "All units": questions drawn from every unit that has them; no topic choice */
    function fillTopics(slug){
      var u = unit();
      topicSel.disabled = !u;
      topicSel.innerHTML = !u ? '<option value="">All topics</option>' : '<option value="">Whole unit</option>' + u.topics.map(function(t){
        return '<option value="' + esc(t.slug) + '"' + (t.slug === slug ? " selected" : "") + ">" + esc(t.topic) + "</option>";
      }).join("");
      syncCounts();
    }
    function pool(){
      var u = unit();
      if (!u) return {title: "All units", questions: [].concat.apply([], d.units.map(function(x){ return x.questions; }))};
      var t = u.topics.filter(function(x){ return x.slug === topicSel.value; })[0];
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
        ready.querySelector(".ch-ready-label").textContent = "Ready · " + entry.title + " · " + entry.count + " questions";
        ready.querySelector(".ch-bigcode").textContent = showCode(entry.id);
        ready.querySelector(".ch-link").value = link(entry.id);
        onCreated(entry);
      }, function(err){
        btn.disabled = false;
        msg.textContent = friendly(err);
        msg.classList.remove("hidden");
      });
    });
    form.querySelector(".ch-linkrow .ch-copy").addEventListener("click", function(e){ copy(form.querySelector(".ch-link").value, e.currentTarget); });
    form.querySelector(".ch-copycode").addEventListener("click", function(e){ copy(form.querySelector(".ch-bigcode").textContent, e.currentTarget); });
  }

  /* ---------- Group focus ----------
     load_challenge sends {players, missed: {question id: how many missed it}} to people who
     finished, once 2 or more have (they're told before starting that answers are combined). Only combined
     numbers: never who missed which question. */
  var data = null;   /* this page's study data (questions and units), set by mainPage */
  function byId(){
    if (!data) return {};
    if (!data.byId){ data.byId = {}; data.questions.forEach(function(q){ data.byId[q.id] = q; }); }
    return data.byId;
  }
  /* Question IDs anyone in the group missed, most missed first (for "Quiz us on these") */
  function groupMissed(c){
    if (!c || !c.focus) return null;
    var m = c.focus.missed || {};
    return Object.keys(m).filter(function(id){ return m[id] > 0; })
      .sort(function(a, b){ return m[b] - m[a] || (a < b ? -1 : 1); });
  }
  /* Each unit/topic in the challenge, weakest first by the group's combined accuracy */
  function focusTopics(c){
    var qs = byId(), m = c.focus.missed || {}, n = c.focus.players, groups = {}, units = {};
    Object.keys(m).forEach(function(id){
      var q = qs[id];
      var key = q ? q.unit + "|" + q.topic : "?";
      if (!groups[key]) groups[key] = {unit: q ? q.unit : 0, topic: q ? q.topic : "Other questions", count: 0, missed: 0};
      groups[key].count++;
      groups[key].missed += m[id];
      if (q) units[q.unit] = true;
    });
    var many = Object.keys(units).length > 1;
    return Object.keys(groups).map(function(k){
      var g = groups[k];
      g.label = (many && g.unit ? "Unit " + g.unit + " · " : "") + g.topic;
      g.acc = Math.round((1 - g.missed / (g.count * n)) * 100);
      return g;
    }).sort(function(a, b){ return a.acc - b.acc || b.count - a.count; });
  }
  function rationaleHtml(q){
    var right = (q.options || []).filter(function(o){ return o.correct; });
    var strip = function(t){ return String(t || "").replace(/^\s*(Correct|Incorrect)[.:!]?\s*/i, ""); };
    return '<div class="ch-answer"><span class="ch-eyebrow">' + (right.length > 1 ? "Correct answers" : "Correct answer") + "</span>" +
      right.map(function(o){ return "<p><strong>" + esc(o.text) + "</strong>" + (o.rationale ? " " + esc(strip(o.rationale)) : "") + "</p>"; }).join("") +
      (q.explanation ? '<p class="ch-expl">' + esc(q.explanation) + "</p>" : "") + "</div>";
  }
  /* On the card: a short Group focus line; the full view is its own page (challenges.html?focus=ID) */
  function focusHtml(c){
    if (!(c.me && c.me.finished)) return "";
    var head = '<section class="ch-focus ch-fsummary" aria-label="Group focus"><div class="ch-focus-head"><h3 class="ch-eyebrow">Group focus</h3>';
    if (!c.focus) return head + '</div><p class="tp-hint">Group focus opens once someone else finishes too.</p></section>';
    var weakest = focusTopics(c)[0], missed = groupMissed(c).length;
    return head + '<span class="ch-meta">' + c.focus.players + " finished · combined results only</span></div>" +
      '<p class="ch-fline">' + (weakest ? "Weakest: <strong>" + esc(weakest.label) + "</strong> · " + weakest.acc + "% right · " : "") +
      (missed ? missed + (missed === 1 ? " question" : " questions") + " someone missed" : "Nobody missed a question") + "</p></section>";
  }
  /* The full Group focus: topics weakest first, most missed (up to limit) with answers */
  function focusBody(c, limit){
    var n = c.focus.players, m = c.focus.missed || {}, qs = byId();
    var rows = focusTopics(c).map(function(g){
      return '<li><span class="ch-ftopic">' + esc(g.label) +
        (g.count < 3 ? ' <span class="ch-few">Only ' + g.count + (g.count === 1 ? " question" : " questions") + "</span>" : "") + "</span>" +
        '<span class="ch-fbar" role="img" aria-label="' + g.acc + ' percent right"><span style="width:' + g.acc + '%"></span></span>' +
        '<span class="ch-facc">' + g.acc + "%</span></li>";
    }).join("");
    var missed = (groupMissed(c) || []).filter(function(id){ return qs[id]; });
    var top = missed.slice(0, limit).map(function(id){
      var q = qs[id];
      return '<li><details><summary><span class="ch-qtext">' + esc(q.prompt) + '</span><span class="ch-missed">Missed by ' + m[id] + " of " + n + "</span></summary>" +
        rationaleHtml(q) + "</details></li>";
    }).join("");
    return '<section class="ms-card ch-fpart"><h2 class="ms-h2 ch-h2">Topics, weakest first</h2><ol class="ch-ftopics">' + rows + "</ol></section>" +
      '<section class="ms-card ch-fpart"><h2 class="ms-h2 ch-h2">Most missed</h2>' +
      (top ? '<p class="tp-hint">Tap a question to see the answer and why.</p><ol class="ch-fmissed">' + top + "</ol>" : '<p class="tp-hint">Nobody missed a question. Nice work, everyone!</p>') + "</section>";
  }
  function focusPage(d, host, id){
    data = d;
    host.innerHTML = '<p class="tp-hint">Loading&hellip;</p>';
    var back = '<a class="ms-back" href="challenges.html#c-' + esc(id) + '">&larr; Challenges</a>';
    load(id).then(function(c){
      if (!c || !c.focus){
        host.innerHTML = '<section class="tp-intro">' + back + '<div class="tp-eyebrow">Group focus</div><h1 class="tp-h1">Not available</h1>' +
          '<p class="tp-lede">' + (!c ? "This challenge expired or was deleted."
            : c.me && c.me.finished ? "Group focus opens once someone else finishes too."
            : "Group focus is for people who have finished this challenge.") + "</p></section>";
        return;
      }
      var missed = groupMissed(c).length;
      host.innerHTML = '<section class="tp-intro">' + back + '<div class="tp-eyebrow">Group focus</div><h1 class="tp-h1">' + esc(c.title) + "</h1>" +
        '<p class="tp-lede">From the ' + c.focus.players + " people who finished. Combined results only, never who missed what.</p>" +
        (missed ? '<a class="ms-btn is-primary is-big ch-quizus" href="session.html?mode=group&amp;id=' + c.id + '">Quiz us on these · ' + missed + " &rarr;</a>" : "") +
        "</section>" + '<div class="ch-fpage">' + focusBody(c, 10) + "</div>";
    }, function(err){ host.innerHTML = '<section class="tp-intro">' + back + '<p class="tp-note">' + esc(friendly(err)) + "</p></section>"; });
  }

  /* One challenge card, from load_challenge */
  function cardHtml(entry, c){
    var drop = c.is_creator ? '<button type="button" class="ms-linkbtn is-danger ch-delete">Delete<span class="ch-wide"> challenge</span></button>'
                            : '<button type="button" class="ms-linkbtn ch-remove">Remove<span class="ch-wide"> from my list</span></button>';
    var head = '<div class="ch-head"><div class="tp-stack"><div class="ch-top"><span class="ch-eyebrow">' +
      (c.is_creator ? "Sent by you" : c.from ? "From " + esc(c.from) : "Shared with you") + " · " + day(c.created_at) + "</span>" + drop + "</div>" +
      '<h2 class="ms-h2 ch-h2">' + esc(c.title) + " · " + c.count + " questions</h2>" +
      '<span class="ch-meta">' + c.joined + " of " + MAX_PLAYERS + " joined · " + expiry(c.expires_at) + "</span></div></div>";
    var finished = c.me && c.me.finished;
    var body = "";
    if (c.players.length){
      /* In the order people finished */
      body += '<ol class="ch-scores">' + c.players.map(function(p){
        var done = p.finished;
        return '<li class="' + (p.me ? "is-me" : "") + (done ? "" : " is-taking") + '">' +
          '<span class="ch-name">' + esc(p.nickname) + (p.me ? " (you)" : "") + "</span>" +
          (done ? '<span class="ch-score">' + p.score + "/" + p.total + '</span><span class="ch-pct">' + pct(p.score, p.total) + "%</span>"
                : '<span class="ch-score">Taking it now</span>') + "</li>";
      }).join("") + "</ol>";
    } else if (c.is_creator){
      body += '<p class="ch-note">Nobody has taken it yet. Send friends the code or the link, then take it yourself.</p>';
    }
    if (!finished && !c.is_creator) body += '<p class="ch-note">Scores show after you finish, so nobody sees answers early.</p>';
    body += focusHtml(c);
    var btns = [];
    if (!finished){
      if (!c.me && c.joined >= MAX_PLAYERS) btns.push('<span class="ch-meta">This challenge is full.</span>');
      else btns.push('<a class="ms-btn is-primary ch-take" href="session.html?mode=challenge&amp;id=' + c.id + '">' + (c.me ? "Finish challenge" : "Take challenge") + " &rarr;</a>");
    }
    if (c.focus) btns.push('<a class="ms-btn is-primary ch-take ch-seefocus" href="challenges.html?focus=' + c.id + '">See Group focus &rarr;</a>');
    btns.push('<div class="ch-share"><span class="ch-cardcode" title="Challenge code">' + showCode(c.id) + "</span>" +
      '<button type="button" class="ch-btn ch-copycode">Copy code</button><button type="button" class="ch-btn ch-copylink">Copy link</button></div>');
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
      /* Finished ones move under "Finished", newest first */
      if (c.me && c.me.finished && doneEl && card.parentNode !== doneEl){
        var after = [].filter.call(doneEl.children, function(x){ return +x.getAttribute("data-at") < (entry.at || 0); })[0];
        doneEl.insertBefore(card, after || null);
        emptyCheck();
      }
      if (location.hash === "#c-" + entry.id){ card.classList.add("is-new"); card.scrollIntoView({block: "center"}); }
      card.querySelector(".ch-copylink").addEventListener("click", function(e){ copy(link(c.id), e.currentTarget); });
      card.querySelector(".ch-copycode").addEventListener("click", function(e){ copy(showCode(c.id), e.currentTarget); });
      var del = card.querySelector(".ch-delete"), rm = card.querySelector(".ch-remove");
      if (del) del.addEventListener("click", function(){
        if (!confirm("Delete this challenge for everyone? Its code and link will stop working.")) return;
        remove(entry.id).then(function(){ card.remove(); emptyCheck(); }, function(err){ alert(friendly(err)); });
      });
      if (rm) rm.addEventListener("click", function(){ remove(entry.id).then(function(){ card.remove(); emptyCheck(); }); });
    }, function(err){
      card.innerHTML = '<p class="tp-note">' + esc(friendly(err)) + "</p>";
    });
  }

  var listEl = null, doneEl = null;
  function emptyCheck(){
    if (!listEl) return;
    var done = doneEl && doneEl.querySelector(".ch-card");
    if (doneEl) doneEl.previousElementSibling.classList.toggle("hidden", !done);
    if (listEl.querySelector(".ch-card")){ var e = listEl.querySelector(".ch-empty"); if (e) e.remove(); return; }
    if (done){ if (!listEl.querySelector(".ch-empty")) listEl.innerHTML = '<p class="ch-note ch-empty">Nothing left to take. Make a new challenge or join one with a code.</p>'; return; }
    listEl.innerHTML = '<div class="ch-empty ch-none"><h2 class="ms-h2 ch-h2">No challenges yet</h2><p class="tp-hint">Create one, send the link to a friend, and study results as a group when you finish. Challenge answers count toward your own progress too.</p></div>';
  }
  function addCard(entry, first){
    var empty = listEl.querySelector(".ch-empty");
    if (empty) empty.remove();
    var card = document.createElement("article");
    card.className = "ms-card ch-card";
    card.id = "c-" + entry.id;
    card.setAttribute("data-at", entry.at || 0);
    card.innerHTML = '<p class="tp-hint">Loading&hellip;</p>';
    if (first) listEl.insertBefore(card, listEl.firstChild); else listEl.appendChild(card);
    drawCard(card, entry);
    return card;
  }

  function mainPage(d, host, params){
    var exam = Progress.nextExam(d.exams, d.today);
    var withQs = d.units.filter(function(u){ return u.questions.length; });
    /* All units unless a unit was passed in (e.g. Challenge a friend from a topic quiz) */
    var pick = {unit: +params.get("unit") || 0, topic: params.get("topic") || "", all: !params.get("unit") || params.get("unit") === "all"};
    if (!pick.all && !withQs.some(function(u){ return u.unit === pick.unit; })){
      var cur = exam && withQs.filter(function(u){ return exam.units.indexOf(u.unit) !== -1; })[0];
      pick.unit = (cur || withQs[withQs.length - 1]).unit;
      pick.topic = "";
    }
    host.innerHTML = intro() + '<div class="tp-note ch-banner hidden" role="status"></div>' +
      '<section class="ch-layout"><div class="ch-col"><h2 class="ch-eyebrow ch-listhead">Start or join</h2>' + formHtml(d, pick) + "</div>" +
      '<div class="ch-side"><h2 class="ch-eyebrow ch-listhead">Your challenges</h2><div class="ch-list"></div>' +
      '<h2 class="ch-eyebrow ch-listhead ch-donehead hidden">Finished</h2><div class="ch-list ch-done"></div></div></section>';
    data = d;
    listEl = host.querySelector(".ch-list");
    doneEl = host.querySelector(".ch-done");
    wireForm(d, host, pick, function(entry){ addCard(entry, true); });
    T.challenges().forEach(function(entry){ addCard(entry, false); });
    emptyCheck();

    /* A code typed in, or a challenge link opened: add it to the list (joining happens when they take it) */
    var focus = function(card){ if (!card) return; card.classList.add("is-new"); card.scrollIntoView({block: "center"}); };
    function openCode(id, say){
      var known = T.challenge(id);
      if (known){ focus(document.getElementById("c-" + id)); return Promise.resolve(); }
      return T.call("challenges/load", {id: id}).then(function(c){
        if (!c) throw new Error("expired");
        focus(addCard(T.saveChallenge({id: c.id, title: c.title, count: c.count}), true));
      }).catch(function(err){ say(friendly(err)); });
    }
    var jf = host.querySelector(".ch-joinform"), jmsg = jf.querySelector(".ch-joinmsg");
    var jt = host.querySelector(".ch-jointoggle");
    jt.addEventListener("click", function(){
      var open = jf.classList.toggle("hidden") === false;
      jt.setAttribute("aria-expanded", open);
      if (open) jf.querySelector(".ch-codein").focus();
    });
    var jsay = function(t){ jmsg.textContent = t; jmsg.classList.toggle("hidden", !t); };
    jf.addEventListener("submit", function(e){
      e.preventDefault();
      var code = parseCode(jf.querySelector(".ch-codein").value);
      if (!code) return jsay(BAD_CODE);
      jsay("");
      var btn = jf.querySelector("button");
      btn.disabled = true;
      openCode(code, jsay).then(function(){ btn.disabled = false; jf.querySelector(".ch-codein").value = ""; });
    });
    var joinId = parseCode(params.get("join"));
    if (params.get("join")){
      history.replaceState(null, "", location.pathname);
      var banner = host.querySelector(".ch-banner");
      if (!joinId){ banner.textContent = BAD_CODE; banner.classList.remove("hidden"); }
      else openCode(joinId, function(t){ banner.textContent = t; banner.classList.remove("hidden"); });
    }
  }

  function page(){
    var host = document.getElementById("ms-main");
    var params = new URLSearchParams(location.search);
    if (!T.isOn()){ document.getElementById("ms-header").innerHTML = '<a class="tp-brand" href="./">Nursing School <span>Pinkprint</span></a>'; document.getElementById("ms-header").className = "tp-header ms-header"; guestPage(host, params.get("join")); return; }
    MyStudy.header("challenges");
    if (!T.feature("challenges")){ offPage(host); return; }
    var focusId = parseCode(params.get("focus"));
    MyStudy.load().then(function(d){ if (focusId) focusPage(d, host, focusId); else mainPage(d, host, params); }, function(err){
      host.innerHTML = '<p class="tp-note">Couldn\'t load your study data. Refresh the page to try again.</p>';
      if (window.console) console.error(err);
    });
  }

  return {page: page, parseCode: parseCode, create: create, join: join, load: load, submit: submit, groupMissed: groupMissed, remove: remove, link: link, friendly: friendly};
})();
