/* Local test stand-ins:
   - "Supabase" on :54400: POST /rest/v1/rpc/<fn> runs the real database function in the local
     Postgres as the anon role (like PostgREST does), after checking the apikey header.
   - "Cloudflare Pages" on :8790: serves nursing-study-site/ as static files; /api/* (per
     _routes.json) goes to the real _worker.js with SUPABASE_URL / SUPABASE_KEY / ASSETS.
   Every request body that reaches "Supabase" is logged (in the temp folder) for checks.

   How to run (see e2e-sync.js): a local Postgres 16 on 127.0.0.1:54329 with a database "pp"
   set up like Supabase (roles anon/authenticated, schema extensions) and supabase/setup.sql
   applied; the "pg" package installed in a folder you pass as PG_MODULES (e.g. PG_MODULES=/tmp/pg node servers.mjs); Playwright for the browser test. */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {createRequire} from "node:module";
import crypto from "node:crypto";
/* "pg" from wherever it is installed: PG_MODULES=<folder containing node_modules> */
const pg = createRequire(process.env.PG_MODULES ? path.join(process.env.PG_MODULES, "x.js") : import.meta.url)("pg");

const SITE = new URL("../../nursing-study-site/", import.meta.url).pathname.replace(/\/$/, "");
const KEY = "sb_publishable_localtest";
const LOG = path.join(os.tmpdir(), "pinkprint-rpc-log.jsonl");
fs.writeFileSync(LOG, "");

const pool = new pg.Pool({host: "127.0.0.1", port: 54329, user: "postgres", database: "pp", max: 4});
/* fn -> [[arg, sql type], ...], and whether it returns rows */
const FNS = {
  load_vault: [[["p_lookup", "text"]], "rows"],
  save_vault: [[["p_lookup", "text"], ["p_data", "text"], ["p_version", "int"]], "rows"],
  delete_vault: [[["p_lookup", "text"]], "scalar"],
  taken_nicknames: [[], "setof"],
  claim_nickname: [[["p_nickname", "text"], ["p_ticket", "text"]], "scalar"],
  release_nickname: [[["p_nickname", "text"], ["p_ticket", "text"]], "scalar"],
  create_challenge: [[["p_title", "text"], ["p_questions", "jsonb"], ["p_creator_ticket", "text"], ["p_nickname", "text"], ["p_proof", "text"]], "scalar"],
  join_challenge: [[["p_id", "text"], ["p_ticket", "text"], ["p_nickname", "text"], ["p_proof", "text"]], "rows"],
  submit_score: [[["p_id", "text"], ["p_ticket", "text"], ["p_score", "int"]], "scalar"],
  load_challenge: [[["p_id", "text"], ["p_ticket", "text"]], "scalar"],
  delete_challenge: [[["p_id", "text"], ["p_creator_ticket", "text"]], "scalar"],
  increment_tally: [[["p_answers", "jsonb"]], "scalar"],
  class_stats: [[["p_key", "text"]], "scalar"],
  ping: [[], "scalar"]
};

/* Stand-in for Cloudflare Access: its signing keys, and a test-only way to get a signed token
   (GET /test/access-token?aud=...&email=...). The worker is pointed here with ACCESS_TEAM. */
const ACCESS_TEAM = "http://127.0.0.1:54400", ACCESS_AUD = "test-aud", STATS_KEY = "test-stats-key-0123456789-abcdefghijkl";
const {privateKey, publicKey} = crypto.generateKeyPairSync("rsa", {modulusLength: 2048});
const KID = "test-kid";
const b64url = b => Buffer.from(b).toString("base64url");
function accessToken({aud = ACCESS_AUD, email = "owner@example.com", iss = ACCESS_TEAM, exp = Math.floor(Date.now() / 1000) + 3600} = {}) {
  const head = b64url(JSON.stringify({alg: "RS256", kid: KID, typ: "JWT"}));
  const claims = b64url(JSON.stringify({aud: [aud], email, iss, exp, iat: Math.floor(Date.now() / 1000), type: "app"}));
  return head + "." + claims + "." + b64url(crypto.sign("sha256", Buffer.from(head + "." + claims), privateKey));
}

