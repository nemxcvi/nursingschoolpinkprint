/* The site's only door to Supabase (Cloudflare Pages advanced mode). _routes.json sends only
   /api/* here; every other request is a normal static file and never runs this code.

   The Supabase URL and publishable key are Cloudflare variables (SUPABASE_URL, SUPABASE_KEY),
   never in the repo, so browsers can't reach Supabase directly and the /api/ rate limit can't
   be bypassed. Each route checks its input and calls one database function. */

const HEX64 = /^[0-9a-f]{64}$/;
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
  "nicknames/release": {fn: "release_nickname", args: b => ({p_nickname: text(b.nickname, 40), p_ticket: hex64(b.ticket)})}
};

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
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return reply(503, {error: "sync is not set up"});

  const raw = await request.text();
  if (raw.length > MAX_BODY) return reply(413, {error: "too large"});
  let args;
  try {
    const body = raw ? JSON.parse(raw) : {};
    args = route.args(body || {}, route.names ? await listedNames(env, url.origin) : null);
  } catch (err) {
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
    return env.ASSETS.fetch(request);
  }
};
