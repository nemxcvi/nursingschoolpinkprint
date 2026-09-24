(function(){
  var saved = localStorage.getItem("theme");
  if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");
  var savedPalette = localStorage.getItem("palette");
  if (savedPalette === "blue") document.documentElement.setAttribute("data-palette", "blue");
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
function togglePalette(){
  var root = document.documentElement;
  var isBlue = root.getAttribute("data-palette") === "blue";
  if (isBlue){
    root.removeAttribute("data-palette");
    localStorage.setItem("palette", "pink");
  } else {
    root.setAttribute("data-palette", "blue");
    localStorage.setItem("palette", "blue");
  }
  updateBrandText();
}
function updateBrandText(){
  var isBlue = document.documentElement.getAttribute("data-palette") === "blue";
  document.title = document.title.replace(/Pinkprint|Blueprint/, isBlue ? "Blueprint" : "Pinkprint");
  var accent = document.querySelector(".pp-header-title .accent");
  if (accent) accent.textContent = isBlue ? "Blueprint" : "Pinkprint";
}
document.addEventListener("DOMContentLoaded", function(){
  var icon = document.getElementById("themeicon");
  if (icon) icon.className = (document.documentElement.getAttribute("data-theme") === "dark") ? "ti ti-sun" : "ti ti-moon";
  updateBrandText();
});
