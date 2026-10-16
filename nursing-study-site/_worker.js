/* The site's only door to Supabase (Cloudflare Pages advanced mode). _routes.json sends only
   /api/* (and the short challenge links /c/*) here; every other request is a normal static file
   and never runs this code.

   The Supabase URL and publishable key are Cloudflare variables (SUPABASE_URL, SUPABASE_KEY),
   never in the repo, so browsers can't reach Supabase directly and the /api/ rate limit can't
   be bypassed. Each route checks its input and calls one database function. */

const HEX64 = /^[0-9a-f]{64}$/;
const SHORT_ID = /^(?:[2-9A-HJ-NP-Za-hj-np-z]{4}|[2-9A-HJ-NP-Za-hj-np-z]{8})$/;   /* challenge codes: 4 characters (8 for early ones), no 0/O, 1/I/L */
const MAX_BODY = 1600000;

function hex64(v) {
  if (typeof v !== "string" || !HEX64.test(v)) throw new BadRequest("bad id");
  return v;
}
function text(v, max) {
  if (typeof v !== "string" || v.length < 1 || v.length > max) throw new BadRequest("bad text");
  return v;
}
function int(v) {
  if (!Number.isInteger(v) || v < 0) throw new BadRequest("bad version");
  return v;
}
function shortId(v) {
  if (typeof v !== "string" || !SHORT_ID.test(v)) throw new BadRequest("bad challenge id");
  return v.toUpperCase();
}
class BadRequest extends Error {}

/* Nicknames must come from the site's own list (data/nicknames.json) */
let namesCache = null;
async function listedNames(env, origin) {
  if (!namesCache || Date.now() - namesCache.at > 10 * 60 * 1000) {
    const res = await env.ASSETS.fetch(new Request(origin + "/data/nicknames.json"));
    if (!res.ok) throw new Error("nickname list unavailable");
    namesCache = {at: Date.now(), names: new Set((await res.json()).names)};
  }
  return namesCache.names;
}

/* Question IDs must exist on the site (data/nur114/index.json and its unit files) */
let questionsCache = null;
async function listedQuestions(env, origin) {
  if (!questionsCache || Date.now() - questionsCache.at > 10 * 60 * 1000) {
    const get = async p => {
      const res = await env.ASSETS.fetch(new Request(origin + p));
      if (!res.ok) throw new Error("question list unavailable");
      return res.json();
    };
    const index = await get("/data/nur114/index.json");
    const units = await Promise.all(index.units.map(n => get("/data/nur114/unit-" + n + ".json")));
    const ids = new Set();
    units.forEach(u => u.questions.forEach(q => ids.add(q.id)));
    questionsCache = {at: Date.now(), ids};
  }
  return questionsCache.ids;
}

/* ---------- Owner sign-in for the stats page ----------
   Cloudflare Access (team pinkprint, app "Pinkprint stats") guards /stats* and /api/stats/* on
   nursingschoolpinkprint.com. Access sends a signed token with each request; it's checked again
   here so the stats can't be read any other way (for example through *.pages.dev). Neither
   value is secret. Tests point them at a local stand-in. */
