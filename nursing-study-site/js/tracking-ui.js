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

  /* Weekly goal: questions per week (25/50/100/150) or study days per week (2/3/4/5) */
  function goalPicker(host, goal, onChange){
    var state = {type: goal.type, value: goal.value};
    host.innerHTML = "";
    var types = el("div", "tp-choice-row");
    types.setAttribute("role", "radiogroup");
    types.setAttribute("aria-label", "Goal type");
    var values = el("div", "tp-value-row");
    [["questions", "Questions per week"], ["days", "Study days per week"]].forEach(function(t){
      var b = el("button", "tp-choice", t[1]);
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("data-type", t[0]);
      b.addEventListener("click", function(){
        if (state.type === t[0]) return;
        state.type = t[0];
        state.value = t[0] === "days" ? 3 : 50;
        sync();
      });
      types.appendChild(b);
    });
    host.appendChild(types);
    host.appendChild(values);
    function sync(){
      types.querySelectorAll(".tp-choice").forEach(function(b){
        var on = b.getAttribute("data-type") === state.type;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-checked", on ? "true" : "false");
      });
      values.innerHTML = "";
      Tracking.GOALS[state.type].forEach(function(v){
        var b = el("button", "tp-value", String(v));
        b.type = "button";
        b.setAttribute("aria-pressed", v === state.value ? "true" : "false");
        b.classList.toggle("is-on", v === state.value);
        b.setAttribute("aria-label", Tracking.goalLabel({type: state.type, value: v}));
        b.addEventListener("click", function(){ state.value = v; sync(); });
        values.appendChild(b);
      });
      onChange({type: state.type, value: state.value});
    }
    sync();
  }

  /* Email it to myself / Save to password manager / Print QR code */
  function wireBackups(btns, getCode, getNickname){
    if (btns.email) btns.email.addEventListener("click", function(){ location.href = Tracking.mailtoHref(getCode()); });
    if (btns.manager) btns.manager.addEventListener("click", function(){ Tracking.saveToPasswordManager(getCode(), getNickname()); });
    if (btns.print) btns.print.addEventListener("click", function(){ window.open(Tracking.printUrl(getCode()), "_blank", "noopener"); });
  }

  return {DICE: DICE, el: el, goalPicker: goalPicker, wireBackups: wireBackups};
})();
