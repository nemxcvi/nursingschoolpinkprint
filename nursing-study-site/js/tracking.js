/* Tracking: the code, nickname, weekly goal and study feature settings for this device.
   Progress itself (answers, mastery, journal) lives in js/progress.js.

   Tracking is on only when this device has a code saved. Guests: nothing is written anywhere.

   Saved on this device (localStorage "pinkprint-tracking"):
     code               "flashcard pulse coffee 4821" (3 words + 4 digits)
     nickname
     goal               {type: "questions" | "days", value}
     features           {sure, goal, countdown, review, notes, challenges, celebrations}: all on by default
     finishedSessions   quiz sessions that reached the results page (for the one-time "save your code" reminder)
     codeReminderDone, noteReminderDone
     startedOn          "YYYY-MM-DD"

   Code creation and storage stay in this file so encryption and sync can be added later
   without rewriting pages. */
(function(){
  var KEY = "pinkprint-tracking";
  var PROGRESS_KEY = "pinkprint-progress";
  var CARRY_KEY = "pinkprint-carry";        /* sessionStorage, only after a guest taps "Start tracking" on results */
  /* Everything tracking has ever saved on a device, cleared by Delete my data */
  var ALL_KEYS = [KEY, PROGRESS_KEY, "pinkprint-today", "pinkprint-track"];

  var OWNER_NAME = "Miss Pinkprint";
  /* SHA-256 of the owner phrase (never the phrase itself). Empty until the owner picks one. */
  var OWNER_HASH = "";

  var FEATURES = ["sure", "goal", "countdown", "review", "notes", "challenges", "celebrations"];
  var GOALS = {questions: [25, 50, 100, 150], days: [2, 3, 4, 5]};
  var DEFAULT_GOAL = {type: "questions", value: 50};

  /* ---------- Codes ---------- */
  function cryptoObj(){
    if (typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.getRandomValues) return globalThis.crypto;
    return require("crypto").webcrypto;
  }
  /* Uniform random integer in [0, n), without modulo bias */
  function randomInt(n){
    var buf = new Uint32Array(1), limit = Math.floor(0x100000000 / n) * n;
    do { cryptoObj().getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % n;
  }

  /* 3 different words + 4 digits, e.g. "flashcard pulse coffee 4821" */
  function generateCode(words){
    var picked = [];
    while (picked.length < 3){
      var w = words[randomInt(words.length)];
      if (picked.indexOf(w) === -1) picked.push(w);
    }
    return picked.join(" ") + " " + String(randomInt(10000)).padStart(4, "0");
  }

  /* Spaces and capitals don't matter: "Flashcard  Pulse coffee4821" is the same code */
  function normalizeCode(s){ return String(s || "").toLowerCase().replace(/\s+/g, ""); }

  /* A typed code in its standard form ("flashcard pulse coffee 4821"), or null if it isn't
     3 list words + 4 digits. Works with or without spaces. */
  function parseCode(s, words){
    var m = normalizeCode(s).match(/^([a-z]+)(\d{4})$/);
    if (!m) return null;
    var letters = m[1], set = {};
    words.forEach(function(w){ set[w] = true; });
    for (var i = 1; i < letters.length - 1; i++){
      for (var j = i + 1; j < letters.length; j++){
        var a = letters.slice(0, i), b = letters.slice(i, j), c = letters.slice(j);
        if (set[a] && set[b] && set[c]) return a + " " + b + " " + c + " " + m[2];
      }
    }
    return null;
  }

  function maskCode(code){
    return String(code).split(" ")[0] + " •••••• •••••• ••••";
  }

  /* ---------- Nicknames ---------- */
  function pickNickname(names, avoid){
    var pool = names.filter(function(n){ return n !== OWNER_NAME && n !== avoid; });
    return pool.length ? pool[randomInt(pool.length)] : avoid;
  }

  function goalLabel(goal){
    goal = goal || DEFAULT_GOAL;
    return goal.type === "days" ? goal.value + " study days per week" : goal.value + " questions per week";
  }

  var api = {
    OWNER_NAME: OWNER_NAME, FEATURES: FEATURES, GOALS: GOALS, DEFAULT_GOAL: DEFAULT_GOAL, ALL_KEYS: ALL_KEYS,
    generateCode: generateCode, normalizeCode: normalizeCode, parseCode: parseCode, maskCode: maskCode,
    pickNickname: pickNickname, goalLabel: goalLabel
  };

  if (typeof window === "undefined"){ module.exports = api; return; }

  /* ---------- Browser: this device's saved state ---------- */
  var ROOT = new URL("../", document.currentScript.src).href;
  api.ROOT = ROOT;

  function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
  function lsRemove(k){ try { localStorage.removeItem(k); } catch (e) {} }

  api.state = function(){
    try { var s = JSON.parse(lsGet(KEY)); return s && s.code ? s : null; } catch (e) { return null; }
  };
  api.isOn = function(){ return !!api.state(); };

  /* Only ever writes while tracking is on */
  api.update = function(patch){
    var s = api.state();
    if (!s) return null;
    Object.keys(patch).forEach(function(k){ s[k] = patch[k]; });
    lsSet(KEY, JSON.stringify(s));
    return s;
  };

  /* A study feature is on unless it was switched off in Settings (and only while tracking) */
  api.feature = function(name){
    var s = api.state();
    return !!s && !(s.features && s.features[name] === false);
  };
  api.setFeature = function(name, on){
    var s = api.state();
    if (!s) return;
    var f = s.features || {};
    f[name] = !!on;
    api.update({features: f});
  };

  function today(){
    var n = new Date();
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
  }

  /* Start tracking: save the code, nickname and goal. Progress already on this device is kept. */
  api.start = function(opts){
    var features = {};
    FEATURES.forEach(function(f){ features[f] = true; });
    var s = {code: opts.code, nickname: opts.nickname, goal: opts.goal || DEFAULT_GOAL, features: features,
             finishedSessions: 0, codeReminderDone: false, noteReminderDone: false, startedOn: today()};
    lsSet(KEY, JSON.stringify(s));
    lsRemove("pinkprint-track");
    return s;
  };

  /* Delete my data: everything tracking saved on this device, back to the guest view */
  api.deleteAll = function(){
    ALL_KEYS.forEach(lsRemove);
    try { sessionStorage.removeItem(CARRY_KEY); } catch (e) {}
  };

  /* Counts quiz sessions that reached the results page; returns the new count */
  api.noteFinishedSession = function(){
    var s = api.state();
    if (!s) return 0;
    return api.update({finishedSessions: (s.finishedSessions || 0) + 1}).finishedSessions;
  };

  /* ---------- Guest session carried to Start tracking ----------
     Kept in this tab only, and only after a guest taps "Start tracking" on their results */
  api.carrySession = function(answers){
    try { sessionStorage.setItem(CARRY_KEY, JSON.stringify(answers)); } catch (e) {}
  };
  api.takeCarry = function(){
    try {
      var a = JSON.parse(sessionStorage.getItem(CARRY_KEY));
      sessionStorage.removeItem(CARRY_KEY);
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  };
  api.dropCarry = function(){ try { sessionStorage.removeItem(CARRY_KEY); } catch (e) {} };

  /* ---------- Data files ---------- */
  var cache = {};
  function getJSON(path){
    if (!cache[path]){
      cache[path] = fetch(ROOT + path).then(function(r){
        if (!r.ok) throw new Error(path + ": HTTP " + r.status);
        return r.json();
      });
    }
    return cache[path];
  }
  api.loadWords = function(){ return getJSON("data/wordlist.json").then(function(d){ return d.words; }); };
  api.loadNicknames = function(){
    return getJSON("data/nicknames.json").then(function(d){
      return d.names.filter(function(n){ return n !== OWNER_NAME; });
    });
  };

  /* ---------- Backups ---------- */
  /* Opens the person's own email app; nothing passes through the site */
  api.mailtoHref = function(code){
    var body = "My Nursing School Pinkprint code:\n\n" + code + "\n\n" +
      "Keep it private. Type it on another device to see your progress there.\n" + ROOT;
    return "mailto:?subject=" + encodeURIComponent("My Nursing School Pinkprint code") + "&body=" + encodeURIComponent(body);
  };

  /* Asks the browser to save the code as a password. Chrome and Edge get the save prompt
     straight away; Safari offers to save when the hidden form is submitted. The form posts
     to about:blank in a hidden frame, so the code never leaves the device. */
  api.saveToPasswordManager = function(code, nickname){
    var user = "Pinkprint · " + (nickname || "my code");
    if (window.PasswordCredential && navigator.credentials && navigator.credentials.store){
      return navigator.credentials.store(new window.PasswordCredential({id: user, password: code, name: user}))
        .catch(function(){ submitPasswordForm(user, code); });
    }
    submitPasswordForm(user, code);
    return Promise.resolve();
  };
  function submitPasswordForm(user, code){
    var frame = document.getElementById("pp-pm-frame");
    if (!frame){
      frame = document.createElement("iframe");
      frame.id = "pp-pm-frame"; frame.name = "pp-pm-frame"; frame.title = "Password save helper";
      frame.className = "pp-offscreen"; frame.tabIndex = -1;
      document.body.appendChild(frame);
    }
    var form = document.createElement("form");
    form.method = "post"; form.action = "about:blank"; form.target = "pp-pm-frame";
    form.className = "pp-offscreen"; form.setAttribute("autocomplete", "on");
    form.innerHTML = "<input type='text' name='username' autocomplete='username'><input type='password' name='password' autocomplete='new-password'>";
    form.username.value = user; form.password.value = code;
    document.body.appendChild(form);
    form.submit();
    setTimeout(function(){ form.remove(); }, 1000);
  }

  /* Where a scanned QR code goes: device linking (phase 4). The code rides in the #part,
     which browsers never send to the server. */
  api.linkUrl = function(code){ return ROOT + "link.html#code=" + String(code).trim().split(/\s+/).join("-"); };
  api.qrSvg = function(text, cell){
    if (typeof qrcode === "undefined") return "";
    var qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({cellSize: cell || 3, margin: 0, scalable: true});
  };
  api.printUrl = function(code){ return ROOT + "print-code.html#code=" + String(code).trim().split(/\s+/).join("-"); };

  /* ---------- Owner nickname ----------
     Opening any page with #owner=<phrase> on a tracked device sets "Miss Pinkprint" when the
     phrase matches. The phrase is cleared from the address bar right away. */
  api.ownerHash = function(phrase){
    var bytes = new TextEncoder().encode(String(phrase).trim());
    return crypto.subtle.digest("SHA-256", bytes).then(function(buf){
      return Array.prototype.map.call(new Uint8Array(buf), function(b){ return b.toString(16).padStart(2, "0"); }).join("");
    });
  };
  if (/^#owner=/.test(location.hash)){
    var phrase = decodeURIComponent(location.hash.slice(7));
    history.replaceState(null, "", location.pathname + location.search);
    if (OWNER_HASH && api.isOn()){
      api.ownerHash(phrase).then(function(h){
        if (h === OWNER_HASH){
          api.update({nickname: OWNER_NAME});
          document.dispatchEvent(new CustomEvent("pinkprint-nickname"));
        }
      });
    }
  }

  window.Tracking = api;
})();
