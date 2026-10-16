/* Owner's stats page (phase 6) in a real browser. Start servers.mjs first, then:
   node tests/sync/e2e-stats.js [screenshot folder]
   servers.mjs stands in for Cloudflare Access (its keys and signed tokens) and sets STATS_KEY.
   Checks that stats need a valid sign-in token and the right key, and what the page shows. */
const {chromium} = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const {Client} = require("pg");
const BASE = "http://localhost:8790/";
const ACCESS = "http://127.0.0.1:54400";
const KEY = "test-stats-key-0123456789-abcdefghijkl";
const OUT = process.argv[2] || require("os").tmpdir();
let failures = 0;
const check = (ok, label, extra) => { console.log((ok ? "ok   " : "FAIL ") + label + (extra !== undefined ? "  [" + extra + "]" : "")); if (!ok) failures++; };

(async () => {
  const db = new Client({host: "127.0.0.1", port: 54329, user: "postgres", database: "pp"});
  await db.connect();
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  await q("delete from public.class_tally; delete from public.challenges; delete from public.nickname_claims where ticket_hash is not null");
  await q("select public.set_stats_key($1)", [KEY]);
  /* Safety 001-010: 10 answers each, 001 missed 9 times ... 010 missed 0 times; 011 has only 4 answers */
  for (let i = 1; i <= 10; i++) await q("insert into public.class_tally values ($1, 10, $2)", ["nur114-u3-safety-" + String(i).padStart(3, "0"), 10 - i]);
  await q("insert into public.class_tally values ('nur114-u3-safety-011', 4, 4), ('nur114-u1-cbc-cmp-001', 6, 0), ('nur114-u9-gone-001', 50, 50)");
  /* All but 4 listed nicknames in use */
  const names = require("../../nursing-study-site/data/nicknames.json").names;
  for (const n of names.slice(4)) await q("insert into public.nickname_claims (nickname, ticket_hash) values ($1, md5(random()::text))", [n]);

  const token = async opts => (await fetch(ACCESS + "/test/access-token?" + new URLSearchParams(opts || {}))).text();
  const load = async headers => {
    const r = await fetch(BASE + "api/stats/load", {method: "POST", headers: Object.assign({"Content-Type": "application/json", Origin: BASE.slice(0, -1)}, headers), body: "{}"});
    return r.status + " " + JSON.stringify(await r.json()).slice(0, 80);
  };
  check(/^403 .*sign in/.test(await load({})), "no sign-in: refused", await load({}));
  check(/^403/.test(await load({"Cf-Access-Jwt-Assertion": await token({aud: "some-other-app"})})), "token for another app: refused");
  check(/^403/.test(await load({"Cf-Access-Jwt-Assertion": await token({iss: "https://someone-else.cloudflareaccess.com"})})), "token from another team: refused");
  check(/^403/.test(await load({"Cf-Access-Jwt-Assertion": await token({exp: Math.floor(Date.now() / 1000) - 60})})), "expired token: refused");
  const good = await token();
  const forged = good.split(".").slice(0, 2).join(".") + "." + Buffer.from("not a signature").toString("base64url");
  check(/^403/.test(await load({"Cf-Access-Jwt-Assertion": forged})), "token with a bad signature: refused");
  check(/^200/.test(await load({"Cf-Access-Jwt-Assertion": good})), "signed-in token: allowed");
  check(/^200/.test(await load({Cookie: "CF_Authorization=" + good})), "the Access cookie works too");

  // ---- The page ----
  const b = await chromium.launch();
  const errors = [];
  const c = await b.newContext({viewport: {width: 1200, height: 1000}, extraHTTPHeaders: {"Cf-Access-Jwt-Assertion": good}});
  await c.route(/jsdelivr|googleapis|gstatic/, r => r.abort());
  c.on("page", pg => pg.on("pageerror", e => errors.push(e.message)));
  const pg = await c.newPage();
  await pg.goto(BASE + "stats.html");
  await pg.waitForSelector("#st-missed table");
  const tiles = await pg.$$eval(".ms-tile", t => t.map(x => Array.from(x.children).map(c => c.textContent.trim()).join(" ")));
  check(/Answers counted 110/.test(tiles[0]), "answers counted (questions no longer on the site are left out)", tiles[0]);
  check(/Overall accuracy 55%/.test(tiles[1]), "overall accuracy", tiles[1]);
  check(/Questions with 5\+ answers 11 of/.test(tiles[2]), "questions with 5+ answers", tiles[2]);
  check(/Nicknames left 4 of 39/.test(tiles[4]) && await pg.$eval(".ms-tile:nth-child(5)", e => e.classList.contains("st-warn")), "warns when 5 or fewer nicknames are left", tiles[4]);
  const missed = await pg.$$eval("#st-missed tbody tr", rows => rows.map(r => r.querySelector(".st-where").textContent + " " + r.children[1].textContent + " " + r.children[2].textContent));
  check(/safety-001 90% 10$/.test(missed[0]) && /safety-002 80% 10$/.test(missed[1]), "most-missed first", missed.slice(0, 2).join(" | "));
  check(!missed.some(m => /safety-011/.test(m)), "a question with only 4 answers isn't listed");
  check(missed.length === 11, "11 questions listed", missed.length);
  const hard = await pg.$$eval("#st-hard tbody tr td:first-child", t => t.map(x => x.textContent));
  check(/^Safety/.test(hard[0]), "hardest topic: Safety", hard.join(" | "));
  await pg.selectOption("#st-unit", "1");
  check((await pg.$$eval("#st-missed tbody tr", r => r.length)) === 1, "unit filter");
  await pg.screenshot({path: OUT + "/stats.png", fullPage: true});

  // Wrong key in the database
  await q("select public.set_stats_key($1)", ["a-different-key-0123456789-abcdefghijkl"]);
  await pg.goto(BASE + "stats.html");
  await pg.waitForSelector(".tp-note");
  check(/doesn't match/.test(await pg.textContent(".tp-note")), "a mismatched key says so");
  await q("select public.set_stats_key($1)", [KEY]);

  // Not signed in (as on *.pages.dev)
  const c2 = await b.newContext();
  const p2 = await c2.newPage();
  await p2.goto(BASE + "stats.html");
  await p2.waitForSelector(".tp-note");
  check(/nursingschoolpinkprint\.com\/stats/.test(await p2.textContent(".tp-note")), "without sign-in the page shows no data, just where to sign in");

  check(errors.length === 0, "no page errors", JSON.stringify(errors));
  await b.close();
  await db.end();
  console.log(failures ? failures + " FAILED" : "all stats checks passed");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
