/* Shared site content. The header menu, the home page filters and search all
   read from here, so adding a widget or a unit only needs an edit in this file. */
var SITE = {
  currentSheet: "nur114",
  sheets: [
    {id:"nur114", num:"01", code:"NUR 114", units:[
      {code:"U-01", num:1, weeks:"1–3", name:"Intro to Nursing", slug:"unit-1-intro-to-nursing/"},
      {code:"U-02", num:2, weeks:"4–5", name:"Basic Human Needs", slug:"unit-2-basic-human-needs/"},
      {code:"U-03", num:3, weeks:"6–7", name:"Skin, Wounds & Diagnostics", slug:"unit-3-skin-wounds-diagnostics/"},
      {code:"U-04", num:4, weeks:"8–9", name:"Fluids & Nutrition", slug:"unit-4-fluids-nutrition/"},
      {code:"U-05", num:5, weeks:"10–11", name:"Gas Exchange & Med Math", slug:"unit-5-gas-exchange-med-math/"},
      {code:"U-06", num:6, weeks:"12–13", name:"Pharmacology & Med Admin", slug:"unit-6-pharmacology-med-admin/"}
    ]},
    {id:"nur121", num:"02", code:"NUR 121", units:[]}
  ],
  widgets: [
    {title:"General Abbreviations", type:"flashcards", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/general-abbreviations.html", count:23},
    {title:"Charting Abbreviations", type:"flashcards", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/charting-abbreviations.html", count:50},
    {title:"CBC/CMP Adult Lab Value Ranges", type:"flashcards", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/cbc-cmp-lab-values.html", count:29},
    {title:"Nursing Fundamentals practice quiz", type:"quiz", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/nursing-fundamentals-quiz.html", count:20, note:"Session or mastery rounds"},
    {title:"CBC/CMP practice quiz", type:"quiz", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/cbc-cmp-quiz.html", count:40},
    {title:"Mobility", type:"flashcards", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/mobility-flashcards.html", count:56},
    {title:"Mobility practice quiz", type:"quiz", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/mobility-quiz.html", count:40},
    {title:"Hygiene", type:"flashcards", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/hygiene-flashcards.html", count:44},
    {title:"Hygiene practice quiz", type:"quiz", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/hygiene-quiz.html", count:40},
    {title:"Client Education", type:"flashcards", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/client-education-flashcards.html", count:43},
    {title:"Client Education practice quiz", type:"quiz", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/client-education-quiz.html", count:40},
    {title:"Diversity, Equity, and Inclusion", type:"flashcards", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/dei-flashcards.html", count:47},
    {title:"Diversity, Equity, and Inclusion practice quiz", type:"quiz", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/dei-quiz.html", count:40},
    {title:"Self-Concept", type:"flashcards", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/self-concept-flashcards.html", count:51},
    {title:"Self-Concept practice quiz", type:"quiz", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/self-concept-quiz.html", count:40},
    {title:"Comfort, Rest & Sleep", type:"flashcards", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/comfort-rest-sleep-flashcards.html", count:59},
    {title:"Comfort, Rest & Sleep practice quiz", type:"quiz", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/comfort-rest-sleep-quiz.html", count:40},
    {title:"Stress and Coping", type:"flashcards", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/stress-coping-flashcards.html", count:69},
    {title:"Stress and Coping practice quiz", type:"quiz", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/stress-coping-quiz.html", count:40},
    {title:"Week 4 Study Guide", type:"studyguide", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/week4-study-guide.html", meta:"Mobility, hygiene & client education · mnemonics & quick checks"},
    {title:"Week 5 Study Guide", type:"studyguide", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/week5-study-guide.html", meta:"Self-concept, sleep, stress & DEI · mnemonics & quick checks"}
  ],
  mixAll: {title:"Mix all", type:"quiz", href:"mix-all-quiz.html", meta:"Random from every quiz on the site"},

  /* The three content types, keyed by the name used in URLs (?type=...) */
  types: [
    {key:"flashcards", widgetType:"flashcards", label:"Flashcards", one:"Flashcards", title:"All Flashcards", item:["deck","decks"], unitWord:["card","cards"], action:"Study"},
    {key:"quizzes", widgetType:"quiz", label:"Quizzes", one:"Quiz", title:"All Quizzes", item:["quiz","quizzes"], unitWord:["question","questions"], action:"Start"},
    {key:"studyguides", widgetType:"studyguide", label:"Study guides", one:"Study guide", title:"Study Guides", item:["guide","guides"], unitWord:null, action:"Open"}
  ]
};

SITE.getSheet = function(id){
  for (var i = 0; i < SITE.sheets.length; i++) if (SITE.sheets[i].id === id) return SITE.sheets[i];
  return SITE.getSheet(SITE.currentSheet);
};
SITE.getUnit = function(sheetId, code){
  var units = SITE.getSheet(sheetId).units;
  for (var i = 0; i < units.length; i++) if (units[i].code === code) return units[i];
  return null;
};
SITE.getType = function(key){
  for (var i = 0; i < SITE.types.length; i++){
    if (SITE.types[i].key === key || SITE.types[i].widgetType === key) return SITE.types[i];
  }
  return null;
};
SITE.unitLabel = function(w){
  var u = SITE.getUnit(w.sheet, w.unit);
  return u ? "Unit " + u.num : "";
};
/* Widgets for one sheet, optionally narrowed to a unit and/or a type key */
SITE.widgetsFor = function(sheetId, unitCode, typeKey){
  var t = typeKey ? SITE.getType(typeKey) : null;
  return SITE.widgets.filter(function(w){
    return w.sheet === sheetId && (!unitCode || w.unit === unitCode) && (!t || w.type === t.widgetType);
  });
};
/* Units of a sheet that have at least one widget */
SITE.unitsWithContent = function(sheetId){
  return SITE.getSheet(sheetId).units.filter(function(u){ return SITE.widgetsFor(sheetId, u.code).length > 0; });
};
/* The one search used everywhere: matches widget title or its unit ("Unit 2") */
SITE.search = function(q, typeKey){
  q = (q || "").trim().toLowerCase();
  var t = typeKey ? SITE.getType(typeKey) : null;
  return SITE.widgets.filter(function(w){
    if (t && w.type !== t.widgetType) return false;
    if (!q) return true;
    return w.title.toLowerCase().indexOf(q) !== -1 || SITE.unitLabel(w).toLowerCase().indexOf(q) !== -1;
  });
};

/* Display helpers for the library rows */
SITE.plural = function(n, words){ return n + " " + (n === 1 ? words[0] : words[1]); };
SITE.shortTitle = function(w){ return w.type === "quiz" ? w.title.replace(/ practice quiz$/i, "") : w.title; };
SITE.metaLine = function(w){
  if (w.meta) return w.meta;
  var t = SITE.getType(w.type);
  var line = t.unitWord && w.count ? SITE.plural(w.count, t.unitWord) : "";
  return w.note ? line + " \u00b7 " + w.note : line;
};
