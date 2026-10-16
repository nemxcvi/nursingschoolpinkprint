/* Tests for the class-code gate in nursing-study-site/_worker.js.
   Run from the repo root:  node tests/gate.test.js
   (Node 18 or newer; nothing to install.) */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");

const SITE = path.join(__dirname, "../nursing-study-site");
const load = () => import(path.join(SITE, "_worker.js")).then(m => m.default);
const ASSETS = {fetch: req => new Response("page " + new URL(req.url).pathname, {status: 200})};
const env = code => (code ? {CLASS_CODE: code, ASSETS} : {ASSETS});
const get = (p, cookie) => new Request("https://nursingschoolpinkprint.com" + p, {headers: cookie ? {Cookie: cookie} : {}});
const post = (code, next) => new Request("https://nursingschoolpinkprint.com/class-code", {
  method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"},
  body: new URLSearchParams({code, next}).toString()
});
const cookieFrom = res => (res.headers.get("Set-Cookie") || "").split(";")[0];

test("routes: every page and data file goes through the worker; styles, scripts and images don't", () => {
  const r = JSON.parse(fs.readFileSync(path.join(SITE, "_routes.json"), "utf8"));
  assert.deepEqual(r.include, ["/*"]);
  assert.deepEqual(r.exclude, ["/assets/*", "/js/*"]);
});

test("no CLASS_CODE set: the site is open", async () => {
  const w = await load();
  assert.equal(await (await w.fetch(get("/unit-3-skin-wounds-diagnostics/"), env(null))).text(), "page /unit-3-skin-wounds-diagnostics/");
});

test("first visit to any page shows the code screen, keeping where they were going", async () => {
  const w = await load();
  const res = await w.fetch(get("/unit-3-skin-wounds-diagnostics/safety-quiz.html?x=1"), env("Pink Nurses 26"));
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /Enter class code/);
  assert.match(html, /name="next" value="\/unit-3-skin-wounds-diagnostics\/safety-quiz\.html\?x=1"/);
  assert.match(html, /og:image" content="https:\/\/nursingschoolpinkprint\.com\/assets\/og-image\.png/, "link previews still work");
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.doesNotMatch(html, /Pink Nurses/i, "the code itself never appears");
  const data = await w.fetch(get("/data/nur114/unit-3.json"), env("Pink Nurses 26"));
  assert.match(await data.text(), /Enter class code/, "quiz data is behind the code too");
  const api = await w.fetch(new Request("https://nursingschoolpinkprint.com/api/tally/add", {method: "POST", body: "{}"}), env("Pink Nurses 26"));
  assert.equal(api.status, 401);
});

test("wrong code: asked again with a message, no cookie", async () => {
  const w = await load();
  const res = await w.fetch(post("pink nurse 26", "/journal.html"), env("Pink Nurses 26"));
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("Set-Cookie"), null);
  const html = await res.text();
  assert.match(html, /isn't right/);
  assert.match(html, /name="next" value="\/journal\.html"/);
});

test("right code (any case, extra spaces): 1-year cookie and straight to the page", async () => {
  const w = await load();
  const res = await w.fetch(post("  pink   NURSES 26 ", "/journal.html?tab=bookmarks"), env("Pink Nurses 26"));
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("Location"), "/journal.html?tab=bookmarks");
  const sc = res.headers.get("Set-Cookie");
  assert.match(sc, /^pp_class=[0-9a-f]{64}; Max-Age=31536000; Path=\/; Secure; HttpOnly; SameSite=Lax$/);
  assert.doesNotMatch(sc, /pink|nurses/i, "the cookie holds a fingerprint, not the code");
  const page = await w.fetch(get("/journal.html", cookieFrom(res) + "; theme=dark"), env("Pink Nurses 26"));
  assert.equal(await page.text(), "page /journal.html", "with the cookie, pages load normally");
});

test("only sends people to pages on this site", async () => {
  const w = await load();
  for (const bad of ["//evil.example/x", "https://evil.example/", "/\\evil.example", "", "/class-code"]) {
    const res = await w.fetch(post("Pink Nurses 26", bad), env("Pink Nurses 26"));
    assert.equal(res.headers.get("Location"), "/", JSON.stringify(bad));
  }
});

test("changing the class code asks everyone again", async () => {
  const w = await load();
  const old = cookieFrom(await w.fetch(post("Pink Nurses 26", "/"), env("Pink Nurses 26")));
  const res = await w.fetch(get("/", old), env("Spring 27"));
  assert.match(await res.text(), /Enter class code/);
});
