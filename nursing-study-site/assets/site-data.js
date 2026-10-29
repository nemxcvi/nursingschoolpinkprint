/* Shared site content. The header menu, the home page filters and search all
   read from here, so adding a widget or a unit only needs an edit in this file. */
var SITE = {
  currentSheet: "nur114",
  sheets: [
    {id:"nur114", num:"01", code:"NUR 114", units:[
      {code:"U-01", num:1, weeks:"1–3", name:"Intro to Nursing", slug:"unit-1-intro-to-nursing/", status:"Ready"},
      {code:"U-02", num:2, weeks:"4–5", name:"Basic Human Needs", slug:"unit-2-basic-human-needs/"},
      {code:"U-03", num:3, weeks:"6–7", name:"Skin, Wounds & Diagnostics", slug:"unit-3-skin-wounds-diagnostics/"},
      {code:"U-04", num:4, weeks:"8–9", name:"Fluids, Nutrition & Med Math", slug:"unit-4-fluids-nutrition-med-math/"},
      {code:"U-05", num:5, weeks:"10–11", name:"Gas Exchange & Med Admin", slug:"unit-5-gas-exchange-med-admin/"},
      {code:"U-06", num:6, weeks:"12–13", name:"Pharmacology & Med Admin", slug:"unit-6-pharmacology-med-admin/"}
    ]},
    {id:"nur121", num:"02", code:"NUR 121", units:[]}
  ],
  widgets: [
    {title:"General Abbreviations", type:"flashcards", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/general-abbreviations.html", count:23},
    {title:"Charting Abbreviations", type:"flashcards", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/charting-abbreviations.html", count:50},
    {title:"CBC/CMP Adult Lab Value Ranges", type:"flashcards", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/cbc-cmp-lab-values.html", count:29},
    {title:"CBC/CMP practice quiz", type:"quiz", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/cbc-cmp-quiz.html", count:43},
    {title:"Foundations & the Nursing Process", type:"flashcards", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/foundations-flashcards.html", count:54},
    {title:"Foundations & the Nursing Process practice quiz", type:"quiz", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/foundations-quiz.html", count:56},
    {title:"Priority Setting & Managing Care", type:"flashcards", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/priority-care-flashcards.html", count:54},
    {title:"Priority Setting & Managing Care practice quiz", type:"quiz", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/priority-care-quiz.html", count:53},
    {title:"Health Assessment, Vital Signs & Pain", type:"flashcards", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/vitals-pain-flashcards.html", count:63},
    {title:"Health Assessment, Vital Signs & Pain practice quiz", type:"quiz", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/vitals-pain-quiz.html", count:62},
    {title:"Professionalism, Ethics & Legal", type:"flashcards", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/ethics-legal-flashcards.html", count:53},
    {title:"Professionalism, Ethics & Legal practice quiz", type:"quiz", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/ethics-legal-quiz.html", count:52},
    {title:"Communication, Documentation & EBP", type:"flashcards", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/communication-flashcards.html", count:61},
    {title:"Communication, Documentation & EBP practice quiz", type:"quiz", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/communication-quiz.html", count:59},
    {title:"Week 2 Study Guide", type:"studyguide", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/week2-study-guide.html", meta:"Nursing process, priorities, health promotion, vital signs & pain · mnemonics & quick checks"},
    {title:"Week 3 Study Guide", type:"studyguide", sheet:"nur114", unit:"U-01", href:"unit-1-intro-to-nursing/week3-study-guide.html", meta:"Professionalism, ethics & law, communication, teamwork, documentation & EBP · mnemonics & quick checks"},
    {title:"Mobility", type:"flashcards", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/mobility-flashcards.html", count:56},
    {title:"Mobility practice quiz", type:"quiz", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/mobility-quiz.html", count:111},
    {title:"Hygiene", type:"flashcards", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/hygiene-flashcards.html", count:43},
    {title:"Hygiene practice quiz", type:"quiz", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/hygiene-quiz.html", count:99},
    {title:"Client Education", type:"flashcards", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/client-education-flashcards.html", count:40},
    {title:"Client Education practice quiz", type:"quiz", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/client-education-quiz.html", count:88},
    {title:"Diversity, Equity, and Inclusion", type:"flashcards", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/dei-flashcards.html", count:47},
    {title:"Diversity, Equity, and Inclusion practice quiz", type:"quiz", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/dei-quiz.html", count:61},
    {title:"Self-Concept", type:"flashcards", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/self-concept-flashcards.html", count:51},
    {title:"Self-Concept practice quiz", type:"quiz", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/self-concept-quiz.html", count:70},
    {title:"Comfort, Rest & Sleep", type:"flashcards", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/comfort-rest-sleep-flashcards.html", count:59},
    {title:"Comfort, Rest & Sleep practice quiz", type:"quiz", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/comfort-rest-sleep-quiz.html", count:74},
    {title:"Stress and Coping", type:"flashcards", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/stress-coping-flashcards.html", count:69},
    {title:"Stress and Coping practice quiz", type:"quiz", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/stress-coping-quiz.html", count:78},
    {title:"Week 4 Study Guide", type:"studyguide", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/week4-study-guide.html", meta:"Mobility, hygiene & client education · mnemonics & quick checks"},
    {title:"Week 5 Study Guide", type:"studyguide", sheet:"nur114", unit:"U-02", href:"unit-2-basic-human-needs/week5-study-guide.html", meta:"Self-concept, sleep, stress & DEI · mnemonics & quick checks"},
    {title:"Infection Control & Isolation", type:"flashcards", sheet:"nur114", unit:"U-03", href:"unit-3-skin-wounds-diagnostics/infection-control-flashcards.html", count:108},
    {title:"Infection Control & Isolation practice quiz", type:"quiz", sheet:"nur114", unit:"U-03", href:"unit-3-skin-wounds-diagnostics/infection-control-quiz.html", count:122},
    {title:"Specimen Collection", type:"flashcards", sheet:"nur114", unit:"U-03", href:"unit-3-skin-wounds-diagnostics/specimen-collection-flashcards.html", count:61},
    {title:"Specimen Collection practice quiz", type:"quiz", sheet:"nur114", unit:"U-03", href:"unit-3-skin-wounds-diagnostics/specimen-collection-quiz.html", count:96},
    {title:"Tissue Integrity", type:"flashcards", sheet:"nur114", unit:"U-03", href:"unit-3-skin-wounds-diagnostics/tissue-integrity-flashcards.html", count:157},
    {title:"Tissue Integrity practice quiz", type:"quiz", sheet:"nur114", unit:"U-03", href:"unit-3-skin-wounds-diagnostics/tissue-integrity-quiz.html", count:133},
    {title:"Week 6 Study Guide", type:"studyguide", sheet:"nur114", unit:"U-03", href:"unit-3-skin-wounds-diagnostics/week6-study-guide.html", meta:"Infection control, tissue integrity & specimen collection · mnemonics & quick checks"},
    {title:"Assessment: Integumentary, HEENT & Neuro", type:"flashcards", sheet:"nur114", unit:"U-03", href:"unit-3-skin-wounds-diagnostics/assessment-integumentary-heent-neuro-flashcards.html", count:198},
    {title:"Assessment: Integumentary, HEENT & Neuro practice quiz", type:"quiz", sheet:"nur114", unit:"U-03", href:"unit-3-skin-wounds-diagnostics/assessment-integumentary-heent-neuro-quiz.html", count:93},
    {title:"Cranial Nerves", type:"flashcards", sheet:"nur114", unit:"U-03", href:"unit-3-skin-wounds-diagnostics/cranial-nerves-flashcards.html", count:43},
    {title:"Cranial Nerves practice quiz", type:"quiz", sheet:"nur114", unit:"U-03", href:"unit-3-skin-wounds-diagnostics/cranial-nerves-quiz.html", count:58},
    {title:"Assessment: Thorax, Cardiovascular, Abdomen & Musculoskeletal", type:"flashcards", sheet:"nur114", unit:"U-03", href:"unit-3-skin-wounds-diagnostics/assessment-thorax-cardiovascular-abdomen-musculoskeletal-flashcards.html", count:172},
    {title:"Assessment: Thorax, Cardiovascular, Abdomen & Musculoskeletal practice quiz", type:"quiz", sheet:"nur114", unit:"U-03", href:"unit-3-skin-wounds-diagnostics/assessment-thorax-cardiovascular-abdomen-musculoskeletal-quiz.html", count:107},
    {title:"Safety", type:"flashcards", sheet:"nur114", unit:"U-03", href:"unit-3-skin-wounds-diagnostics/safety-flashcards.html", count:147},
    {title:"Safety practice quiz", type:"quiz", sheet:"nur114", unit:"U-03", href:"unit-3-skin-wounds-diagnostics/safety-quiz.html", count:152},
    {title:"Week 7 Study Guide", type:"studyguide", sheet:"nur114", unit:"U-03", href:"unit-3-skin-wounds-diagnostics/week7-study-guide.html", meta:"Physical assessment & safety · mnemonics & quick checks"},
    {title:"Fluid Balance & Imbalances", type:"flashcards", sheet:"nur114", unit:"U-04", href:"unit-4-fluids-nutrition-med-math/fluid-balance-flashcards.html", count:44},
    {title:"Fluid Balance & Imbalances practice quiz", type:"quiz", sheet:"nur114", unit:"U-04", href:"unit-4-fluids-nutrition-med-math/fluid-balance-quiz.html", count:54},
    {title:"Electrolytes", type:"flashcards", sheet:"nur114", unit:"U-04", href:"unit-4-fluids-nutrition-med-math/electrolytes-flashcards.html", count:49},
    {title:"Electrolytes practice quiz", type:"quiz", sheet:"nur114", unit:"U-04", href:"unit-4-fluids-nutrition-med-math/electrolytes-quiz.html", count:59},
    {title:"IV Therapy & Blood Transfusions", type:"flashcards", sheet:"nur114", unit:"U-04", href:"unit-4-fluids-nutrition-med-math/iv-therapy-flashcards.html", count:50},
    {title:"IV Therapy & Blood Transfusions practice quiz", type:"quiz", sheet:"nur114", unit:"U-04", href:"unit-4-fluids-nutrition-med-math/iv-therapy-quiz.html", count:51},
    {title:"Acid-Base Balance", type:"flashcards", sheet:"nur114", unit:"U-04", href:"unit-4-fluids-nutrition-med-math/acid-base-flashcards.html", count:41},
    {title:"Acid-Base Balance practice quiz", type:"quiz", sheet:"nur114", unit:"U-04", href:"unit-4-fluids-nutrition-med-math/acid-base-quiz.html", count:34},
    {title:"Nutrition", type:"flashcards", sheet:"nur114", unit:"U-04", href:"unit-4-fluids-nutrition-med-math/nutrition-flashcards.html", count:85},
    {title:"Nutrition practice quiz", type:"quiz", sheet:"nur114", unit:"U-04", href:"unit-4-fluids-nutrition-med-math/nutrition-quiz.html", count:75},
    {title:"Enteral & Parenteral Nutrition", type:"flashcards", sheet:"nur114", unit:"U-04", href:"unit-4-fluids-nutrition-med-math/enteral-parenteral-flashcards.html", count:73},
    {title:"Enteral & Parenteral Nutrition practice quiz", type:"quiz", sheet:"nur114", unit:"U-04", href:"unit-4-fluids-nutrition-med-math/enteral-parenteral-quiz.html", count:69},
    {title:"Food Sources", type:"flashcards", sheet:"nur114", unit:"U-04", href:"unit-4-fluids-nutrition-med-math/food-sources-flashcards.html", count:36},
    {title:"Food Sources practice quiz", type:"quiz", sheet:"nur114", unit:"U-04", href:"unit-4-fluids-nutrition-med-math/food-sources-quiz.html", count:44},
    {title:"Bowel Elimination", type:"flashcards", sheet:"nur114", unit:"U-04", href:"unit-4-fluids-nutrition-med-math/bowel-elimination-flashcards.html", count:139},
    {title:"Bowel Elimination practice quiz", type:"quiz", sheet:"nur114", unit:"U-04", href:"unit-4-fluids-nutrition-med-math/bowel-elimination-quiz.html", count:146},
    {title:"Urinary Elimination", type:"flashcards", sheet:"nur114", unit:"U-04", href:"unit-4-fluids-nutrition-med-math/urinary-elimination-flashcards.html", count:118},
    {title:"Urinary Elimination practice quiz", type:"quiz", sheet:"nur114", unit:"U-04", href:"unit-4-fluids-nutrition-med-math/urinary-elimination-quiz.html", count:123},
    {title:"Med Math", type:"flashcards", sheet:"nur114", unit:"U-04", href:"unit-4-fluids-nutrition-med-math/med-math-flashcards.html", count:73},
    {title:"Med Math practice quiz", type:"quiz", sheet:"nur114", unit:"U-04", href:"unit-4-fluids-nutrition-med-math/med-math-quiz.html", count:97, note:"Calculator on math questions"},
    {title:"Week 8 Study Guide", type:"studyguide", sheet:"nur114", unit:"U-04", href:"unit-4-fluids-nutrition-med-math/week8-study-guide.html", meta:"Fluids, electrolytes, IV therapy, acid-base, nutrition & foods · ABG cheat sheet & quick checks"},
    {title:"Week 9 Study Guide", type:"studyguide", sheet:"nur114", unit:"U-04", href:"unit-4-fluids-nutrition-med-math/week9-study-guide.html", meta:"Bowel & urinary elimination, ostomies, catheters & med math · quick checks"},
    {title:"Pharmacology Principles", type:"flashcards", sheet:"nur114", unit:"U-05", href:"unit-5-gas-exchange-med-admin/pharm-principles-flashcards.html", count:88},
    {title:"Pharmacology Principles practice quiz", type:"quiz", sheet:"nur114", unit:"U-05", href:"unit-5-gas-exchange-med-admin/pharm-principles-quiz.html", count:118},
    {title:"Medication Administration", type:"flashcards", sheet:"nur114", unit:"U-05", href:"unit-5-gas-exchange-med-admin/med-admin-flashcards.html", count:85},
    {title:"Medication Administration practice quiz", type:"quiz", sheet:"nur114", unit:"U-05", href:"unit-5-gas-exchange-med-admin/med-admin-quiz.html", count:143},
    {title:"Medication Calculations", type:"flashcards", sheet:"nur114", unit:"U-05", href:"unit-5-gas-exchange-med-admin/med-calc-flashcards.html", count:60},
    {title:"Medication Calculations practice quiz", type:"quiz", sheet:"nur114", unit:"U-05", href:"unit-5-gas-exchange-med-admin/med-calc-quiz.html", count:162, note:"Typed answers · calculator"},
    {title:"Week 10 Study Guide", type:"studyguide", sheet:"nur114", unit:"U-05", href:"unit-5-gas-exchange-med-admin/week10-study-guide.html", meta:"Pharmacology, med administration & med math (all 10 Medication Calculation Competency types) · quick checks"}
  ],
  mixAll: {title:"Mix all", type:"quiz", href:"mix-all-quiz.html", meta:"Random from every quiz on the site"},
  connectDots: {title:"Connecting The Dots", type:"studyguide", href:"connecting-the-dots.html", meta:"How every unit links together · covers all weeks"},

  /* The three content types, keyed by the name used in URLs (?type=...) */
  types: [
    {key:"flashcards", widgetType:"flashcards", label:"Flashcards", one:"Flashcards", title:"All Flashcards", item:["deck","decks"], unitWord:["card","cards"], action:"Study"},
    {key:"quizzes", widgetType:"quiz", label:"Quizzes", one:"Quiz", title:"All Quizzes", item:["quiz","quizzes"], unitWord:["question","questions"], action:"Start"},
    {key:"studyguides", widgetType:"studyguide", label:"Study guides", one:"Study guide", title:"All Study Guides", item:["guide","guides"], unitWord:null, action:"Open"}
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
/* A unit's label on the homepage cards, worked out from its widgets so it never goes stale:
   "In draft" with no widgets yet; "Ready" once every week in its range has a study guide, or once
   its exam (exams.json date, passed in as examDate) is over; otherwise "In progress".
   A unit can force a label with status:"Ready" (or any text) in SITE.sheets. */
SITE.unitStatus = function(sheetId, code, examDate, today){
  var u = SITE.getUnit(sheetId, code);
  var ws = SITE.widgetsFor(sheetId, code);
  if (!u || ws.length === 0) return "In draft";
  if (u.status) return u.status;
  if (examDate && today && examDate < today) return "Ready";
  var m = String(u.weeks).match(/(\d+)\D+(\d+)/) || String(u.weeks).match(/(\d+)/);
  var from = +m[1], to = +(m[2] || m[1]);
  for (var w = from; w <= to; w++){
    var re = new RegExp("week" + w + "-study-guide\\.html");
    if (!ws.some(function(x){ return x.type === "studyguide" && re.test(x.href); })) return "In progress";
  }
  return "Ready";
};
SITE.plural = function(n, words){ return n + " " + (n === 1 ? words[0] : words[1]); };
SITE.shortTitle = function(w){ return w.type === "quiz" ? w.title.replace(/ practice quiz$/i, "") : w.title; };
SITE.metaLine = function(w){
  if (w.meta) return w.meta;
  var t = SITE.getType(w.type);
  var line = t.unitWord && w.count ? SITE.plural(w.count, t.unitWord) : "";
  return w.note ? line + " \u00b7 " + w.note : line;
};
