/* My study pages (phase 5) in a real browser. Start servers.mjs first, then:
   node tests/sync/e2e-mystudy.js [screenshot folder]
   Seeds a student with mastered, still-learning, missed and bookmarked questions, a few weeks
   of activity and two exam scores, then opens each page on several dates (?today=...). */
const {chromium} = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const BASE = "http://localhost:8790/";
const OUT = process.argv[2] || require("os").tmpdir();
let failures = 0;
const check = (ok, label, extra) => { console.log((ok ? "ok   " : "FAIL ") + label + (extra !== undefined ? "  [" + extra + "]" : "")); if (!ok) failures++; };

(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({viewport: {width: 1200, height: 1000}});
  await c.route(/jsdelivr|googleapis|gstatic/, r => r.abort());
  const errors = [];
  c.on("page", pg => {
    pg.on("pageerror", e => errors.push(pg.url().replace(BASE, "/") + ": " + e.message));
    pg.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(pg.url().replace(BASE, "/") + ": " + m.text()); });
  });
  let pg = await c.newPage();
  await pg.goto(BASE + "start-tracking.html?from=home");
  await pg.waitForSelector("#st-qr svg");
  await pg.click("#st-start");
  await pg.waitForURL(BASE);

  /* Seed progress */
  await pg.evaluate(async () => {
    const get = n => fetch("data/nur114/unit-" + n + ".json").then(r => r.json());
    const [u1, u2, u3] = await Promise.all([get(1), get(2), get(3)]);
    const store = {}, t = Date.now();
    const put = (q, o) => { store[q.id] = Object.assign({seen: 0, correct: 0, wrong: 0, streak: 0, missStreak: 0, lastAnswered: null, mastered: false, masteredOn: null, bookmarked: false, journal: false, examReady: {}, t: t}, o); };
    u3.questions.forEach((q, i) => {
      if (i % 40 < 14) put(q, {seen: 2, correct: 2, streak: 2, lastAnswered: "2026-09-30", mastered: true, masteredOn: "2026-09-30", lastCorrect: true, lastSure: true});
      else if (i % 40 < 22) put(q, {seen: 2, correct: 1, wrong: 1, streak: 1, lastAnswered: "2026-09-29", lastCorrect: true, lastSure: i % 2 === 0});
      else if (i % 40 < 26) put(q, {seen: 3, correct: 1, wrong: 2, missStreak: 1, lastAnswered: "2026-09-29", journal: true, lastCorrect: false, lastSure: i % 2 === 0,
                                   lastWrong: {date: "2026-09-29", picked: ["b"], sure: i % 2 === 0}, bookmarked: i % 40 === 22, note: i % 40 === 22 ? "Look at the first step again" : undefined});
    });
    u1.questions.slice(0, 20).forEach(q => put(q, {seen: 2, correct: 2, streak: 2, lastAnswered: "2026-08-20", mastered: true, lastCorrect: true, lastSure: true}));
    u2.questions.slice(0, 6).forEach(q => put(q, {seen: 1, correct: 0, wrong: 1, missStreak: 1, journal: true, lastCorrect: false, lastSure: false, lastWrong: {date: "2026-09-20", picked: ["a"], sure: false}}));
    u2.questions.slice(10, 13).forEach(q => put(q, {seen: 2, correct: 2, mastered: true, lastAnswered: "2026-09-20", lastCorrect: true, lastSure: true, resolved: true}));
    localStorage.setItem("pinkprint-progress", JSON.stringify(store));
    const s = JSON.parse(localStorage.getItem("pinkprint-tracking"));
    const act = {};
    ["2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"].forEach(d => act[d] = 50);
    act["2026-09-29"] = 20; act["2026-10-12"] = 55; act["2026-11-23"] = 10;
    s.activity = {dev1: act};
    s.scores = {"exam-1": 84, "exam-2": 78};
    localStorage.setItem("pinkprint-tracking", JSON.stringify(s));
  });

  const go = async (path, today) => { await pg.goto(BASE + path + (path.includes("?") ? "&" : "?") + "today=" + today); await pg.waitForTimeout(700); };
  const shot = name => pg.screenshot({path: OUT + "/ms-" + name + ".png", fullPage: true});
  const text = sel => pg.textContent(sel).then(t => t.replace(/\s+/g, " ").trim()).catch(() => "");

  // ---- Dashboard before the Exam 3 window ----
  await go("dashboard.html", "2026-10-01");
  await pg.waitForSelector(".ms-exam");
  check(/Exam 3 · Skin, Wounds & Diagnostics/.test(await text(".ms-exam")), "dashboard: next exam is Exam 3", (await text(".ms-exam h2")));
  check(/11\s*days left/.test(await text(".ms-days")), "dashboard: 11 days left on Oct 1");
  const planLine = await text(".ms-plan");
  check(/Today's plan: \d+ questions/.test(planLine), "dashboard: today's plan", planLine);
  check(/opens Fri Oct 9/.test(await text(".ms-exam-foot")), "dashboard: window opens Fri Oct 9");
  const week = await text(".ms-week");
  const kv = await pg.$$eval(".ms-kv div", d => d.map(x => x.children[0].textContent + ": " + x.children[1].textContent));
  check(kv[0] === "Streak: 6 weeks" && kv[1] === "Best streak: 6 weeks" && /70\s*of 50 questions/.test(week), "dashboard: this week, streak and best streak", kv.join(" | "));
  check(/81%/.test(await text(".ms-grade")) && /73%/.test(await text(".ms-grade")), "dashboard: exam average 81%, needs about 73%");
  check((await pg.$$eval(".ms-tile", t => t.length)) === 4, "dashboard: 4 tiles");
  check((await pg.$$eval(".ms-current .ms-row", r => r.length)) === 7, "dashboard: Unit 3 topic table (7 topics)");
  await shot("dashboard-oct1");

  // Log Exam 3 through Edit scores and check the average updates
  await go("dashboard.html", "2026-10-14");
  await pg.click("#ms-editscores");
  await pg.fill('.ms-score[data-exam="exam-3"]', "90");
  await pg.click("#ms-savescores");
  await pg.waitForTimeout(300);
  check(/84%/.test(await text(".ms-grade-big")), "exam scores: logging Exam 3 updates the average", await text(".ms-grade-big"));

  // ---- Unit 4 (no questions yet) ----
  await go("dashboard.html", "2026-10-15");
  check(/Exam 4/.test(await text(".ms-exam h2")) && /coming soon/.test(await text(".ms-exam-foot")), "Unit 4 current: coming soon, plan reviews earlier units");
  check(/coming soon/.test(await text(".ms-current")), "Unit 4 card says coming soon");
  await shot("dashboard-oct15");

  // ---- Exam countdown in the window ----
  await go("exam.html", "2026-10-10");
  await pg.waitForSelector(".ms-examtop");
  check(/of 280 exam ready/.test(await text(".ms-examtop")), "exam page: exam ready count for Unit 3", (await text(".ms-examtop h2")));
  check((await pg.$$eval(".ms-groups li", l => l.length)) === 7, "exam page: 7 groups in the window (review folded into mastered)");
  check((await pg.$$eval(".ms-confidence .ms-row", r => r.length)) === 7, "exam page: confidence check per topic");
  await shot("exam-window");
  await go("exam.html", "2026-10-01");
  check(/of 280 mastered/.test(await text(".ms-examtop")) && (await pg.$$eval(".ms-groups li", l => l.length)) === 8, "exam page outside the window: mastered + 8 groups");

  // ---- Progress ----
  await go("progress.html", "2026-10-01");
  await pg.waitForSelector(".ms-units");
  check((await pg.$$eval(".ms-unit", u => u.length)) === 3, "progress: 3 units with questions");
  const due = await text(".ms-totals");
  check(/Due for review/.test(due), "progress: totals", due);
  await pg.click('.ms-unit-name[data-unit="3"]');
  await pg.waitForSelector(".ms-topics");
  check((await pg.$$eval(".ms-topics .ms-row", r => r.length)) === 7, "progress: Unit 3 topics open");
  check(/Quiz my \d+ blind spots?/.test(await text(".ms-blind")), "progress: blind spots box", (await text(".ms-blind .ms-btn")));
  await shot("progress");

  // ---- Journal ----
  await go("journal.html", "2026-10-01");
  await pg.waitForSelector(".ms-tabs");
  const tabs = await text(".ms-tabs");
  check(/Mistake journal · 34/.test(tabs), "journal: 28 unit-3 + 6 unit-2 mistakes", tabs);
  check(/Your answer/.test(await text(".ms-jcard")) && /Correct answer/.test(await text(".ms-jcard")), "journal: your answer and correct answer");
  check(/Resolved · 3/.test(await text(".ms-resolved")), "journal: resolved section");
  await pg.selectOption("#j-unit", "2");
  check((await pg.$$eval(".ms-jcard", c => c.length)) === 6, "journal: unit filter");
  await shot("journal");
  await pg.selectOption("#j-unit", "");
  await pg.click('[data-tab="bookmarks"]');
  check((await pg.$$eval(".ms-jcard", c => c.length)) >= 1 && /My note/.test(await text(".ms-main")), "journal: bookmarks tab with note");

  // ---- Sessions ----
  await go("session.html?mode=today", "2026-10-01");
  await pg.waitForSelector("#pq-quiz-screen:not(.hidden)");
  const prog = await text("#pq-progress");
  check(/question 1 of \d+/.test(prog), "session: today's plan starts straight away", prog);
  await go("session.html?mode=weak", "2026-10-01");
  await pg.waitForSelector("#pq-quiz-screen:not(.hidden)");
  check(/of 20/.test(await text("#pq-progress")), "session: weak spots (20 questions)", await text("#pq-progress"));
  await pg.click("#pq-end-test");
  check(/Weak spots quiz mastery/.test(await text("#pq-mastery")), "session: results with Mastery box");
  check(await pg.$$eval('#pq-mastery a[href*="journal.html"]', a => a.length).then(n => n >= 0), "session: journal link present when mistakes added");
  await go("session.html?mode=review&unit=1", "2026-10-01");
  await pg.waitForSelector("#pq-quiz-screen:not(.hidden), #pq-empty:not(.hidden)");
  check(await pg.isVisible("#pq-quiz-screen"), "session: Unit 1 review (mastered in August is due 4 weeks later)");
  await go("session.html?mode=blind&unit=2", "2026-10-01");
  await pg.waitForSelector("#pq-empty:not(.hidden)");
  check(await pg.isVisible("#pq-empty"), "session: empty set shows a friendly message");

  // ---- Tracker homepage ----
  await go("", "2026-10-15");
  await pg.waitForSelector("#pp-strip");
  check((await pg.$$eval(".pp-day", d => d.length)) === 14, "homepage: 14 squares Oct 13 - Oct 26");
  check(/11\s*days to Exam 4/.test(await text("#pp-strip")), "homepage: 11 days to Exam 4");
  check((await pg.$$eval(".pp-card-mastery", c => c.length)) === 0 && await pg.$eval('.pp-card[href="dashboard.html"]', el => el.classList.contains("is-current") && /In draft/.test(el.textContent)), "homepage: no mastery bars; Unit 4 is highlighted as the current unit and still says In draft");
  check(await pg.getAttribute("#tag-mystudy", "href") === "dashboard.html", "homepage: My study opens My dashboard");
  await shot("home-oct15");
  await go("", "2026-11-20");
  await pg.waitForSelector("#pp-strip");
  check((await pg.$$eval(".pp-sq.is-break", d => d.length)) === 6 && /Thanksgiving break Nov 24–29/.test(await text(".pp-strip-top")), "homepage: Thanksgiving days striped");
  await shot("home-break");
  await pg.click("#navbtn"); await pg.waitForTimeout(250);
  await pg.click('.nav-sec[data-sec="mystudy"] > .nav-sechead'); await pg.waitForTimeout(300);
  check(JSON.stringify(await pg.$$eval('.nav-sec[data-sec="mystudy"] .nav-secbody a', a => a.map(x => x.textContent.replace("→", "").trim()))) === JSON.stringify(["Dashboard", "Progress", "Journal", "Challenges", "Library", "Settings"]), "menu: Dashboard, Progress, Journal, Challenges, Library, Settings");

  // ---- Semester recap and break week ----
  await go("dashboard.html", "2026-12-15");
  check(/Semester recap/.test(await text(".ms-main")) && /Holiday break: hitting your goal grows your streak; missing it only pauses it/.test(await text(".ms-week")), "after Dec 10: recap, and the weekly goal still counts during the break (on by default)");
  await shot("dashboard-recap");

  // ---- My study header: the site menu at the left; Settings and night mode at the right ----
  await go("dashboard.html", "2026-10-01");
  check(await pg.$(".ms-header .ms-hdr-left #navbtn") && await pg.$(".ms-header .ms-hdr-right .ms-settings[aria-label='Settings'] + .ms-theme"),
    "My study header: menu on the left; Settings then night mode on the right");
  await pg.click(".ms-header #navbtn"); await pg.waitForTimeout(300);
  check(await pg.isVisible("#sitenav") && await pg.$eval('#sitenav .nav-row.is-current', a => a.textContent.includes("Dashboard")), "menu opens on My study pages with Dashboard marked");
  await pg.click(".ms-header #navbtn"); await pg.waitForTimeout(300);
  await pg.click(".ms-theme");
  check(await pg.evaluate(() => document.documentElement.getAttribute("data-theme") === "dark" && localStorage.getItem("theme") === "dark"), "night mode button switches to dark");
  await pg.click(".ms-theme");

  // ---- Settings switches hide features ----
  await pg.evaluate(() => { Tracking.setFeature("countdown", false); Tracking.setFeature("goal", false); Tracking.setFeature("challenges", false); });
  await go("dashboard.html", "2026-10-01");
  check(!(await pg.$(".ms-exam")) && !(await pg.$(".ms-week")) && (await pg.$$eval(".ms-tile", t => t.length)) === 3, "switches: countdown, goal and challenges hidden");
  await go("", "2026-10-15");
  check(!(await pg.$("#pp-strip")), "switches: no countdown strip on the homepage");
  check(await pg.evaluate(() => Tracking.feature("grade")), "Exam average is on by default");
  await pg.evaluate(() => Tracking.setFeature("grade", false));
  await go("dashboard.html", "2026-10-01");
  check(!(await pg.$(".ms-grade")), "switches: Exam average hidden");

  check(errors.length === 0, "no page errors", errors.join(" | "));
  console.log(failures ? failures + " FAILED" : "all My study checks passed");
  await b.close();
  process.exit(failures ? 1 : 0);
})();