http.createServer(async (req, res) => {
  if (req.url === "/cdn-cgi/access/certs") {
    res.writeHead(200, {"Content-Type": "application/json"});
    return res.end(JSON.stringify({keys: [{...publicKey.export({format: "jwk"}), kid: KID, alg: "RS256", use: "sig"}]}));
  }
  if (req.url.startsWith("/test/access-token")) {
    const q = new URL(req.url, ACCESS_TEAM).searchParams;
    res.writeHead(200, {"Content-Type": "text/plain"});
    return res.end(accessToken({aud: q.get("aud") || undefined, iss: q.get("iss") || undefined, exp: q.get("exp") ? +q.get("exp") : undefined}));
  }
  let body = "";
  for await (const c of req) body += c;
  fs.appendFileSync(LOG, JSON.stringify({url: req.url, headers: req.headers, body}) + "\n");
  const send = (s, o) => { res.writeHead(s, {"Content-Type": "application/json"}); res.end(JSON.stringify(o)); };
  if (req.headers.apikey !== KEY) return send(401, {message: "Invalid API key"});
  const fn = (req.url.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/) || [])[1];
  if (!FNS[fn]) return send(404, {message: "Could not find the function"});
  const [args, kind] = FNS[fn];
  const input = JSON.parse(body || "{}");
  const params = args.map(([n, t]) => t === "jsonb" && input[n] != null ? JSON.stringify(input[n]) : input[n]);
  const call = `public.${fn}(${args.map(([n, t], i) => `${n} => $${i + 1}::${t}`).join(", ")})`;
  const sql = kind === "rows" ? `select * from ${call}` : kind === "setof" ? `select v as ${fn} from ${call} v` : `select ${call} as v`;
  const client = await pool.connect();
  try {
    await client.query("set role anon");
    const r = await client.query(sql, params);
    send(200, kind === "scalar" ? r.rows[0].v : r.rows);
  } catch (err) {
    send(400, {code: err.code, message: err.message});
  } finally {
    await client.query("reset role").catch(() => {});
    client.release();
  }
}).listen(54400, "127.0.0.1");

const worker = (await import(path.join(SITE, "_worker.js"))).default;
const routes = JSON.parse(fs.readFileSync(path.join(SITE, "_routes.json"), "utf8"));
const TYPES = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg"};
function staticFile(urlPath) {
  let p = decodeURIComponent(urlPath);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(SITE, p);
  if (!file.startsWith(SITE) || /\/_worker\.js$|\/_routes\.json$/.test(file) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return new Response("not found", {status: 404});
  }
  return new Response(fs.readFileSync(file), {headers: {"Content-Type": TYPES[path.extname(file)] || "application/octet-stream"}});
}
const env = {
  SUPABASE_URL: process.env.NO_SUPABASE ? "" : "http://127.0.0.1:54400",
  SUPABASE_KEY: KEY,
  ACCESS_TEAM, ACCESS_AUD,
  STATS_KEY: process.env.NO_STATS_KEY ? "" : STATS_KEY,
  ASSETS: {fetch: req => staticFile(new URL(req.url).pathname)}
};
const matches = (p, pat) => pat.endsWith("/*") ? p.startsWith(pat.slice(0, -1)) : p === pat;

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:8790");
  let response;
  if (routes.include.some(pat => matches(url.pathname, pat)) && !routes.exclude.some(pat => matches(url.pathname, pat))) {
    let body = "";
    for await (const c of req) body += c;
    const request = new Request(url, {method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body});
    response = await worker.fetch(request, env);
  } else {
    response = staticFile(url.pathname);
  }
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(8790, "127.0.0.1");
console.log("servers up");
