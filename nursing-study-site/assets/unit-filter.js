/* Unit page tabs: Flashcards / Quizzes / Study guides narrow the page to that kind of content
   for this unit, shown as the same one-action rows the library uses (index.html ?type=...).
   All (or clicking the active tab again) shows everything in the unit. */
(function(){
  var KINDS = {flashcards:"flashcards", quizzes:"quiz", studyguides:"studyguide"};
  var LABELS = {flashcards:"flashcards", quizzes:"quizzes", studyguides:"study guides"};
  var tabs = Array.prototype.slice.call(document.querySelectorAll("[data-filter]"));
  if (!tabs.length) return;

  var start = new URLSearchParams(location.search).get("type");
  var current = KINDS[start] ? start : null;

  var header = document.getElementById("site-header");
  var unitCode = header && header.getAttribute("data-unit");
  var wrap = document.querySelector(".ledger-wrap");
  /* The unit's own content: everything after the title, swapped out for the library view */
  var own = wrap ? Array.prototype.filter.call(wrap.children, function(el){
    return !el.classList.contains("ledger-eyebrow") && !el.classList.contains("ledger-h1");
  }) : [];
  var lib = document.createElement("div");
  lib.hidden = true;
  if (wrap) wrap.appendChild(lib);

  function esc(t){
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* Same markup as libraryRow() in index.html; widget hrefs are site-root relative */
  function libraryRow(w, i, t){
    return "<a class='ledger-row' href='../" + w.href + "'>" +
      "<span class='lr-num'>" + (i < 9 ? "0" : "") + (i + 1) + "</span>" +
      "<span><span class='lr-title'>" + esc(SITE.shortTitle(w)) + "</span><span class='lr-meta'>" + esc(SITE.metaLine(w)) + "</span></span>" +
      "<span class='lr-actions'><span class='lbtn btn-primary'>" + t.action + "</span></span></a>";
  }

  function renderLibrary(){
    var t = SITE.getType(current);
    var items = SITE.widgetsFor(SITE.currentSheet, unitCode, t.key);
    var html = "";
    /* The unit's Mix all quiz, styled like the library's Mix all pill */
    var mix = t.key === "quizzes" && wrap.querySelector("[data-kind='quiz'] > a.ledger-feature");
    if (mix){
      var sub = mix.querySelector(".lf-sub");
      html += "<a class='ledger-feature is-pill' href='" + mix.getAttribute("href") + "'><i class='ti ti-arrows-shuffle' aria-hidden='true'></i>" +
        "<span><span class='lf-title'>Mix all</span><span class='lf-sub'>" + esc(sub ? sub.textContent : "") + "</span></span>" +
        "<span class='lbtn btn-primary'>Start &rarr;</span></a>";
    }
    if (items.length) html += "<div class='ledger'>" + items.map(function(w, i){ return libraryRow(w, i, t); }).join("") + "</div>";
    else html += "<div class='ledger ledger-empty'><p>No " + LABELS[current] + " for this unit yet.</p></div>";
    lib.innerHTML = html;
  }

  function apply(){
    var want = current ? KINDS[current] : null;
    tabs.forEach(function(t){ t.classList.toggle("active", t.getAttribute("data-filter") === (current || "all")); });

    /* Filtered: library-style list built from SITE data */
    var useLib = !!(current && wrap && unitCode && window.SITE);
    own.forEach(function(el){
      if (!el.hasAttribute("data-was-hidden")) el.setAttribute("data-was-hidden", el.hidden ? "1" : "0");
      if (useLib) el.hidden = true;
    });
    lib.hidden = !useLib;
    if (useLib){
      renderLibrary();
      syncUrl();
      return;
    }
    own.forEach(function(el){ el.hidden = el.getAttribute("data-was-hidden") === "1"; });

    /* Topic rows: keep rows that have this kind, and only that kind's button in each */
    var rows = document.querySelectorAll("#widgetlist .ledger-row");
    var last = null, shownRows = 0;
    Array.prototype.forEach.call(rows, function(row){
      var show = !want || row.getAttribute("data-types").split(" ").indexOf(want) !== -1;
      row.hidden = !show;
      row.classList.remove("is-last");
      if (show){ last = row; shownRows++; }
      row.querySelectorAll(".lbtn[data-kind]").forEach(function(b){
        b.hidden = !!want && b.getAttribute("data-kind") !== want;
        /* when a row is down to one button, it's the main action: show it solid */
        if (!b.hasAttribute("data-was-secondary")) b.setAttribute("data-was-secondary", b.classList.contains("btn-secondary") ? "1" : "0");
        var secondary = !want && b.getAttribute("data-was-secondary") === "1";
        b.classList.toggle("btn-secondary", secondary);
        b.classList.toggle("btn-primary", !secondary);
      });
    });
    /* no divider under the last visible row */
    if (last) last.classList.add("is-last");
    var list = document.getElementById("widgetlist");
    if (list) list.hidden = rows.length > 0 && shownRows === 0;

    /* Study guide link and the Mix all block */
    var shown = shownRows;
    document.querySelectorAll(".ledger-wrap > [data-kind]").forEach(function(el){
      var show = !want || el.getAttribute("data-kind") === want;
      el.hidden = !show;
      if (show) shown++;
    });

    var empty = document.getElementById("unit-filter-empty");
    if (empty){
      empty.hidden = shown > 0;
      empty.querySelector("p").textContent = "No " + (LABELS[current] || "content") + " for this unit yet.";
    }

    syncUrl();
  }

  function syncUrl(){
    var p = new URLSearchParams(location.search);
    if (current) p.set("type", current); else p.delete("type");
    var qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
  }

  tabs.forEach(function(t){
    t.addEventListener("click", function(){
      var f = t.getAttribute("data-filter");
      current = f === "all" || current === f ? null : f;
      apply();
    });
  });

  apply();
})();
