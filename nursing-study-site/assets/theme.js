(function(){
  var saved = localStorage.getItem("theme");
  if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");
  var savedPalette = localStorage.getItem("palette");
  if (savedPalette === "blue") document.documentElement.setAttribute("data-palette", "blue");
  if (localStorage.getItem("paletteHintSeen") === "1") document.documentElement.setAttribute("data-hint-seen", "1");
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
  root.setAttribute("data-hint-seen", "1");
  localStorage.setItem("paletteHintSeen", "1");
  updateBrandText();
  updateFavicon();
}
function updateFavicon(){
  var isBlue = document.documentElement.getAttribute("data-palette") === "blue";
  var icon = document.querySelector('link[rel="icon"]');
  if (icon) icon.href = icon.href.replace(/favicon(-blue)?\.svg/, isBlue ? "favicon-blue.svg" : "favicon.svg");
}
function updateBrandText(){
  var isBlue = document.documentElement.getAttribute("data-palette") === "blue";
  document.title = document.title.replace(/Pinkprint|Blueprint/, isBlue ? "Blueprint" : "Pinkprint");
  var word = document.getElementById("paletteWord");
  if (word){
    word.textContent = isBlue ? "Blue" : "Pink";
    word.setAttribute("aria-label", isBlue ? "Switch to Pinkprint palette" : "Switch to Blueprint palette");
    word.setAttribute("title", isBlue ? "Switch to Pinkprint" : "Switch to Blueprint");
  }
  var hint = document.getElementById("paletteHint");
  if (hint) hint.textContent = isBlue ? "switch to pinkprint" : "switch to blueprint";
}
document.addEventListener("DOMContentLoaded", function(){
  var icon = document.getElementById("themeicon");
  if (icon) icon.className = (document.documentElement.getAttribute("data-theme") === "dark") ? "ti ti-sun" : "ti ti-moon";
  updateBrandText();
});
