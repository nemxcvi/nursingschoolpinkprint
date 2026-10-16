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
  ping: [[], "scalar"]
};

http.createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  fs.appendFileSync(LOG, JSON.stringify({url: req.url, headers: req.headers, body}) + "\n");
  const send = (s, o) => { res.writeHead(s, {"Content-Type": "application/json"}); res.end(JSON.stringify(o)); };
  if (req.headers.apikey !== KEY) return send(401, {message: "Invalid API key"});
  const fn = (req.url.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/) || [])[1];
  if (!FNS[fn]) return send(404, {message: "Could not find the function"});
  const [args, kind] = FNS[fn];
  const input = JSON.parse(body || "{}");
  const params = args.map(([n]) => input[n]);
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
