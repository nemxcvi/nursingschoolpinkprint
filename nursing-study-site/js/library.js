/* Library (shared resources): classmates share PDFs, images and Word files, tagged by unit and
   topic. Tracking codes only: every call sends this device's lookup ID, which the server checks.
   Units come from SITE (assets/site-data.js) and topics from each course's data files, so a new
   course (like NUR 121) shows up here once its data is added. Server side: _worker.js (Library). */
var Library = (function(){
  var T = Tracking;
  var ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.doc,.docx,application/pdf,image/jpeg,image/png,image/webp,image/heic,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  var MAX = 20 * 1024 * 1024;
  var TYPE_LABEL = {"application/pdf": "PDF", "image/jpeg": "JPG", "image/png": "PNG", "image/webp": "WEBP", "image/heic": "HEIC",
                    "application/msword": "Word", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word"};
  var units = [], topicsByUnit = {}, files = [], filter = {unit: "", topic: ""}, lookup = null;

  function esc(s){ return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function size(n){ return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function day(iso){ return new Date(iso).toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric"}); }
  function $(id){ return document.getElementById(id); }

  /* Every unit of every course, and the topics of units that have quiz data */
  function loadStructure(){
    SITE.sheets.forEach(function(sh){
      sh.units.forEach(function(u){
        units.push({key: sh.id + ":" + u.code, course: sh.code, label: sh.code + " · Unit " + u.num + " · " + u.name, short: "Unit " + u.num + " · " + u.name});
      });
    });
    var get = function(p){ return fetch(T.ROOT + p).then(function(r){ if (!r.ok) throw new Error(p); return r.json(); }); };
    return Promise.all(SITE.sheets.map(function(sh){
      return get("data/" + sh.id + "/index.json").then(function(ix){
        return Promise.all(ix.units.map(function(n){
          return get("data/" + sh.id + "/unit-" + n + ".json").then(function(d){
            var code = "U-" + String(n).padStart(2, "0");
            topicsByUnit[sh.id + ":" + code] = d.topics.map(function(t){ return {key: sh.id + ":" + code + ":" + t.slug, label: t.topic}; });
          });
        }));
      }).catch(function(){ /* a course without data yet: units only */ });
    }));
  }
  function unitLabel(key){ var u = units.filter(function(x){ return x.key === key; })[0]; return u ? u.short : key; }
  function topicLabel(key){
    var unitKey = key.split(":").slice(0, 2).join(":");
    var t = (topicsByUnit[unitKey] || []).filter(function(x){ return x.key === key; })[0];
    return t ? t.label : key.split(":").pop();
  }

  /* ---------- Page ---------- */
  function intro(){
    return '<section class="tp-intro"><div class="tp-eyebrow">Shared resources</div><h1 class="tp-h1">Library</h1>' +
      '<p class="tp-lede">Notes, diagrams and handouts shared by classmates. Download anything here, and share your own.</p></section>' +
      '<section class="lb-rules" aria-label="Sharing rules"><h2 class="ch-eyebrow">Sharing rules</h2><ol>' +
      "<li><strong>No patient information.</strong> No names, initials, room numbers, dates of birth, MRNs, photos, or anything identifying from clinical.</li>" +
      "<li><strong>No test content.</strong> No exam questions, recalled test content, or proctored ATI material.</li></ol></section>";
  }
  function checkList(name, items, allLabel, picked){
    var all = picked.indexOf("all") !== -1;
    return '<label class="lb-check lb-all"><input type="checkbox" name="' + name + '" value="all"' + (all ? " checked" : "") + "> " + allLabel + "</label>" +
      items.map(function(i){
        return '<label class="lb-check"><input type="checkbox" name="' + name + '" value="' + esc(i.key) + '"' +
          (all ? " disabled" : picked.indexOf(i.key) !== -1 ? " checked" : "") + "> " + esc(i.label) + "</label>";
      }).join("");
  }
  function formHtml(){
    var nick = (T.state() || {}).nickname || "";
    return '<form class="ms-card lb-form" id="lb-form" novalidate><h2 class="ms-h2 ch-h2">Share a file</h2>' +
      '<div class="ch-field"><label for="lb-file">File</label><input type="file" id="lb-file" class="lb-file" accept="' + ACCEPT + '">' +
      '<span class="tp-hint">PDF, JPG, PNG, WEBP, HEIC or Word, up to 20 MB.</span></div>' +
      '<div class="ch-field"><label for="lb-title">Title</label><input id="lb-title" class="tp-input" maxlength="120" required></div>' +
      '<div class="ch-field"><label for="lb-desc">Short description (optional)</label><textarea id="lb-desc" class="tp-input lb-desc" maxlength="500" rows="2"></textarea></div>' +
      '<fieldset class="ch-field"><legend>Units</legend><div class="lb-checks" id="lb-units">' + checkList("unit", units, "All units", ["all"]) + "</div></fieldset>" +
      '<fieldset class="ch-field"><legend>Topics</legend><div class="lb-checks" id="lb-topics"></div></fieldset>' +
      '<fieldset class="ch-field"><legend>Shown as</legend><div class="lb-show">' +
      '<label class="lb-check"><input type="radio" name="show" value="name" checked> Show my name</label>' +
      '<label class="lb-check"><input type="radio" name="show" value="anon"> Anonymous</label></div>' +
      '<input id="lb-name" class="tp-input" maxlength="40" aria-label="Name to show" value="' + esc(nick) + '"></fieldset>' +
      '<div class="lb-confirm"><label class="lb-check"><input type="checkbox" id="lb-ok1"> This file contains no patient information (names, initials, room numbers, dates of birth, MRNs, photos, or anything identifying from clinical).</label>' +
      '<label class="lb-check"><input type="checkbox" id="lb-ok2"> This file contains no exam questions, recalled test content, or proctored ATI material.</label></div>' +
      '<button type="submit" class="ms-btn is-primary is-big" id="lb-upload" disabled>Share file</button>' +
      '<p class="tp-note hidden" id="lb-msg" role="alert"></p></form>';
  }
  function picked(boxId){
    return [].map.call(document.querySelectorAll("#" + boxId + " input:checked"), function(i){ return i.value; });
  }
  /* Topics follow the units picked: every topic of those units (all units: every topic) */
  function fillTopics(){
    var u = picked("lb-units");
    var keys = u.indexOf("all") !== -1 ? Object.keys(topicsByUnit) : u.filter(function(k){ return topicsByUnit[k]; });
    var keep = picked("lb-topics");
    var items = [];
    keys.forEach(function(k){
      topicsByUnit[k].forEach(function(t){ items.push({key: t.key, label: (keys.length > 1 ? unitLabel(k).split(" · ")[0] + " · " : "") + t.label}); });
    });
    $("lb-topics").innerHTML = checkList("topic", items, "All topics", keep.length ? keep.filter(function(k){ return k === "all" || items.some(function(i){ return i.key === k; }); }) : ["all"]);
    if (!picked("lb-topics").length) $("lb-topics").querySelector('input[value="all"]').checked = true;
  }
  function wireChecks(boxId, after){
    $(boxId).addEventListener("change", function(e){
      if (e.target.value !== "all") return after && after();
      var all = e.target.checked;
      [].forEach.call($(boxId).querySelectorAll('input:not([value="all"])'), function(i){ i.disabled = all; if (all) i.checked = false; });
      if (after) after();
    });
  }

  function filtersHtml(){
    var withFiles = units;
    return '<div class="ms-filters lb-filters"><label><span class="tp-label">Unit</span><select id="lb-funit"><option value="">All units</option>' +
      withFiles.map(function(u){ return '<option value="' + esc(u.key) + '"' + (filter.unit === u.key ? " selected" : "") + ">" + esc(u.label) + "</option>"; }).join("") + "</select></label>" +
      '<label><span class="tp-label">Topic</span><select id="lb-ftopic"' + (filter.unit && topicsByUnit[filter.unit] ? "" : " disabled") + '><option value="">All topics</option>' +
      (topicsByUnit[filter.unit] || []).map(function(t){ return '<option value="' + esc(t.key) + '"' + (filter.topic === t.key ? " selected" : "") + ">" + esc(t.label) + "</option>"; }).join("") +
      "</select></label></div>";
  }
  /* Files tagged All show under every filter */
  function matches(f){
    if (filter.unit && f.units.indexOf("all") === -1 && f.units.indexOf(filter.unit) === -1) return false;
    if (filter.topic && f.topics.indexOf("all") === -1 && f.topics.indexOf(filter.topic) === -1) return false;
    return true;
  }
  function tags(f){
    var u = f.units.indexOf("all") !== -1 ? ["All units"] : f.units.map(unitLabel);
    var t = f.topics.indexOf("all") !== -1 ? ["All topics"] : f.topics.map(topicLabel);
    return u.concat(t).map(function(x){ return '<span class="lb-tag">' + esc(x) + "</span>"; }).join("");
  }
  function cardHtml(f){
    return '<article class="ms-card lb-card" data-id="' + esc(f.id) + '"><div class="lb-top"><span class="ch-eyebrow">' + esc(TYPE_LABEL[f.mime] || "File") + " · " + size(f.size) + "</span>" +
      (f.mine ? '<button type="button" class="ms-linkbtn is-danger lb-delete">Delete</button>' : "") + "</div>" +
      '<h3 class="ms-h2 ch-h2">' + esc(f.title) + "</h3>" +
      '<span class="ch-meta">' + esc(f.name || "Anonymous") + " · " + day(f.created_at) + "</span>" +
      (f.description ? '<p class="lb-desc-text">' + esc(f.description) + "</p>" : "") +
      '<div class="lb-tags">' + tags(f) + "</div>" +
      '<div class="ch-btns"><button type="button" class="ms-btn is-primary lb-download">Download</button><span class="lb-fname">' + esc(f.file_name) + "</span></div></article>";
  }
  function drawList(){
    var shown = files.filter(matches);
    $("lb-list").innerHTML = shown.length ? shown.map(cardHtml).join("")
      : '<p class="ch-note">' + (files.length ? "No files match these filters yet." : "No files yet. Share the first one!") + "</p>";
    $("lb-count").textContent = shown.length === files.length ? files.length + (files.length === 1 ? " file" : " files") : shown.length + " of " + files.length + " files";
  }
  function refresh(){
    return T.call("library/list", {lookup: lookup}).then(function(list){ files = Array.isArray(list) ? list : []; drawList(); }, function(err){
      $("lb-list").innerHTML = '<p class="tp-note">' + esc(err.message === "the Library is not set up" ? "The Library isn't set up yet." : "Couldn't load the Library: " + err.message) + "</p>";
    });
  }

  function say(text){ $("lb-msg").textContent = text; $("lb-msg").classList.toggle("hidden", !text); }
  function wireForm(){
    wireChecks("lb-units", fillTopics);
    wireChecks("lb-topics");
    fillTopics();
    var sync = function(){ $("lb-upload").disabled = !($("lb-ok1").checked && $("lb-ok2").checked); };
    $("lb-ok1").addEventListener("change", sync);
    $("lb-ok2").addEventListener("change", sync);
    $("lb-form").addEventListener("change", function(e){ if (e.target.name === "show") $("lb-name").classList.toggle("hidden", e.target.value !== "name"); });
    $("lb-form").addEventListener("submit", function(e){
      e.preventDefault();
      var file = $("lb-file").files[0];
      var title = $("lb-title").value.trim();
      var show = document.querySelector('#lb-form input[name="show"]:checked').value;
      if (!file) return say("Choose a file to share.");
      if (file.size > MAX) return say("Files can be up to 20 MB. That one is " + (file.size / 1048576).toFixed(1) + " MB.");
      if (!title) return say("Give the file a title.");
      if (show === "name" && !$("lb-name").value.trim()) return say("Type the name to show, or choose Anonymous.");
      var u = picked("lb-units"), t = picked("lb-topics");
      if (!u.length) return say("Pick at least one unit (or All units).");
      if (!t.length) return say("Pick at least one topic (or All topics).");
      var fd = new FormData();
      fd.append("lookup", lookup);
      fd.append("file", file);
      fd.append("title", title);
      fd.append("description", $("lb-desc").value.trim());
      fd.append("units", JSON.stringify(u));
      fd.append("topics", JSON.stringify(t));
      fd.append("show", show);
      fd.append("name", $("lb-name").value.trim());
      fd.append("noPatientInfo", $("lb-ok1").checked ? "yes" : "");
      fd.append("noExamContent", $("lb-ok2").checked ? "yes" : "");
      var btn = $("lb-upload");
      btn.disabled = true;
      btn.textContent = "Sharing…";
      say("");
      fetch(T.ROOT + "api/library/upload", {method: "POST", body: fd, credentials: "same-origin"}).then(function(r){
        return r.json().catch(function(){ return {}; }).then(function(j){ if (!r.ok) throw new Error(j.error || "Upload failed (" + r.status + ")"); return j.result; });
      }).then(function(){
        $("lb-file").value = ""; $("lb-title").value = ""; $("lb-desc").value = "";
        $("lb-ok1").checked = false; $("lb-ok2").checked = false;
        btn.textContent = "Share file";
        sync();
        say("Shared! It's in the list now.");
        return refresh();
      }, function(err){
        btn.textContent = "Share file";
        sync();
        say(err.message);
      });
    });
  }
  function wireList(){
    $("lb-filterbox").addEventListener("change", function(e){
      if (e.target.id === "lb-funit"){ filter.unit = e.target.value; filter.topic = ""; $("lb-filterbox").innerHTML = filtersHtml(); }
      if (e.target.id === "lb-ftopic") filter.topic = e.target.value;
      drawList();
    });
    $("lb-list").addEventListener("click", function(e){
      var card = e.target.closest(".lb-card");
      if (!card) return;
      var id = card.getAttribute("data-id");
      if (e.target.closest(".lb-download")){
        var b = e.target.closest(".lb-download");
        b.disabled = true;
        T.call("library/link", {lookup: lookup, id: id}).then(function(r){
          b.disabled = false;
          var a = document.createElement("a");
          a.href = T.ROOT + r.url.replace(/^\//, "");
          a.setAttribute("download", "");
          document.body.appendChild(a); a.click(); a.remove();
        }, function(err){ b.disabled = false; alert(err.message); refresh(); });
      }
      if (e.target.closest(".lb-delete")){
        if (!confirm("Delete this file from the Library for everyone? This can't be undone.")) return;
        T.call("library/delete", {lookup: lookup, id: id}).then(function(ok){
          if (!ok) alert("That file couldn't be deleted.");
          refresh();
        }, function(err){ alert(err.message); });
      }
    });
  }

  function page(){
    if (!T.isOn()){ location.replace("start-tracking.html"); return; }
    MyStudy.header("library");
    var host = $("ms-main");
    Promise.all([T.ensureKeys(), loadStructure()]).then(function(r){
      lookup = r[0].lookup;
      host.innerHTML = intro() +
        '<section class="ch-layout"><div class="ch-col"><h2 class="ch-eyebrow ch-listhead">Share</h2>' + formHtml() + "</div>" +
        '<div class="ch-side"><div class="lb-listhead"><h2 class="ch-eyebrow ch-listhead">Files</h2><span class="ch-meta" id="lb-count"></span></div>' +
        '<div id="lb-filterbox">' + filtersHtml() + '</div><div class="lb-list" id="lb-list"><p class="tp-hint">Loading&hellip;</p></div></div></section>';
      wireForm();
      wireList();
      refresh();
    }, function(err){
      host.innerHTML = '<p class="tp-note">Couldn\'t load the Library. Refresh the page to try again.</p>';
      if (window.console) console.error(err);
    });
  }

  return {page: page};
})();
