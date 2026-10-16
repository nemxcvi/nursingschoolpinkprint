/* Pieces shared by the Start tracking and Settings pages. Storage and code creation stay in
   js/tracking.js; this file only draws controls. */
var TrackingUI = (function(){
  var DICE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><rect x="3" y="3" width="18" height="18"/><circle cx="8" cy="8" r="1.25" fill="currentColor"/><circle cx="16" cy="8" r="1.25" fill="currentColor"/><circle cx="12" cy="12" r="1.25" fill="currentColor"/><circle cx="8" cy="16" r="1.25" fill="currentColor"/><circle cx="16" cy="16" r="1.25" fill="currentColor"/></svg>';

  function el(tag, cls, text){
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* Weekly goal: questions per week (25/50/100/150) or study days per week (2/3/4/5), as two
     labelled rows of joined buttons. One tap picks the goal (onChange gets it right away). */
  function goalPicker(host, goal, onChange){
    var state = {type: goal.type, value: goal.value};
    host.innerHTML = "";
    var grid = el("div", "tp-goalgrid");
    grid.setAttribute("role", "radiogroup");
    grid.setAttribute("aria-label", "Weekly goal");
    [["questions", "Questions a week"], ["days", "Study days a week"]].forEach(function(t){
      var row = el("div", "tp-goalrow");
      row.appendChild(el("span", "tp-goallabel", t[1]));
      var seg = el("div", "tp-seg");
      Tracking.GOALS[t[0]].forEach(function(v){
        var b = el("button", "", String(v));
        b.type = "button";
        b.setAttribute("role", "radio");
        b.setAttribute("data-type", t[0]);
        b.setAttribute("data-value", v);
        b.setAttribute("aria-label", Tracking.goalLabel({type: t[0], value: v}));
        b.addEventListener("click", function(){ state = {type: t[0], value: v}; sync(); onChange({type: state.type, value: state.value}); });
        seg.appendChild(b);
      });
      row.appendChild(seg);
      grid.appendChild(row);
    });
    host.appendChild(grid);
    function sync(){
      grid.querySelectorAll("button").forEach(function(b){
        var on = b.getAttribute("data-type") === state.type && +b.getAttribute("data-value") === state.value;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-checked", on ? "true" : "false");
      });
    }
    sync();
    onChange({type: state.type, value: state.value});
  }

  /* Email it to myself / Save to password manager / Print QR code */
  function wireBackups(btns, getCode, getNickname){
    if (btns.email) btns.email.addEventListener("click", function(){ location.href = Tracking.mailtoHref(getCode()); });
    if (btns.manager) btns.manager.addEventListener("click", function(){ Tracking.saveToPasswordManager(getCode(), getNickname()); });
    if (btns.print) btns.print.addEventListener("click", function(){ window.open(Tracking.printUrl(getCode()), "_blank", "noopener"); });
  }

  return {DICE: DICE, el: el, goalPicker: goalPicker, wireBackups: wireBackups};
})();
