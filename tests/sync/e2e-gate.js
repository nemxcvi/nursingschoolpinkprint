/* The class-code gate in a real browser. Start servers.mjs with a class code first:
     CLASS_CODE="Pink Nurses 26" PG_MODULES=... node tests/sync/servers.mjs
   then:  node tests/sync/e2e-gate.js [screenshot folder]
   A first visit to a deep link shows the code screen; the right code sets a 1-year cookie and
   lands on that page; other pages, quiz data and tracking then work with no more asking. */
const {chromium} = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const BASE = "http://localhost:8790/";
const QUIZ = "unit-3-skin-wounds-diagnostics/safety-quiz.html";
const OUT = process.argv[2] || require("os").tmpdir();
let failures = 0;
const check = (ok, label, extra) => { console.log((ok ? "ok   " : "FAIL ") + label + (extra !== undefined ? "  [" + extra + "]" : "")); if (!ok) failures++; };

(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({viewport: {width: 1200, height: 900}});
  await c.route(/jsdelivr|googleapis|gstatic/, r => r.abort());
  const errors = [];
  const pg = await c.newPage();
  pg.on("pageerror", e => errors.push(e.message));

  await pg.goto(BASE + QUIZ + "?from=link");
  check(/Enter class code/.test(await pg.textContent("h1")) && pg.url() === BASE + QUIZ + "?from=link", "first visit to a deep link: code screen, address unchanged");
  await pg.screenshot({path: OUT + "/gate.png"});
  await pg.fill("#cc-code", "wrong code");
  await pg.click("button[type=submit]");
  check(/isn't right/.test(await pg.textContent(".cc-card")), "wrong code: asked again");
  await pg.screenshot({path: OUT + "/gate-wrong.png"});
  await pg.fill("#cc-code", "  pink nurses 26 ");
  await pg.click("button[type=submit]");
  await pg.waitForURL(BASE + QUIZ + "?from=link");
  await pg.waitForSelector("#pq-start");
  check(/Safety/.test(await pg.title()), "right code: straight to the page they wanted, and the quiz data loads");
  const cookie = (await c.cookies()).find(k => k.name === "pp_class");
  const days = cookie ? (cookie.expires - Date.now() / 1000) / 86400 : 0;
  check(cookie && cookie.httpOnly && days > 360 && days < 370, "cookie lasts a year", Math.round(days) + " days");

  await pg.goto(BASE);
  check(!(await pg.$("#cc-code")) && await pg.$("#unitgrid"), "other pages load with no code screen");
  const p2 = await c.newPage();
  await p2.goto(BASE + "start-tracking.html?from=home");
  await p2.waitForSelector("#st-qr svg");
  await p2.click("#st-start");
  await p2.waitForURL(BASE);
  const s = await p2.evaluate(() => JSON.parse(localStorage.getItem("pinkprint-tracking") || "null"));
  check(s && s.nickname && s.nicknameTicket, "tracking (and its /api calls) works after the code", s && s.nickname);

  const fresh = await b.newContext();
  const pf = await fresh.newPage();
  await pf.goto(BASE + "dashboard.html");
  check(/Enter class code/.test(await pf.textContent("h1")), "a new browser (or cleared cookies) is asked again");
  const api = await pf.evaluate(() => fetch("api/nicknames/taken", {method: "POST"}).then(r => r.status));
  check(api === 401, "the API refuses without the code", api);

  check(errors.length === 0, "no page errors", JSON.stringify(errors));
  await b.close();
  console.log(failures ? failures + " FAILED" : "all gate checks passed");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
