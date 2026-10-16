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
     nicknameTicket     random claim ticket for the nickname (never the lookup ID)
     scores             {examId: points} logged with Edit scores (private)
     busyWeeks          Mondays ("YYYY-MM-DD") of weeks a busy week pass was used
     breaksOff          true = holiday break weeks are skipped. Missing/false = the weekly goal still
                        counts during breaks (hit grows the streak, miss only pauses): on by default.
                        (Replaces the old break goal menu; any saved breakGoal is ignored.)
     knownCounts        {topicKey: questions} seen last time, for "12 new questions" labels
     activity           {deviceId: {date: answers}}: each device counts its own answers (goals, streaks)
     settingsAt         when any of the settings above last changed (for merging devices)
     sync               {lookup, key, version, dirty, seq, claimedOn}: this device's sync state

   Sync (phase 4): from the code, PBKDF2 derives two separate values with separate salts: a
   lookup ID (which row to load and save) and an AES-GCM key. The code itself is never sent.
   Progress, notes, nickname and settings are encrypted in the browser before saving, and
   the server only ever sees scrambled text. All requests go through /api/ (_worker.js).

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
  var OWNER_HASH = "cb84dd2509deb1db5485dbd495bc23928cd3cd90d2b6c2741539a3ff474793c5";

  var FEATURES = ["sure", "goal", "countdown", "grade", "review", "notes", "challenges", "celebrations"];
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

  /* The owner phrase is checked lowercased, trimmed, with runs of spaces collapsed to one */
  function normalizePhrase(s){ return String(s || "").toLowerCase().trim().replace(/\s+/g, " "); }

  function goalLabel(goal){
    goal = goal || DEFAULT_GOAL;
    return goal.type === "days" ? goal.value + " study days per week" : goal.value + " questions per week";
  }

  /* ---------- Sync helpers ---------- */
  var PBKDF2_ITERATIONS = 600000;
  var LOOKUP_SALT = "pinkprint-lookup-v1", KEY_SALT = "pinkprint-key-v1";
  /* Settings that travel between devices (everything else in the saved state stays on the device) */
  var SYNCED = ["nickname", "goal", "features", "nicknameTicket", "finishedSessions", "codeReminderDone", "noteReminderDone", "startedOn",
                "scores", "busyWeeks", "breaksOff", "knownCounts", "challenges", "ownerProof"];

  function subtle(){ return cryptoObj().subtle; }
  function utf8(s){ return new TextEncoder().encode(s); }
  function toHex(buf){
    return Array.prototype.map.call(new Uint8Array(buf), function(b){ return b.toString(16).padStart(2, "0"); }).join("");
  }
  function toB64(buf){
    var bytes = new Uint8Array(buf), bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function fromB64(s){
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function randomHex(bytes){
    var b = new Uint8Array(bytes);
    cryptoObj().getRandomValues(b);
    return toHex(b);
  }

  function pbkdf2(code, salt){
    return subtle().importKey("raw", utf8(normalizeCode(code)), "PBKDF2", false, ["deriveBits"]).then(function(k){
      return subtle().deriveBits({name: "PBKDF2", hash: "SHA-256", salt: utf8(salt), iterations: PBKDF2_ITERATIONS}, k, 256);
    });
  }
  /* {lookup: 64 hex characters, key: base64 AES-256 key}. Spaces and capitals in the code don't matter. */
  function deriveKeys(code){
    return Promise.all([pbkdf2(code, LOOKUP_SALT), pbkdf2(code, KEY_SALT)]).then(function(r){
      return {lookup: toHex(r[0]), key: toB64(r[1])};
    });
  }

  function aesKey(keyB64, use){
    return subtle().importKey("raw", fromB64(keyB64), {name: "AES-GCM"}, false, [use]);
  }
  /* "v1.<iv>.<ciphertext>", both base64 */
  function encryptJSON(keyB64, obj){
    var iv = new Uint8Array(12);
    cryptoObj().getRandomValues(iv);
    return aesKey(keyB64, "encrypt").then(function(k){
      return subtle().encrypt({name: "AES-GCM", iv: iv}, k, utf8(JSON.stringify(obj)));
    }).then(function(ct){ return "v1." + toB64(iv) + "." + toB64(ct); });
  }
  function decryptJSON(keyB64, text){
    var parts = String(text).split(".");
    if (parts.length !== 3 || parts[0] !== "v1") return Promise.reject(new Error("unreadable"));
    return aesKey(keyB64, "decrypt").then(function(k){
      return subtle().decrypt({name: "AES-GCM", iv: fromB64(parts[1])}, k, fromB64(parts[2]));
    }).then(function(pt){ return JSON.parse(new TextDecoder().decode(pt)); });
  }

  /* Merging two devices: per question, the more recently changed record wins (t = change time);
     for settings, the more recently changed set wins. */
  function mergeProgress(a, b){
    var out = {};
    [a || {}, b || {}].forEach(function(store){
      Object.keys(store).forEach(function(id){
        var r = store[id], cur = out[id];
        if (!cur || (r.t || 0) > (cur.t || 0)) out[id] = r;
      });
    });
    return out;
  }
  function pickSettings(state){
    var out = {};
    SYNCED.forEach(function(k){ if (state[k] !== undefined) out[k] = state[k]; });
    out.settingsAt = state.settingsAt || 0;
    return out;
  }
  /* Each device's daily answer counts only ever grow, so the larger number wins */
  function mergeActivity(a, b){
    var out = {};
    [a || {}, b || {}].forEach(function(act){
      Object.keys(act).forEach(function(dev){
        out[dev] = out[dev] || {};
        Object.keys(act[dev] || {}).forEach(function(d){ out[dev][d] = Math.max(out[dev][d] || 0, act[dev][d]); });
      });
    });
    return out;
  }
  /* Newest settings win, except challenge tickets, which are combined so none is lost */
  function mergeSettings(local, remote){
    var win = (remote && (remote.settingsAt || 0) > (local.settingsAt || 0)) ? remote : local;
    var list = mergeChallenges(local.challenges, remote && remote.challenges);
    if (!list.length && !win.challenges) return win;
    var out = {};
    Object.keys(win).forEach(function(k){ out[k] = win[k]; });
    out.challenges = list;
    return out;
  }
  /* Challenge tickets saved on any device, by challenge ID. A removed one stays removed. Entries
     are dropped 3 weeks after they were saved (challenges expire after 7 days). */
  var CHALLENGE_KEEP = 21 * 24 * 3600 * 1000;
  function mergeChallenges(a, b, now){
    var by = {}, cutoff = (now || Date.now()) - CHALLENGE_KEEP;
    (a || []).concat(b || []).forEach(function(c){
      if (!c || !c.id || (c.at || 0) < cutoff) return;
      var cur = by[c.id];
      if (!cur) { by[c.id] = c; return; }
      var m = {};
      Object.keys(cur).forEach(function(k){ m[k] = cur[k]; });
      Object.keys(c).forEach(function(k){ if (m[k] === undefined) m[k] = c[k]; });
      m.gone = !!(cur.gone || c.gone);
      m.done = !!(cur.done || c.done);
      by[c.id] = m;
    });
    return Object.keys(by).map(function(id){ return by[id]; }).sort(function(x, y){ return (y.at || 0) - (x.at || 0); });
  }

  var api = {
    OWNER_NAME: OWNER_NAME, FEATURES: FEATURES, GOALS: GOALS, DEFAULT_GOAL: DEFAULT_GOAL, ALL_KEYS: ALL_KEYS,
    generateCode: generateCode, normalizeCode: normalizeCode, parseCode: parseCode, maskCode: maskCode,
    pickNickname: pickNickname, goalLabel: goalLabel, normalizePhrase: normalizePhrase,
    deriveKeys: deriveKeys, encryptJSON: encryptJSON, decryptJSON: decryptJSON,
    mergeProgress: mergeProgress, mergeSettings: mergeSettings, pickSettings: pickSettings, mergeActivity: mergeActivity,
    mergeChallenges: mergeChallenges,
    PBKDF2_ITERATIONS: PBKDF2_ITERATIONS
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

  /* Only ever writes while tracking is on. Changes to synced settings are sent to the
     other devices. */
  api.update = function(patch){
    var s = api.state();
    if (!s) return null;
    var synced = false;
    Object.keys(patch).forEach(function(k){
      s[k] = patch[k];
      if (SYNCED.indexOf(k) !== -1) synced = true;
    });
    if (synced) s.settingsAt = Date.now();
    lsSet(KEY, JSON.stringify(s));
    if (synced) api.changed();
    return s;
  };
  /* This device's sync bookkeeping; never sent anywhere */
  function setSync(patch){
    var s = api.state();
    if (!s) return null;
    s.sync = s.sync || {};
    Object.keys(patch).forEach(function(k){ s.sync[k] = patch[k]; });
    lsSet(KEY, JSON.stringify(s));
    return s.sync;
  }

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
             finishedSessions: 0, codeReminderDone: false, noteReminderDone: false, startedOn: today(),
             nicknameTicket: opts.nicknameTicket || randomHex(32), settingsAt: Date.now(),
             sync: {version: 0, dirty: true, seq: 1}};
    lsSet(KEY, JSON.stringify(s));
    lsRemove("pinkprint-track");
    return s;
  };

  /* Clears everything tracking saved on this device, back to the guest view
     (Delete my data also removes the saved copy: see deleteEverywhere) */
  api.deleteAll = function(){
    ALL_KEYS.forEach(lsRemove);
    try { sessionStorage.removeItem(CARRY_KEY); } catch (e) {}
  };

  /* Counts one answer for today on this device (weekly goal and streaks) */
  api.logAnswer = function(date){
    var s = api.state();
    if (!s) return;
    s.sync = s.sync || {};
    if (!s.sync.device) s.sync.device = randomHex(8);
    var act = s.activity || {}, mine = act[s.sync.device] || {};
    mine[date] = (mine[date] || 0) + 1;
    act[s.sync.device] = mine;
    s.activity = act;
    lsSet(KEY, JSON.stringify(s));
    api.changed();
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

  /* ---------- Sync ---------- */
  function call(action, body){
    return fetch(ROOT + "api/" + action, {
      method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body || {}),
      credentials: "same-origin", cache: "no-store"
    }).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(j){
        if (!res.ok){ var e = new Error(j.error || ("HTTP " + res.status)); e.status = res.status; throw e; }
        return j.result;
      });
    });
  }
  api.call = call;
  api.randomHex = randomHex;

  /* The lookup ID and key are derived once (it takes a moment on purpose) and kept on this device */
  var keysPromise = null;
  function ensureKeys(){
    var s = api.state();
    if (!s) return Promise.reject(new Error("not tracking"));
    if (s.sync && s.sync.lookup && s.sync.key) return Promise.resolve({lookup: s.sync.lookup, key: s.sync.key});
    if (!keysPromise){
      keysPromise = deriveKeys(s.code).then(function(k){
        setSync({lookup: k.lookup, key: k.key});
        keysPromise = null;
        return k;
      }, function(err){ keysPromise = null; throw err; });
    }
    return keysPromise;
  }
  api.ensureKeys = ensureKeys;

  function loadLocalProgress(){ try { return JSON.parse(lsGet(PROGRESS_KEY)) || {}; } catch (e) { return {}; } }

  /* Brings another device's copy into this one */
  function absorb(remote){
    var s = api.state();
    var merged = mergeSettings(pickSettings(s), remote.settings || {});
    Object.keys(merged).forEach(function(k){ s[k] = merged[k]; });
    s.activity = mergeActivity(s.activity, remote.activity);
    lsSet(KEY, JSON.stringify(s));
    lsSet(PROGRESS_KEY, JSON.stringify(mergeProgress(loadLocalProgress(), remote.progress || {})));
    document.dispatchEvent(new CustomEvent("pinkprint-synced"));
  }

  var pushTimer = null, busy = null;
  /* Called after every change: saves to the other devices a moment later */
  api.changed = function(){
    var s = api.state();
    if (!s) return;
    var sync = s.sync || {};
    setSync({dirty: true, seq: (sync.seq || 0) + 1});
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function(){ api.sync(); }, 1500);
  };

  /* Another device deleted this code's data: clear this device too */
  function remoteDeleted(){
    api.deleteAll();
    document.dispatchEvent(new CustomEvent("pinkprint-deleted"));
    location.reload();
  }

  /* Load the saved copy, merge it in, then save this device's changes. Safe to call any time. */
  api.sync = function(){
    if (!api.isOn()) return Promise.resolve();
    if (busy) return busy.then(function(){ return api.state() && api.state().sync && api.state().sync.dirty ? api.sync() : null; });
    busy = ensureKeys().then(function(k){
      return call("vault/load", {lookup: k.lookup}).then(function(rows){
        var s = api.state(), sync = s.sync || {};
        var row = rows && rows[0];
        if (!row){
          if ((sync.version || 0) > 0) return remoteDeleted();
          return push(k, 0);
        }
        var p = row.version !== sync.version
          ? decryptJSON(k.key, row.data).then(function(remote){ absorb(remote); setSync({version: row.version}); })
          : Promise.resolve();
        return p.then(function(){ return push(k, row.version); });
      });
    }).then(function(){ return refreshClaim(); }).catch(function(err){
      if (window.console) console.warn("[pinkprint] sync paused:", err.message);
    }).then(function(){ busy = null; });
    return busy;
  };

  function push(k, version, tries){
    var s = api.state();
    if (!s || !s.sync || !s.sync.dirty) return Promise.resolve();
    var seq = s.sync.seq;
    var payload = {v: 1, settings: pickSettings(s), progress: loadLocalProgress(), activity: s.activity || {}};
    return encryptJSON(k.key, payload).then(function(data){
      return call("vault/save", {lookup: k.lookup, data: data, version: version});
    }).then(function(rows){
      var r = rows && rows[0];
      if (!r) throw new Error("no reply");
      if (r.saved){
        var now = api.state().sync;
        setSync({version: r.version, dirty: now.seq !== seq});
        return;
      }
      if (r.version === 0) return remoteDeleted();
      /* Another device saved first: merge its copy and try again */
      if ((tries || 0) >= 3) throw new Error("too many conflicts");
      return decryptJSON(k.key, r.data).then(function(remote){
        absorb(remote);
        setSync({version: r.version});
        return push(k, r.version, (tries || 0) + 1);
      });
    });
  }

  /* ---------- Nicknames (one person per name) ---------- */
  api.takenNicknames = function(){
    return call("nicknames/taken").then(function(list){ return Array.isArray(list) ? list : []; }, function(){ return []; });
  };
  /* Unclaimed names from the list (or the whole list if the server can't be reached) */
  api.freeNicknames = function(keep){
    return Promise.all([api.loadNicknames(), api.takenNicknames()]).then(function(r){
      var taken = r[1];
      return r[0].filter(function(n){ return n === keep || taken.indexOf(n) === -1; });
    });
  };
  function ticket(){
    var s = api.state();
    if (s.nicknameTicket) return s.nicknameTicket;
    return api.update({nicknameTicket: randomHex(32)}).nicknameTicket;
  }
  /* Claims a name with this person's ticket. Resolves true/false (false: someone else has it). */
  api.claimNickname = function(name, ticketHex){
    if (name === OWNER_NAME) return Promise.resolve(true);
    return call("nicknames/claim", {nickname: name, ticket: ticketHex || ticket()});
  };
  function releaseNickname(name){
    var s = api.state();
    if (!name || name === OWNER_NAME || !s || !s.nicknameTicket) return Promise.resolve(false);
    return call("nicknames/release", {nickname: name, ticket: s.nicknameTicket}).catch(function(){ return false; });
  }
  /* Switch nickname: claim the new one first, then free the old one */
  api.switchNickname = function(name){
    var s = api.state(), old = s.nickname;
    if (name === old) return Promise.resolve(true);
    return api.claimNickname(name).then(function(ok){
      if (!ok) return false;
      api.update({nickname: name, nicknameTaken: false});
      setSync({claimedOn: today()});
      releaseNickname(old);
      return true;
    });
  };
  /* Keeps the claim fresh (a name unused for a year is released); once a day at most */
  function refreshClaim(){
    var s = api.state();
    if (!s || s.nickname === OWNER_NAME || (s.sync && s.sync.claimedOn === today())) return Promise.resolve();
    return api.claimNickname(s.nickname).then(function(ok){
      setSync({claimedOn: today()});
      var st = api.state();
      if (!!st.nicknameTaken !== !ok){ st.nicknameTaken = !ok; lsSet(KEY, JSON.stringify(st)); }
    }, function(){});
  }

  /* ---------- Link this device ----------
     Finds the saved copy for a typed or scanned code. Resolves with the parsed code, or rejects
     with a message to show. */
  var OFFLINE = "Couldn't reach the server. Check your connection and try again.";
  api.link = function(typed){
    return api.loadWords().catch(function(){ throw new Error(OFFLINE); }).then(function(words){
      var code = parseCode(typed, words);
      if (!code) throw new Error("That doesn't look like a code. It's 3 words and 4 numbers, like flashcard pulse coffee 4821.");
      return deriveKeys(code).then(function(k){
        return call("vault/load", {lookup: k.lookup}).catch(function(){ throw new Error(OFFLINE); }).then(function(rows){
          var row = rows && rows[0];
          if (!row) throw new Error("No saved progress was found for that code. Check the words and numbers.");
          return decryptJSON(k.key, row.data).catch(function(){
            throw new Error("That code's progress couldn't be unlocked.");
          }).then(function(remote){
            /* This device now uses that code: its settings and progress replace what's here */
            var cur = api.state();
            var sameCode = !!cur && cur.code === code;
            var keep = sameCode ? loadLocalProgress() : {};
            if (!sameCode) api.deleteAll();
            var s = {code: code, sync: {lookup: k.lookup, key: k.key, version: row.version, dirty: false, seq: 0}};
            var settings = remote.settings || {};
            Object.keys(settings).forEach(function(key){ s[key] = settings[key]; });
            s.activity = mergeActivity(sameCode ? cur.activity : {}, remote.activity);
            if (!s.features){ s.features = {}; FEATURES.forEach(function(f){ s.features[f] = true; }); }
            lsSet(KEY, JSON.stringify(s));
            lsSet(PROGRESS_KEY, JSON.stringify(mergeProgress(keep, remote.progress || {})));
            return code;
          });
        });
      });
    });
  };

  /* Delete my data: removes the saved copy and frees the nickname, then clears this device.
     If the server can't be reached, nothing is deleted (so the saved copy isn't left behind). */
  api.deleteEverywhere = function(){
    var s = api.state();
    if (!s) return Promise.resolve();
    return ensureKeys().then(function(k){
      return call("vault/delete", {lookup: k.lookup});
    }).then(function(){
      /* Challenges this person made are deleted too (best effort; others expire in 7 days) */
      return Promise.all((s.challenges || []).filter(function(c){ return c.mine && !c.gone; }).map(function(c){
        return call("challenges/delete", {id: c.id, ticket: c.ticket}).catch(function(){});
      }));
    }).then(function(){
      return releaseNickname(s.nickname);
    }).then(function(){ api.deleteAll(); });
  };

  /* Sync when a page opens, when the tab comes back, and before it's hidden */
  if (api.isOn()){
    var lastPull = 0;
    var kick = function(){ lastPull = Date.now(); api.sync(); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function(){ setTimeout(kick, 50); });
    else setTimeout(kick, 50);
    document.addEventListener("visibilitychange", function(){
      if (!api.isOn()) return;
      if (document.visibilityState === "hidden"){
        var st = api.state();
        if (st && st.sync && st.sync.dirty){ clearTimeout(pushTimer); api.sync(); }
      } else if (Date.now() - lastPull > 30000) kick();
    });
  }

  /* ---------- Celebrations ----------
     A short burst of pink squares for newly mastered questions, exam ready and streaks.
     Off when the Celebration animations switch is off or the device asks for reduced motion. */
  api.celebrate = function(){
    if (!api.feature("celebrations")) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var box = document.createElement("div");
    box.className = "pp-confetti";
    box.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 28; i++){
      var p = document.createElement("span");
      p.style.left = (Math.random() * 100) + "%";
      p.style.animationDelay = (Math.random() * 0.4) + "s";
      p.style.setProperty("--drift", ((Math.random() - 0.5) * 160) + "px");
      p.className = "c" + (i % 3);
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(function(){ box.remove(); }, 2200);
  };

  /* ---------- Challenges (phase 6) ----------
     Each challenge this person made or joined is saved with its own random ticket, which is the
     only way to submit a score, see scores or delete it. */
  /* Weekly goals during semester or holiday breaks: on unless they turned it off */
  api.goalOnBreaks = function(){
    var s = api.state();
    if (!s) return false;
    return s.breaksOff !== true;
  };

  api.challenges = function(){
    var s = api.state();
    return s ? (s.challenges || []).filter(function(c){ return !c.gone; }) : [];
  };
  api.challenge = function(id){
    id = String(id || "").toUpperCase();
    return api.challenges().filter(function(c){ return c.id === id; })[0] || null;
  };
  /* Adds or changes one saved challenge */
  api.saveChallenge = function(entry){
    var s = api.state();
    if (!s) return null;
    var list = (s.challenges || []).filter(function(c){ return c.id !== entry.id; });
    var old = (s.challenges || []).filter(function(c){ return c.id === entry.id; })[0] || {};
    var next = {};
    Object.keys(old).forEach(function(k){ next[k] = old[k]; });
    Object.keys(entry).forEach(function(k){ next[k] = entry[k]; });
    if (!next.at) next.at = Date.now();
    if (!next.ticket) next.ticket = randomHex(32);
    list.unshift(next);
    api.update({challenges: mergeChallenges(list, [])});
    return next;
  };
  /* Shows the nickname is this person's: their claim ticket, or the owner phrase */
  api.nicknameProof = function(){
    var s = api.state();
    if (!s) return "";
    return s.nickname === OWNER_NAME ? (s.ownerProof || "") : (s.nicknameTicket || "");
  };

  /* ---------- Owner nickname ----------
     Opening any page with #owner=<phrase> on a tracked device sets "Miss Pinkprint" when the
     phrase matches. The phrase is cleared from the address bar right away. */
  api.ownerHash = function(phrase){
    var bytes = new TextEncoder().encode(normalizePhrase(phrase));
    return crypto.subtle.digest("SHA-256", bytes).then(function(buf){
      return Array.prototype.map.call(new Uint8Array(buf), function(b){ return b.toString(16).padStart(2, "0"); }).join("");
    });
  };
  function ownerFromHash(){
    if (!/^#owner=/.test(location.hash)) return;
    var phrase = location.hash.slice(7);
    try { phrase = decodeURIComponent(phrase.replace(/\+/g, " ")); } catch (e) {}
    history.replaceState(null, "", location.pathname + location.search);
    if (!OWNER_HASH) return;
    api.ownerHash(phrase).then(function(h){
      if (h !== OWNER_HASH) return;
      /* Only says anything when the phrase is right */
      if (!api.isOn()){ alert("That's the owner phrase, but this device isn't tracking yet. Start tracking (or link this device with your code), then open the link again."); return; }
      var old = api.state().nickname;
      /* Kept (encrypted when synced) so challenges can check the name is really the owner's */
      api.update({nickname: OWNER_NAME, nicknameTaken: false, ownerProof: normalizePhrase(phrase)});
      if (old !== OWNER_NAME) releaseNickname(old);
      document.dispatchEvent(new CustomEvent("pinkprint-nickname"));
      alert("You're Miss Pinkprint on this device. It syncs to your other devices.");
    });
  }
  /* On page load, and when #owner= is typed onto a page that's already open */
  ownerFromHash();
  window.addEventListener("hashchange", ownerFromHash);

  window.Tracking = api;
})();
