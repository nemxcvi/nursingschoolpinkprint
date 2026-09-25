/* Unit page tabs: Flashcards / Quizzes / Study guides narrow the page to that kind of content
   for this unit. Clicking the active tab again shows everything. Home is a plain link. */
(function(){
  var KINDS = {flashcards:"flashcards", quizzes:"quiz", studyguides:"studyguide"};
  var LABELS = {flashcards:"flashcards", quizzes:"quizzes", studyguides:"study guides"};
  var tabs = Array.prototype.slice.call(document.querySelectorAll("[data-filter]"));
  if (!tabs.length) return;

  var start = new URLSearchParams(location.search).get("type");
  var current = KINDS[start] ? start : null;

  function apply(){
    var want = current ? KINDS[current] : null;
    tabs.forEach(function(t){ t.classList.toggle("active", t.getAttribute("data-filter") === current); });

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

    var p = new URLSearchParams(location.search);
    if (current) p.set("type", current); else p.delete("type");
    var qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
  }

  tabs.forEach(function(t){
    t.addEventListener("click", function(){
      var f = t.getAttribute("data-filter");
      current = current === f ? null : f;
      apply();
    });
  });

  apply();
})();