const ACCESS_TEAM = "https://pinkprint.cloudflareaccess.com";
const ACCESS_AUD = "84b4d833d008997b65e5bf553d01d860920968230bad0c36b99b4f14bf736a24";
let certsCache = null;
function b64urlBytes(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
async function accessKeys(team) {
  if (!certsCache || certsCache.team !== team || Date.now() - certsCache.at > 60 * 60 * 1000) {
    const res = await fetch(team + "/cdn-cgi/access/certs");
    if (!res.ok) throw new Error("certs unavailable");
    certsCache = {team, at: Date.now(), keys: (await res.json()).keys || []};
  }
  return certsCache.keys;
}
/* Resolves with the signed-in email, or null */
async function accessUser(request, env) {
  const team = env.ACCESS_TEAM || ACCESS_TEAM, aud = (env.ACCESS_AUD || ACCESS_AUD).split(",");
  const cookie = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  const token = request.headers.get("Cf-Access-Jwt-Assertion") || (cookie && cookie[1]);
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64urlBytes(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(b64urlBytes(parts[1])));
    if (header.alg !== "RS256") return null;
    const jwk = (await accessKeys(team)).find(k => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, {name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"}, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
    const auds = [].concat(claims.aud || []);
    const now = Date.now() / 1000;
    if (!ok || claims.iss !== team || !auds.some(a => aud.includes(a)) || !(claims.exp > now) || (claims.nbf && claims.nbf > now + 60)) return null;
    return claims.email || "signed in";
  } catch (e) {
    return null;
  }
}

const ROUTES = {
  "vault/load":        {fn: "load_vault",       args: b => ({p_lookup: hex64(b.lookup)})},
  "vault/save":        {fn: "save_vault",       args: b => ({p_lookup: hex64(b.lookup), p_data: text(b.data, 1500000), p_version: int(b.version)})},
  "vault/delete":      {fn: "delete_vault",     args: b => ({p_lookup: hex64(b.lookup)})},
  "nicknames/taken":   {fn: "taken_nicknames",  args: () => ({})},
  "nicknames/claim":   {fn: "claim_nickname",   names: true,
                        args: (b, names) => {
                          if (!names.has(b.nickname)) throw new BadRequest("not a listed nickname");
                          return {p_nickname: b.nickname, p_ticket: hex64(b.ticket)};
                        }},
  "nicknames/release": {fn: "release_nickname", args: b => ({p_nickname: text(b.nickname, 40), p_ticket: hex64(b.ticket)})},

  /* Challenges (phase 6) */
  "challenges/create": {fn: "create_challenge",  questions: true,
                        args: (b, ctx) => {
                          const qs = b.questions;
                          if (!Array.isArray(qs) || ![10, 20, 40].includes(qs.length) || new Set(qs).size !== qs.length ||
                              !qs.every(q => ctx.questions.has(q))) throw new BadRequest("bad questions");
                          return {p_title: text(b.title, 120), p_questions: qs, p_creator_ticket: hex64(b.ticket),
                                  p_nickname: text(b.nickname, 40), p_proof: text(b.proof, 200)};
                        }},
  "challenges/join":   {fn: "join_challenge",    args: b => ({p_id: shortId(b.id), p_ticket: hex64(b.ticket), p_nickname: text(b.nickname, 40), p_proof: text(b.proof, 200)})},
  "challenges/score":  {fn: "submit_score",      args: b => ({p_id: shortId(b.id), p_ticket: hex64(b.ticket), p_score: int(b.score)})},
  "challenges/load":   {fn: "load_challenge",    args: b => ({p_id: shortId(b.id), p_ticket: b.ticket == null ? null : hex64(b.ticket)})},
  "challenges/delete": {fn: "delete_challenge",  args: b => ({p_id: shortId(b.id), p_creator_ticket: hex64(b.ticket)})},

  /* Owner's stats page: only after the Access sign-in, and only with the STATS_KEY secret */
  "stats/load":        {fn: "class_stats",       owner: true, args: (b, ctx) => ({p_key: ctx.statsKey})},

  /* Class tally: question IDs and right/wrong only. Unknown IDs are dropped. */
  "tally/add":         {fn: "increment_tally",   questions: true,
                        args: (b, ctx) => {
                          if (!Array.isArray(b.answers) || b.answers.length < 1 || b.answers.length > 50) throw new BadRequest("bad answers");
                          const answers = b.answers
                            .filter(a => a && ctx.questions.has(a.q) && typeof a.ok === "boolean")
                            .map(a => ({q: a.q, ok: a.ok}));
                          if (!answers.length) throw new Skip(0);
                          return {p_answers: answers};
                        }}
};
class Skip { constructor(result) { this.result = result; } }

function reply(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {"Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}
  });
}

/* PostgREST returns sets of single values as [{fn: value}, ...]; flatten those to [value, ...] */
function flatten(fn, data) {
  if (Array.isArray(data) && data.length && data.every(r => r && typeof r === "object" && Object.keys(r).length === 1 && fn in r)) {
    return data.map(r => r[fn]);
  }
  return data;
}

async function handleApi(request, env, url) {
  if (request.method !== "POST") return reply(405, {error: "POST only"});
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return reply(403, {error: "wrong origin"});
  const route = ROUTES[url.pathname.slice(5)];
  if (!route) return reply(404, {error: "unknown"});
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    /* Names only (never values), to help spot a missing Cloudflare variable */
    const missing = ["SUPABASE_URL", "SUPABASE_KEY"].filter(k => !env[k]);
    return reply(503, {error: "sync is not set up", missing});
  }

  let statsKey = null;
  if (route.owner) {
    if (!(await accessUser(request, env))) return reply(403, {error: "sign in at nursingschoolpinkprint.com/stats"});
    if (!env.STATS_KEY) return reply(503, {error: "stats key is not set up", missing: ["STATS_KEY"]});
    statsKey = env.STATS_KEY;
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) return reply(413, {error: "too large"});
  let args;
  try {
    const body = raw ? JSON.parse(raw) : {};
    const ctx = {
      statsKey,
      names: route.names ? await listedNames(env, url.origin) : null,
      questions: route.questions ? await listedQuestions(env, url.origin) : null
    };
    args = route.args(body || {}, route.names ? ctx.names : ctx);
  } catch (err) {
    if (err instanceof Skip) return reply(200, {result: err.result});
    return reply(400, {error: err instanceof BadRequest ? err.message : "bad request"});
  }

  const key = env.SUPABASE_KEY;
  const headers = {"Content-Type": "application/json", apikey: key};
  if (!key.startsWith("sb_")) headers.Authorization = "Bearer " + key;   /* older JWT-style anon keys */
  let res;
  try {
    res = await fetch(env.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/rpc/" + route.fn, {
      method: "POST", headers, body: JSON.stringify(args)
    });
  } catch (err) {
    return reply(502, {error: "storage unreachable"});
  }
  const out = await res.text();
  let data = null;
  try { data = out ? JSON.parse(out) : null; } catch (e) {}
  if (!res.ok) {
    const msg = data && data.message;
    return reply(res.status >= 500 ? 502 : 400, {error: typeof msg === "string" ? msg.slice(0, 120) : "storage error"});
  }
  return reply(200, {result: flatten(route.fn, data)});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);
    /* Challenge links: /c/<ID> opens the Challenges page for that challenge */
    const c = url.pathname.match(/^\/c\/([^/]+)\/?$/);
    if (c && SHORT_ID.test(c[1])) return Response.redirect(url.origin + "/challenges.html?join=" + c[1].toUpperCase(), 302);
    return env.ASSETS.fetch(request);
  }
};
