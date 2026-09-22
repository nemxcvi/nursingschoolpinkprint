(function(){
  var saved = localStorage.getItem("theme");
  if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");
})();
function toggleTheme(){
  var root = document.documentElement;
  var isDark = root.getAttribute("data-theme") === "dark";
  if (isDark){
    root.removeAttribute("data-theme");
    localStorage.setItem("theme", "light");
  } else {
    root.setAttribute("data-theme", "dark");
    localStorage.setItem("theme", "dark");
  }
  var icon = document.getElementById("themeicon");
  if (icon) icon.className = (root.getAttribute("data-theme") === "dark") ? "ti ti-sun" : "ti ti-moon";
}
document.addEventListener("DOMContentLoaded", function(){
  var icon = document.getElementById("themeicon");
  if (icon) icon.className = (document.documentElement.getAttribute("data-theme") === "dark") ? "ti ti-sun" : "ti ti-moon";
});
