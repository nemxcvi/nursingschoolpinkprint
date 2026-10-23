/* Library (shared resources): classmates share PDFs, images and Word files, tagged by unit and
   topic. Tracking codes only: every call sends this device's lookup ID, which the server checks.
   Units come from SITE (assets/site-data.js) and topics from each course's data files, so a new
   course (like NUR 121) shows up here once its data is added. Server side: _worker.js (Library). */
var Library = (function(){
  var T = Tracking;
  var ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.doc,.docx,application/pdf,image/jpeg,image/png,image/webp,image/heic,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  var NAME_KEY = "pinkprint-library-name";
  var MAX = 20 * 1024 * 1024;
  var TYPE_LABEL = {"application/pdf": "PDF", "image/jpeg": "JPG", "image/png": "PNG", "image/webp": "WEBP", "image/heic": "HEIC",
                    "application/msword": "Word", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word"};
  var DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  /* Preview: pictures and Word (.docx) in a pop-up, PDFs in the browser's viewer. Old .doc files can't be previewed. */
  var PREVIEW = {"application/pdf": "pdf", "image/jpeg": "img", "image/png": "img", "image/webp": "img", "image/heic": "img"};
  PREVIEW[DOCX] = "docx";
  var units = [], topicsByUnit = {}, files = [], lookup = null;
  /* Files: nothing listed until a unit (and maybe a topic) is chosen and Search is pressed.
     pick = what the menus show; filter = what was last searched ("*" = all). */
  var pick = {unit: "", topic: ""}, filter = null;

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
      '<p class="tp-lede">Notes, diagrams, handouts and links shared by classmates. Open anything here, and share your own.</p></section>' +
      '<section class="lb-rules" aria-label="Sharing rules"><h2 class="ch-eyebrow">Sharing rules</h2><ol>' +
      '<li><strong>No patient information (<abbr title="Health Insurance Portability and Accountability Act">HIPAA</abbr>).</strong> No names, dates of birth, MRNs (medical record numbers), or anything identifying.</li>' +
      "<li><strong>No test content.</strong> No exam questions or recalled test content.</li></ol></section>";
  }
  function checkList(name, items, allLabel, picked){
    var all = picked.indexOf("all") !== -1;
    return '<label class="lb-check lb-all"><input type="checkbox" name="' + name + '" value="all"' + (all ? " checked" : "") + "> " + allLabel + "</label>" +
      items.map(function(i){
        return '<label class="lb-check"><input type="checkbox" name="' + name + '" value="' + esc(i.key) + '"' +
          (!all && picked.indexOf(i.key) !== -1 ? " checked" : "") + "> " + esc(i.label) + "</label>";
      }).join("");
  }
  function formHtml(){
    var name = "";
    try { name = localStorage.getItem(NAME_KEY) || ""; } catch (e) {}
    return '<form class="ms-card lb-form" id="lb-form" novalidate><h2 class="ms-h2 ch-h2">Share a file or link</h2>' +
      '<p class="tp-hint lb-pitch" id="lb-pitch">Notes, diagrams, handouts or helpful web pages for the class: PDF, images or Word up to 20 MB, or a link.</p>' +
      '<button type="button" class="ms-btn is-primary" id="lb-open" aria-expanded="false" aria-controls="lb-fields">+ Share a file or link</button>' +
      '<div class="lb-fields hidden" id="lb-fields">' +
      '<fieldset class="ch-field"><legend>Share a</legend><div class="lb-show lb-kind">' +
      '<label class="lb-check"><input type="radio" name="kind" value="file" checked> File</label>' +
      '<label class="lb-check"><input type="radio" name="kind" value="link"> Link</label></div></fieldset>' +
      '<div class="ch-field" id="lb-filefield"><label for="lb-file">File</label><input type="file" id="lb-file" class="lb-file" accept="' + ACCEPT + '">' +
      '<span class="tp-hint">PDF, JPG, PNG, WEBP, HEIC or Word, up to 20 MB.</span></div>' +
      '<div class="ch-field hidden" id="lb-urlfield"><label for="lb-url">Web address</label><input type="url" id="lb-url" class="tp-input" maxlength="1000" placeholder="https://" autocomplete="off" inputmode="url">' +
      '<span class="tp-hint">A video, article or practice site. Paste the full address.</span></div>' +
      '<div class="ch-field"><label for="lb-title">Title</label><input id="lb-title" class="tp-input" maxlength="120" required></div>' +
      '<div class="ch-field"><label for="lb-desc">Short description (optional)</label><textarea id="lb-desc" class="tp-input lb-desc" maxlength="500" rows="2"></textarea></div>' +
      '<fieldset class="ch-field"><legend>Units</legend><div class="lb-checks" id="lb-units">' + checkList("unit", units, "All units", ["all"]) + "</div></fieldset>" +
      '<fieldset class="ch-field"><legend>Topics</legend><div class="lb-checks" id="lb-topics"></div></fieldset>' +
      '<fieldset class="ch-field"><legend>Shown as</legend><div class="lb-show">' +
      '<label class="lb-check"><input type="radio" name="show" value="name" checked> Show a name</label>' +
      '<label class="lb-check"><input type="radio" name="show" value="anon"> Anonymous</label></div>' +
      '<input id="lb-name" class="tp-input" maxlength="40" aria-label="Name to show" placeholder="Your name or nickname" value="' + esc(name) + '"></fieldset>' +
      '<div class="lb-confirm"><label class="lb-check"><input type="checkbox" id="lb-ok1"> <span>This <span class="lb-kindword">file</span> contains no patient information (HIPAA): no names, dates of birth, MRNs, or anything identifying.</span></label>' +
      '<label class="lb-check"><input type="checkbox" id="lb-ok2"> <span>This <span class="lb-kindword">file</span> contains no test content: no exam questions or recalled test content.</span></label></div>' +
      '<button type="submit" class="ms-btn is-primary is-big" id="lb-upload" disabled>Share file</button>' +
      '<button type="button" class="lb-cancel" id="lb-close">Cancel</button></div>' +
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
  /* "All" and specific picks swap over by themselves: ticking a unit unticks All units, ticking
     All units unticks the rest, and unticking the last one goes back to All */
  function wireChecks(boxId, after){
    $(boxId).addEventListener("change", function(e){
      var box = $(boxId), all = box.querySelector('input[value="all"]');
      if (e.target === all){
        if (all.checked) [].forEach.call(box.querySelectorAll('input:not([value="all"])'), function(i){ i.checked = false; });
      } else if (e.target.checked) all.checked = false;
      if (!box.querySelector("input:checked")) all.checked = true;
      if (after) after();
    });
  }

  function filtersHtml(){
    var topics = pick.unit && pick.unit !== "*" ? topicsByUnit[pick.unit] || [] : [];
    var opt = function(v, label, cur){ return '<option value="' + esc(v) + '"' + (cur === v ? " selected" : "") + ">" + esc(label) + "</option>"; };
    return '<div class="ms-filters lb-filters"><label><span class="tp-label">Unit</span><select id="lb-funit">' +
      '<option value=""' + (pick.unit ? "" : " selected") + ' disabled hidden>Choose a unit</option>' + opt("*", "All units", pick.unit) +
      units.map(function(u){ return opt(u.key, u.label, pick.unit); }).join("") + "</select></label>" +
      '<label><span class="tp-label">Topic</span><select id="lb-ftopic"' + (topics.length ? "" : " disabled") + ">" +
      '<option value=""' + (pick.topic ? "" : " selected") + ' disabled hidden>Choose a topic</option>' + opt("*", "All topics", pick.topic) +
      topics.map(function(t){ return opt(t.key, t.label, pick.topic); }).join("") + "</select></label>" +
      '<button type="button" class="ms-btn is-primary lb-search" id="lb-search"' + (pick.unit ? "" : " disabled") + ">Search</button></div>";
  }
  /* Files tagged All show under every filter */
  function matches(f){
    if (filter.unit !== "*" && f.units.indexOf("all") === -1 && f.units.indexOf(filter.unit) === -1) return false;
    if (filter.topic && filter.topic !== "*" && f.topics.indexOf("all") === -1 && f.topics.indexOf(filter.topic) === -1) return false;
    return true;
  }
  function tags(f){
    var u = f.units.indexOf("all") !== -1 ? ["All units"] : f.units.map(unitLabel);
    var t = f.topics.indexOf("all") !== -1 ? ["All topics"] : f.topics.map(topicLabel);
    return u.concat(t).map(function(x){ return '<span class="lb-tag">' + esc(x) + "</span>"; }).join("");
  }
  /* Links open in a new tab and never tell the other site where they came from */
  function safeUrl(u){ return /^https?:\/\//i.test(u || "") ? u : ""; }
  function cardHtml(f){
    var link = f.mime === "link";
    var btns = link ? (safeUrl(f.url) ? '<a class="ms-btn is-primary lb-openlink" href="' + esc(safeUrl(f.url)) + '" target="_blank" rel="noopener noreferrer nofollow">Open link ↗</a>' : "")
      : (PREVIEW[f.mime] ? '<button type="button" class="ms-btn lb-preview">Preview</button>' : "") +
        '<button type="button" class="ms-btn is-primary lb-download">Download</button><span class="lb-fname">' + esc(f.file_name) + "</span>";
    return '<article class="ms-card lb-card' + (link ? " is-link" : "") + '" data-id="' + esc(f.id) + '"><div class="lb-top"><span class="ch-eyebrow">' + (link ? "Link · " + esc(f.file_name) : esc(TYPE_LABEL[f.mime] || "File") + " · " + size(f.size)) + "</span>" +
      (f.mine ? '<button type="button" class="ms-linkbtn is-danger lb-delete">Delete</button>' : "") + "</div>" +
      '<h3 class="ms-h2 ch-h2">' + esc(f.title) + "</h3>" +
      '<span class="ch-meta">' + esc(f.name || "Anonymous") + " · " + day(f.created_at) + "</span>" +
      (f.description ? '<p class="lb-desc-text">' + esc(f.description) + "</p>" : "") +
      '<div class="lb-tags">' + tags(f) + "</div>" +
      '<div class="ch-btns">' + btns + "</div></article>";
  }
  function fileById(id){ return files.filter(function(f){ return f.id === id; })[0]; }
  function fileUrl(id, view){
    return T.call("library/link", {lookup: lookup, id: id, view: !!view}).then(function(r){ return T.ROOT + r.url.replace(/^\//, ""); });
  }
  function download(id, btn){
    if (btn) btn.disabled = true;
    fileUrl(id).then(function(url){
      if (btn) btn.disabled = false;
      var a = document.createElement("a");
      a.href = url;
      a.setAttribute("download", "");
      document.body.appendChild(a); a.click(); a.remove();
    }, function(err){ if (btn) btn.disabled = false; alert(err.message); refresh(); });
  }

  /* ---------- Preview ---------- */
  function viewer(){
    var d = $("lb-viewer");
    if (d) return d;
    d = document.createElement("dialog");
    d.id = "lb-viewer";
    d.className = "lb-viewer";
    d.setAttribute("aria-labelledby", "lb-vtitle");
    d.innerHTML = '<div class="lb-vhead"><h2 class="ms-h2 ch-h2" id="lb-vtitle"></h2>' +
      '<button type="button" class="ms-btn is-primary lb-vdownload" id="lb-vdownload">Download</button>' +
      '<button type="button" class="lb-vclose" id="lb-vclose" aria-label="Close preview">&times;</button></div>' +
      '<div class="lb-vbody" id="lb-vbody"></div>';
    document.body.appendChild(d);
    var close = function(){ if (d.close) d.close(); else d.removeAttribute("open"); $("lb-vbody").innerHTML = ""; };
    $("lb-vclose").addEventListener("click", close);
    d.addEventListener("click", function(e){ if (e.target === d) close(); });
    d.addEventListener("close", function(){ $("lb-vbody").innerHTML = ""; });
    $("lb-vdownload").addEventListener("click", function(){ download(d.getAttribute("data-id"), $("lb-vdownload")); });
    return d;
  }
  function noPreview(text){ $("lb-vbody").innerHTML = '<p class="lb-vnote">' + esc(text) + "</p>"; }
  var mammothLoad = null;
  function loadMammoth(){
    if (window.mammoth) return Promise.resolve(window.mammoth);
    if (!mammothLoad) mammothLoad = new Promise(function(res, rej){
      var sc = document.createElement("script");
      sc.src = T.ROOT + "assets/vendor/mammoth.browser.min.js?v=1";
      sc.onload = function(){ res(window.mammoth); };
      sc.onerror = function(){ mammothLoad = null; rej(new Error("Couldn't load the preview. Check your connection.")); };
      document.head.appendChild(sc);
    });
    return mammothLoad;
  }
  /* The Word file's text, in a frame that can't run scripts or load anything from the internet */
  function docFrame(html){
    var f = document.createElement("iframe");
    f.className = "lb-vdoc";
    f.title = "File preview";
    f.setAttribute("sandbox", "");
    f.srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'">' +
      "<style>body{margin:0;padding:24px;font:15px/1.55 system-ui,-apple-system,sans-serif;color:#2b1a22;background:#fff;overflow-wrap:anywhere;}" +
      "img{max-width:100%;height:auto;}table{border-collapse:collapse;max-width:100%;}td,th{border:1px solid #ccc;padding:4px 8px;vertical-align:top;}" +
      "h1,h2,h3{line-height:1.25;}a{color:inherit;pointer-events:none;}</style></head><body>" + html + "</body></html>";
    return f;
  }
  function preview(f){
    if (!f) return;
    var kind = PREVIEW[f.mime];
    if (kind === "pdf"){
      /* Opened right away so the browser doesn't block the new tab, then pointed at the file */
      var w = window.open("", "_blank");
      fileUrl(f.id, true).then(function(url){
        if (w){ try { w.opener = null; } catch (e) {} w.location.href = url; }
        else location.href = url;
      }, function(err){ if (w) w.close(); alert(err.message); refresh(); });
      return;
    }
    var d = viewer();
    d.setAttribute("data-id", f.id);
    $("lb-vtitle").textContent = f.title;
    $("lb-vbody").innerHTML = '<p class="lb-vnote">Loading&hellip;</p>';
    if (d.showModal){ if (!d.open) d.showModal(); } else d.setAttribute("open", "");
    if (kind === "img"){
      fileUrl(f.id, true).then(function(url){
        var img = new Image();
        img.className = "lb-vimg";
        img.alt = f.title;
        img.onload = function(){ $("lb-vbody").innerHTML = ""; $("lb-vbody").appendChild(img); };
        img.onerror = function(){
          noPreview(f.mime === "image/heic" ? "This browser can't show HEIC photos (Safari on iPhone, iPad and Mac can). Download it to open." : "Couldn't show this file. Download it to open.");
        };
        img.src = url;
      }, function(err){ noPreview(err.message); });
      return;
    }
    Promise.all([fileUrl(f.id), loadMammoth()]).then(function(r){
      return fetch(r[0], {credentials: "same-origin"}).then(function(res){
        if (!res.ok) throw new Error("Couldn't open this file. Download it instead.");
        return res.arrayBuffer();
      }).then(function(buf){ return r[1].convertToHtml({arrayBuffer: buf}); });
    }).then(function(out){
      if (!$("lb-vbody") || d.getAttribute("data-id") !== f.id) return;
      if (!out.value.replace(/<[^>]*>/g, "").trim() && out.value.indexOf("<img") === -1) return noPreview("This file looks empty in the preview. Download it to open.");
      $("lb-vbody").innerHTML = '<p class="lb-vnote lb-vhint">Text preview: the layout may look different in Word.</p>';
      $("lb-vbody").appendChild(docFrame(out.value));
    }).catch(function(err){ noPreview(err && err.message && !/zip|central directory|docx/i.test(err.message) ? err.message : "Couldn't preview this file. Download it to open."); });
  }

  function drawList(){
    var total = files.length + (files.length === 1 ? " file" : " files");
    if (!filter){
      $("lb-list").innerHTML = '<p class="ch-note lb-start">' + (files.length ? "Choose a unit and a topic, then Search." : "No files yet. Share the first one!") + "</p>";
      $("lb-count").textContent = files.length ? total + " shared" : "";
      return;
    }
    var shown = files.filter(matches);
    $("lb-list").innerHTML = shown.length ? shown.map(cardHtml).join("")
      : '<p class="ch-note">' + (files.length ? "No files for this unit and topic yet." : "No files yet. Share the first one!") + "</p>";
    $("lb-count").textContent = shown.length + " of " + total;
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
    /* File or Link: swaps the file picker for a web address box */
    var kind = function(){ return document.querySelector('#lb-form input[name="kind"]:checked').value; };
    var setKind = function(){
      var link = kind() === "link";
      $("lb-filefield").classList.toggle("hidden", link);
      $("lb-urlfield").classList.toggle("hidden", !link);
      [].forEach.call(document.querySelectorAll(".lb-kindword"), function(w){ w.textContent = link ? "link" : "file"; });
      $("lb-upload").textContent = link ? "Share link" : "Share file";
    };
    [].forEach.call(document.querySelectorAll('#lb-form input[name="kind"]'), function(r){ r.addEventListener("change", function(){ say(""); setKind(); }); });
    $("lb-ok1").addEventListener("change", sync);
    $("lb-ok2").addEventListener("change", sync);
    var open = function(on){
      $("lb-fields").classList.toggle("hidden", !on);
      $("lb-open").classList.toggle("hidden", on);
      $("lb-pitch").classList.toggle("hidden", on);
      $("lb-open").setAttribute("aria-expanded", on ? "true" : "false");
      if (on){ say(""); $("lb-file").focus(); } else $("lb-open").focus();
    };
    $("lb-open").addEventListener("click", function(){ open(true); });
    $("lb-close").addEventListener("click", function(){ open(false); });
    $("lb-form").addEventListener("change", function(e){ if (e.target.name === "show") $("lb-name").classList.toggle("hidden", e.target.value !== "name"); });
    $("lb-form").addEventListener("submit", function(e){
      e.preventDefault();
      var isLink = kind() === "link";
      var file = $("lb-file").files[0], url = $("lb-url").value.trim();
      var title = $("lb-title").value.trim();
      var show = document.querySelector('#lb-form input[name="show"]:checked').value;
      if (isLink && !/^https?:\/\/\S+\.\S+/i.test(url)) return say("Paste a full web address starting with https://");
      if (!isLink && !file) return say("Choose a file to share.");
      if (!isLink && file.size > MAX) return say("Files can be up to 20 MB. That one is " + (file.size / 1048576).toFixed(1) + " MB.");
      if (!title) return say(isLink ? "Give the link a title." : "Give the file a title.");
      if (show === "name" && !$("lb-name").value.trim()) return say("Type the name to show, or choose Anonymous.");
      var u = picked("lb-units"), t = picked("lb-topics");
      if (!u.length) return say("Pick at least one unit (or All units).");
      if (!t.length) return say("Pick at least one topic (or All topics).");
      if (show === "name") try { localStorage.setItem(NAME_KEY, $("lb-name").value.trim()); } catch (e) {}
      if (isLink) return shareLink({lookup: lookup, url: url, title: title, description: $("lb-desc").value.trim(), units: u, topics: t,
        show: show, name: $("lb-name").value.trim(), noPatientInfo: $("lb-ok1").checked ? "yes" : "", noExamContent: $("lb-ok2").checked ? "yes" : ""});
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
      }).then(shared, failed);
    });
    function shared(){
      $("lb-file").value = ""; $("lb-url").value = ""; $("lb-title").value = ""; $("lb-desc").value = "";
      $("lb-ok1").checked = false; $("lb-ok2").checked = false;
      setKind();
      sync();
      open(false);
      say(filter ? "Shared! It's in the list now." : "Shared! Choose its unit and Search to see it in the list.");
      return refresh();
    }
    function failed(err){
      setKind();
      sync();
      say(err.message);
    }
    function shareLink(body){
      var btn = $("lb-upload");
      btn.disabled = true;
      btn.textContent = "Sharing…";
      say("");
      T.call("library/addlink", body).then(shared, failed);
    }
  }
  function wireList(){
    $("lb-filterbox").addEventListener("change", function(e){
      if (e.target.id === "lb-funit"){ pick.unit = e.target.value; pick.topic = ""; $("lb-filterbox").innerHTML = filtersHtml(); }
      if (e.target.id === "lb-ftopic") pick.topic = e.target.value;
    });
    $("lb-filterbox").addEventListener("click", function(e){
      if (!e.target.closest("#lb-search") || !pick.unit) return;
      filter = {unit: pick.unit, topic: pick.topic};
      drawList();
    });
    $("lb-list").addEventListener("click", function(e){
      var card = e.target.closest(".lb-card");
      if (!card) return;
      var id = card.getAttribute("data-id");
      if (e.target.closest(".lb-openlink")) T.call("library/opened", {lookup: lookup, id: id}).catch(function(){});
      if (e.target.closest(".lb-download")) download(id, e.target.closest(".lb-download"));
      if (e.target.closest(".lb-preview")) preview(fileById(id));
      if (e.target.closest(".lb-delete")){
        if (!confirm("Delete this from the Library for everyone? This can't be undone.")) return;
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
