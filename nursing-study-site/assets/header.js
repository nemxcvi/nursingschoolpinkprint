/* Shared site header. Each page has one placeholder:
     <div id="site-header" data-mode="full|compact" data-sheet="nur114" data-unit="U-02" data-type="flashcards"></div>
   followed by site-data.js and this script. "full" is for browsing pages (home, unit pages),
   "compact" is the slim sticky bar used inside a flashcard deck, quiz or study guide. */
(function(){
  var ROOT = new URL("../", document.currentScript.src).href;
  var host = document.getElementById("site-header");
  if (!host) return;

  var mode = host.getAttribute("data-mode") === "compact" ? "compact" : "full";
  var sheet = SITE.getSheet(host.getAttribute("data-sheet") || SITE.currentSheet);
  var unit = host.getAttribute("data-unit") ? SITE.getUnit(sheet.id, host.getAttribute("data-unit")) : null;
  var pageType = host.getAttribute("data-type") ? SITE.getType(host.getAttribute("data-type")) : null;

  function esc(s){
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function isDark(){ return document.documentElement.getAttribute("data-theme") === "dark"; }
  function isBlue(){ return document.documentElement.getAttribute("data-palette") === "blue"; }

  var ARROW = "<span class='nav-arrow' aria-hidden='true'>&rarr;</span>";
  var DRAFT = "<span class='nav-tag'>In draft</span>";

  function themeBtn(extra){
    return "<button class='iconbtn" + (extra || "") + "' onclick='toggleTheme()' aria-label='Toggle dark mode'>" +
      "<i id='themeicon' class='ti " + (isDark() ? "ti-sun" : "ti-moon") + "' aria-hidden='true'></i></button>";
  }
  var menuBtn = "<button class='navbtn' id='navbtn' aria-label='Menu' aria-expanded='false' aria-controls='sitenav'>" +
    "<span></span><span></span><span></span></button>";

  /* ---------- Menu panel ---------- */
  function row(href, inner, cur, cls){
    return "<a class='nav-row" + (cls ? " " + cls : "") + "' href='" + href + "' data-cur='" + cur + "'>" + inner + ARROW + "</a>";
  }
  function offRow(inner, tag, cls){
    return "<span class='nav-row is-off" + (cls ? " " + cls : "") + "' aria-disabled='true'>" + inner + tag + "</span>";
  }
  function unitInner(u){
    return "<span class='nav-code'>" + u.code + "</span><span class='nav-name'>" + esc(u.name) + "</span>";
  }
  function section(key, label, body, sub){
    return "<div class='nav-sec" + (sub ? " nav-subsec" : "") + "' data-sec='" + key + "'>" +
      "<button class='nav-row nav-sechead" + (sub ? " nav-sub" : "") + "' aria-expanded='false' aria-controls='navsec-" + key + "'>" +
      "<span class='nav-name'>" + label + "</span><span class='nav-caret' aria-hidden='true'></span></button>" +
      "<div class='nav-secbody' id='navsec-" + key + "' hidden>" + body + "</div></div>";
  }

  /* Each sheet with content is its own dropdown of units; future sheets are dimmed */
  function sheetsBody(){
    return SITE.sheets.map(function(s){
      var name = "Sheet " + s.num + " &mdash; " + s.code;
      if (SITE.widgetsFor(s.id).length === 0) return offRow("<span class='nav-name'>" + name + "</span>", DRAFT, "nav-sub");
      return section("sheet-" + s.id, name, SITE.unitsWithContent(s.id).map(function(u){
        return row(ROOT + u.slug, unitInner(u), "unit:" + s.id + ":" + u.code, "nav-sub2");
      }).join(""), true);
    }).join("");
  }

  function typeBody(t){
    var html = row(ROOT + "?type=" + t.key, "<span class='nav-name'>All units</span>", "type:" + t.key + ":all", "nav-sub");
    /* Only units that have this type of content */
    SITE.getSheet(sheet.id).units.forEach(function(u){
      if (SITE.widgetsFor(sheet.id, u.code, t.key).length){
        html += row(ROOT + "?type=" + t.key + "&unit=" + u.code, unitInner(u), "type:" + t.key + ":" + u.code, "nav-sub");
      }
    });
    return html;
  }

  var panelHtml =
    "<div class='nav-backdrop' id='navbackdrop' hidden></div>" +
    "<div class='navpanel' id='sitenav' role='navigation' aria-label='Site menu' hidden>" +
      "<div class='nav-search'><i class='ti ti-search' aria-hidden='true'></i>" +
        "<input type='search' id='navsearch' placeholder='Search' enterkeyhint='search' aria-label='Search flashcards, quizzes and study guides' autocomplete='off'></div>" +
      "<div class='nav-results' id='navresults' hidden></div>" +
      row(ROOT, "<span class='nav-name'>Home</span>", "home") +
      section("sheets", "Semester sheets", sheetsBody()) +
      SITE.types.map(function(t){ return section(t.key, t.label, typeBody(t)); }).join("") +
    "</div>";

  /* ---------- Header markup ---------- */
  if (mode === "full"){
    /* Always a link: on the home page it clears a library filter (?type=...) */
    var brand = "<a class='pp-header-home' href='" + ROOT + "'>Nursing School</a> ";
    host.className = "pp-header site-header";
    host.innerHTML =
      "<div class='hdr-left'><div class='pp-header-label'>Sheet " + sheet.num + " &mdash; " + sheet.code + "</div><div class='hdr-navrow'>" + menuBtn + "</div></div>" +
      "<div class='pp-header-title'>" + brand + "<span class='accent'><span class='palette-word-wrap'>" +
        "<button class='palette-word' id='paletteWord' onclick='togglePalette()' aria-label='Switch to Blueprint palette' title='Switch to Blueprint'>" + (isBlue() ? "Blue" : "Pink") + "</button>" +
        "<span class='palette-hint' id='paletteHint' aria-hidden='true'>switch to blueprint</span></span>print</span></div>" +
      "<div class='hdr-right'>" + themeBtn() + "</div>" +
      panelHtml;
  } else {
    var back = unit ? ROOT + unit.slug : ROOT;
    try {
      if (document.referrer){
        var ref = new URL(document.referrer);
        if (ref.origin === location.origin && ref.href.split("#")[0] !== location.href.split("#")[0]) back = ref.href;
      }
    } catch (e){}
    var typeName = pageType ? pageType.one : "";
    var labelRest = unit ? " &middot; " + esc(unit.name) + (typeName ? " &middot; " + typeName : "") : "";
    var labelCode = unit ? unit.code : "All units" + (pageType ? " &middot; " + pageType.label : "");
    host.className = "cbar site-header";
    host.innerHTML =
      "<div class='cbar-inner'>" +
        "<div class='cbar-left'>" + menuBtn + "<span class='cbar-div' aria-hidden='true'></span>" +
          "<a class='cbar-back' href='" + esc(back) + "'><i class='ti ti-arrow-left' aria-hidden='true'></i> Back</a></div>" +
        "<div class='cbar-label'><span class='cbar-code'>" + labelCode + "</span><span class='cbar-rest'>" + labelRest + "</span></div>" +
        "<div class='cbar-right'>" + themeBtn(" iconbtn-sm") + "</div>" +
        panelHtml +
      "</div>";
  }

  /* ---------- Behavior ---------- */
  var btn = document.getElementById("navbtn");
  var panel = document.getElementById("sitenav");
  var input = document.getElementById("navsearch");
  var results = document.getElementById("navresults");
  var backdrop = document.getElementById("navbackdrop");
  var anchor = panel.parentNode;
  var secs = Array.prototype.slice.call(panel.querySelectorAll(".nav-sec"));
  var topSecs = secs.filter(function(sec){ return !sec.classList.contains("nav-subsec"); });
  var closeTimer = null;
  var REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)");

  function setSec(sec, open, animate){
    var head = sec.querySelector(":scope > .nav-sechead");
    var body = sec.querySelector(":scope > .nav-secbody");
    head.setAttribute("aria-expanded", open ? "true" : "false");
    sec.classList.toggle("is-open", open);
    if (!animate || REDUCE.matches){
      body.style.height = open ? "auto" : "0px";
      body.hidden = !open;
      return;
    }
    if (open){
      body.hidden = false;
      body.style.height = "0px";
      var h = body.scrollHeight;
      requestAnimationFrame(function(){ body.style.height = h + "px"; });
    } else {
      body.style.height = body.scrollHeight + "px";
      body.offsetHeight;
      body.style.height = "0px";
    }
  }
  secs.forEach(function(sec){
    var body = sec.querySelector(":scope > .nav-secbody");
    body.addEventListener("transitionend", function(e){
      if (e.target !== body || e.propertyName !== "height") return;
      if (sec.classList.contains("is-open")) body.style.height = "auto";
      else body.hidden = true;
    });
    sec.querySelector(":scope > .nav-sechead").addEventListener("click", function(){
      var opening = !sec.classList.contains("is-open");
      /* One open at a time among sections at the same level */
      Array.prototype.forEach.call(sec.parentNode.children, function(other){
        if (other !== sec && other.classList.contains("nav-sec") && other.classList.contains("is-open")) setSec(other, false, true);
      });
      setSec(sec, opening, true);
    });
  });

  /* Which section starts open and which row is the current page */
  function currentState(){
    if (mode === "compact"){
      var key = pageType ? pageType.key : null;
      return {sec:key, cur: key ? "type:" + key + ":" + (unit ? unit.code : "all") : null};
    }
    if (unit) return {sec:"sheets", cur:"unit:" + sheet.id + ":" + unit.code};
    var p = new URLSearchParams(location.search);
    var t = SITE.getType(p.get("type") || "");
    if (t) return {sec:t.key, cur:"type:" + t.key + ":" + (p.get("unit") || "all")};
    return {sec:null, cur:"home"};
  }
  function applyState(){
    var st = currentState();
    /* Sheet dropdowns always start closed */
    secs.forEach(function(sec){ setSec(sec, topSecs.indexOf(sec) !== -1 && sec.getAttribute("data-sec") === st.sec, false); });
    panel.querySelectorAll("[data-cur]").forEach(function(a){
      var on = a.getAttribute("data-cur") === st.cur;
      a.classList.toggle("is-current", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    panel.querySelectorAll(".nav-subsec").forEach(function(sub){
      sub.classList.toggle("has-current", !!sub.querySelector(".is-current"));
    });
  }

  function position(){
    var a = anchor.getBoundingClientRect();
    var b = btn.getBoundingClientRect();
    panel.style.top = (b.bottom - a.top + 8) + "px";
    if (window.innerWidth > 600) panel.style.left = (b.left - a.left) + "px";
    else panel.style.left = "";
    panel.style.maxHeight = Math.max(200, window.innerHeight - b.bottom - 20) + "px";
  }
  function isOpen(){ return btn.getAttribute("aria-expanded") === "true"; }
  function openNav(){
    clearTimeout(closeTimer);
    applyState();
    backdrop.hidden = false;
    panel.hidden = false;
    position();
    panel.offsetHeight;
    panel.classList.add("is-open");
    btn.setAttribute("aria-expanded", "true");
    input.focus({preventScroll:true});
  }
  function closeNav(returnFocus){
    if (!isOpen()) return;
    panel.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
    backdrop.hidden = true;
    closeTimer = setTimeout(function(){ panel.hidden = true; }, 200);
    if (returnFocus) btn.focus();
  }

  btn.addEventListener("click", function(){ isOpen() ? closeNav(false) : openNav(); });
  /* While open, an invisible layer covers the page: a click outside only closes the menu */
  backdrop.addEventListener("click", function(e){ e.preventDefault(); closeNav(false); });
  document.addEventListener("keydown", function(e){
    if (!isOpen()) return;
    if (e.key === "Escape"){ e.preventDefault(); closeNav(true); return; }
    if (e.key !== "Tab") return;
    /* Keep Tab inside the menu button + panel while the menu is open */
    var items = [btn].concat(Array.prototype.filter.call(panel.querySelectorAll("a[href], button, input"), function(el){
      return el.offsetParent !== null;
    }));
    var i = items.indexOf(document.activeElement);
    if (i === -1 || (!e.shiftKey && i === items.length - 1) || (e.shiftKey && i === 0)){
      e.preventDefault();
      items[e.shiftKey ? items.length - 1 : 0].focus();
    }
  });
  panel.addEventListener("click", function(e){
    if (e.target.closest("a[href]")) closeNav(false);
  });
  window.addEventListener("resize", function(){ if (isOpen()) position(); });

  /* Search: same SITE.search the home page uses; runs on Enter, clearing the box resets */
  function runSearch(){
    var q = input.value.trim();
    if (!q){ results.hidden = true; results.innerHTML = ""; return; }
    var items = SITE.search(q);
    results.innerHTML = items.length ? items.map(function(w){
      var t = SITE.getType(w.type);
      return "<a class='nav-row nav-result' href='" + ROOT + w.href + "'><span class='nav-rtitle'>" + esc(w.title) + "</span>" +
        "<span class='nav-rsub'>" + SITE.unitLabel(w) + " &middot; " + t.one + "</span></a>";
    }).join("") : "<p class='nav-empty'>No matches.</p>";
    results.hidden = false;
  }
  input.addEventListener("keydown", function(e){ if (e.key === "Enter"){ e.preventDefault(); runSearch(); } });
  input.addEventListener("input", function(){ if (!input.value) runSearch(); });
})();
