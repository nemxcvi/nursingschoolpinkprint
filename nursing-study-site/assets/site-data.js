/* Shared site content. The header menu, the home page filters and search all
   read from here, so adding a widget or a unit only needs an edit in this file. */
var SITE = {
  currentSheet: "nur114",
  sheets: [
    {id:"nur114", num:"01", code:"NUR 114", units:[
      {code:"U-01", num:1, name:"Intro to Nursing", slug:"unit-1-intro-to-nursing/"},
      {code:"U-02", num:2, name:"Basic Human Needs", slug:"unit-2-basic-human-needs/"},
      {code:"U-03", num:3, name:"Skin, Wounds & Diagnostics", slug:"unit-3-skin-wounds-diagnostics/"},
      {code:"U-04", num:4, name:"Fluids & Nutrition", slug:"unit-4-fluids-nutrition/"},
      {code:"U-05", num:5, name:"Gas Exchange & Med Math", slug:"unit-5-gas-exchange-med-math/"},
      {code:"U-06", num:6, name:"Pharmacology & Med Admin", slug:"unit-6-pharmacology-med-admin/"}
    ]},
    {id:"nur121", num:"02", code:"NUR 121", units:[]}
  ],
  widgets: [
    {title:"General Abbreviations", type:"flashcards", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/general-abbreviations.html"},
    {title:"Charting Abbreviations", type:"flashcards", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/charting-abbreviations.html"},
    {title:"CBC/CMP lab values", type:"flashcards", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/cbc-cmp-lab-values.html"},
    {title:"Nursing Fundamentals practice quiz", type:"quiz", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/nursing-fundamentals-quiz.html"},
    {title:"CBC/CMP practice quiz", type:"quiz", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/cbc-cmp-quiz.html"},
    {title:"Mobility", type:"flashcards", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/mobility-flashcards.html"},
    {title:"Mobility practice quiz", type:"quiz", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/mobility-quiz.html"},
    {title:"Hygiene", type:"flashcards", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/hygiene-flashcards.html"},
    {title:"Hygiene practice quiz", type:"quiz", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/hygiene-quiz.html"},
    {title:"Client Education", type:"flashcards", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/client-education-flashcards.html"},
    {title:"Client Education practice quiz", type:"quiz", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/client-education-quiz.html"},
    {title:"Diversity, Equity, and Inclusion", type:"flashcards", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/dei-flashcards.html"},
    {title:"Diversity, Equity, and Inclusion practice quiz", type:"quiz", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/dei-quiz.html"},
    {title:"Self-Concept", type:"flashcards", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/self-concept-flashcards.html"},
    {title:"Self-Concept practice quiz", type:"quiz", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/self-concept-quiz.html"},
    {title:"Comfort, Rest & Sleep", type:"flashcards", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/comfort-rest-sleep-flashcards.html"},
    {title:"Comfort, Rest & Sleep practice quiz", type:"quiz", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/comfort-rest-sleep-quiz.html"},
    {title:"Stress and Coping", type:"flashcards", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/stress-coping-flashcards.html"},
    {title:"Stress and Coping practice quiz", type:"quiz", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/stress-coping-quiz.html"},
    {title:"Week 5 Study Guide", type:"studyguide", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/week5-study-guide.html"}
  ],
  mixAll: {title:"Mix all", type:"quiz", href:"mix-all-quiz.html"},

  /* The three content types, keyed by the name used in URLs (?type=...) */
  types: [
    {key:"flashcards", widgetType:"flashcards", label:"Flashcards", one:"Flashcards"},
    {key:"quizzes", widgetType:"quiz", label:"Quizzes", one:"Quiz"},
    {key:"studyguides", widgetType:"studyguide", label:"Study guides", one:"Study guide"}
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
