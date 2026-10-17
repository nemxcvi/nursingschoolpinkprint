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
/* Challenge answers: [{q: question id, ok: true|false}, ...], one per question (10, 20 or 40) */
const QUESTION_ID = /^nur[0-9]+-u[0-9]+-[a-z0-9-]+-[0-9]{3}$/;
function answers(v) {
  if (!Array.isArray(v) || ![10, 20, 40].includes(v.length) ||
      !v.every(a => a && typeof a.q === "string" && QUESTION_ID.test(a.q) && typeof a.ok === "boolean")) throw new BadRequest("bad answers");
  return v.map(a => ({q: a.q, ok: a.ok}));
}
class BadRequest extends Error {}

/* ---------- Class code ----------
   Making a new tracking code needs the class code (Cloudflare secret CLASS_CODE): a new code's
   first save (version 0) must carry it. Linking an existing code, and every later save, doesn't.
   Case and extra spaces don't matter. Without CLASS_CODE anyone can start tracking. */
function normCode(s) { return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " "); }
function classOk(env, typed) { return !env.CLASS_CODE || (normCode(typed) !== "" && normCode(typed) === normCode(env.CLASS_CODE)); }

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
  "vault/save":        {fn: "save_vault",
                        args: (b, ctx) => {
                          const version = int(b.version);
                          if (version === 0 && !classOk(ctx.env, b.classCode)) throw new BadRequest("class code needed");
                          return {p_lookup: hex64(b.lookup), p_data: text(b.data, 1500000), p_version: version};
                        }},
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
  /* With answers (Group focus) the score is counted from them; pages from before send a score only */
  "challenges/score":  {fn: b => Array.isArray(b.answers) ? "submit_answers" : "submit_score",
                        args: b => Array.isArray(b.answers)
                          ? {p_id: shortId(b.id), p_ticket: hex64(b.ticket), p_answers: answers(b.answers)}
                          : {p_id: shortId(b.id), p_ticket: hex64(b.ticket), p_score: int(b.score)},
                        /* Until the Supabase update is run, save the score the old way */
                        fallback: a => a.p_answers && {fn: "submit_score", args: {p_id: a.p_id, p_ticket: a.p_ticket, p_score: a.p_answers.filter(x => x.ok).length}}},
  "challenges/share":  {fn: "share_focus",       args: b => ({p_id: shortId(b.id), p_ticket: hex64(b.ticket), p_share: b.share === true})},
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
  /* Is a class code needed to start tracking, and is this one right? (answers only yes/no) */
  if (url.pathname === "/api/class/check") {
    let body = {};
    try { body = JSON.parse(await request.text() || "{}") || {}; } catch (e) {}
    return reply(200, {result: {required: !!env.CLASS_CODE, ok: classOk(env, body.code)}});
  }
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
      env,
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
  let fn = typeof route.fn === "function" ? route.fn(JSON.parse(raw || "{}") || {}) : route.fn;
  const rpc = (name, body) => fetch(env.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/rpc/" + name, {
    method: "POST", headers, body: JSON.stringify(body)
  });
  let res;
  try {
    res = await rpc(fn, args);
    /* 404 = the database function doesn't exist yet */
    const fb = res.status === 404 && route.fallback && route.fallback(args);
    if (fb) { fn = fb.fn; res = await rpc(fn, fb.args); }
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
  return reply(200, {result: flatten(fn, data)});
}

/* ---------- Library (shared resources) ----------
   Files live in the R2 bucket bound as LIBRARY, under the id of their row in shared_files.
   Every call carries the student's lookup ID; the database only answers for real tracking codes.
   Downloads: /api/library/link (tracking code checked) returns a short-lived signed address,
   /api/library/file/<id>?t=... serves the file as an attachment. The owner's hidden page
   /library-admin uses the Cloudflare secret LIBRARY_ADMIN_KEY (the same key saved in Supabase
   with set_library_admin_key) and is linked from nowhere. */
const LIB_MAX = 20 * 1024 * 1024;
const LIB_TYPES = {
  pdf: {mime: "application/pdf", label: "PDF"},
  jpg: {mime: "image/jpeg", label: "JPG"},
  png: {mime: "image/png", label: "PNG"},
  webp: {mime: "image/webp", label: "WEBP"},
  heic: {mime: "image/heic", label: "HEIC"},
  doc: {mime: "application/msword", label: "Word"},
  docx: {mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word"}
};
const LIB_BAD_TYPE = "Only PDF, JPG, PNG, WEBP, HEIC and Word (.doc, .docx) files can be shared. That file isn't one of those.";
function bytesAt(b, i, list) { return list.every((v, k) => b[i + k] === v); }
function asciiAt(b, i, str) { return bytesAt(b, i, [...str].map(c => c.charCodeAt(0))); }
function hasBytes(b, needle, limit) {
  const n = needle.length, end = Math.min(b.length, limit || b.length) - n;
  outer: for (let i = 0; i <= end; i++) {
    for (let k = 0; k < n; k++) if (b[i + k] !== needle[k]) continue outer;
    return true;
  }
  return false;
}
/* What the file really is, from its first bytes (never the name). Returns a LIB_TYPES key or null. */
function sniffFile(buf) {
  const b = new Uint8Array(buf);
  if (b.length < 12) return null;
  if (asciiAt(b, 0, "%PDF-")) return "pdf";
  if (bytesAt(b, 0, [0xFF, 0xD8, 0xFF])) return "jpg";
  if (bytesAt(b, 0, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return "png";
  if (asciiAt(b, 0, "RIFF") && asciiAt(b, 8, "WEBP")) return "webp";
  if (asciiAt(b, 4, "ftyp") && ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].some(brand => asciiAt(b, 8, brand))) return "heic";
  /* Old Word: an OLE container holding a "WordDocument" stream (excel/powerpoint files don't) */
  if (bytesAt(b, 0, [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]) &&
      hasBytes(b, [..."WordDocument"].flatMap(c => [c.charCodeAt(0), 0]))) return "doc";
  /* Word: a zip holding word/document.xml */
  if (bytesAt(b, 0, [0x50, 0x4B, 0x03, 0x04]) && hasBytes(b, [..."word/document.xml"].map(c => c.charCodeAt(0)))) return "docx";
  return null;
}
/* A safe file name with the extension that matches what the file really is */
function libFileName(name, ext) {
  let base = String(name || "").replace(/^.*[\\/]/, "").replace(/\.[A-Za-z0-9]{1,5}$/, "");
  base = base.replace(/[\u0000-\u001f\u007f"<>|*?:\\/]/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
  return (base || "file") + "." + ext;
}
async function rpc(env, fn, args) {
  const key = env.SUPABASE_KEY;
  const headers = {"Content-Type": "application/json", apikey: key};
  if (!key.startsWith("sb_")) headers.Authorization = "Bearer " + key;
  const res = await fetch(env.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/rpc/" + fn, {method: "POST", headers, body: JSON.stringify(args)});
  const out = await res.text();
  let data = null;
  try { data = out ? JSON.parse(out) : null; } catch (e) {}
  if (!res.ok) { const e = new Error(data && typeof data.message === "string" ? data.message : "storage error"); e.status = res.status; throw e; }
  return data;
}
function libError(err) {
  const m = err && err.message || "";
  if (m === "not tracking") return reply(403, {error: "Start tracking to use the Library."});
  if (m === "upload limit") return reply(429, {error: "That's a lot of uploads at once. Try again in an hour."});
  if (m === "not allowed") return reply(403, {error: "not allowed"});
  if (err instanceof BadRequest) return reply(400, {error: m});
  return reply(err && err.status >= 500 ? 502 : 400, {error: m.slice(0, 120) || "storage error"});
}
function b64url(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function unb64url(s) { return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0)); }
async function signKey(env) {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("pinkprint-library-v1:" + env.SUPABASE_KEY));
  return crypto.subtle.importKey("raw", raw, {name: "HMAC", hash: "SHA-256"}, false, ["sign", "verify"]);
}
/* A download address good for 2 minutes */
async function fileLink(env, f) {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({i: f.id, n: f.file_name, m: f.mime, e: Math.floor(Date.now() / 1000) + 120})));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await signKey(env), new TextEncoder().encode(payload)));
  return "/api/library/file/" + f.id + "?t=" + payload + "." + b64url(sig);
}
async function serveFile(env, url) {
  const id = url.pathname.split("/").pop();
  const [payload, sig] = String(url.searchParams.get("t") || "").split(".");
  let p = null;
  try {
    if (payload && sig && await crypto.subtle.verify("HMAC", await signKey(env), unb64url(sig), new TextEncoder().encode(payload))) {
      p = JSON.parse(new TextDecoder().decode(unb64url(payload)));
    }
  } catch (e) {}
  if (!p || p.i !== id || !(p.e > Date.now() / 1000)) return new Response("This download link has expired. Go back to the Library and tap Download again.", {status: 403, headers: {"Content-Type": "text/plain; charset=utf-8"}});
  if (!env.LIBRARY) return new Response("File storage is not set up", {status: 503});
  const obj = await env.LIBRARY.get(id);
  if (!obj) return new Response("That file was deleted.", {status: 404, headers: {"Content-Type": "text/plain; charset=utf-8"}});
  const ascii = p.n.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(obj.body, {headers: {
    "Content-Type": p.m, "Content-Length": String(obj.size),
    "Content-Disposition": 'attachment; filename="' + ascii + "\"; filename*=UTF-8''" + encodeURIComponent(p.n),
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"
  }});
}
function libTags(raw, topics) {
  let v;
  try { v = JSON.parse(raw); } catch (e) { v = null; }
  const re = topics ? /^(all|[a-z0-9]{2,12}:U-\d{2}:[a-z0-9-]{1,60})$/ : /^(all|[a-z0-9]{2,12}:U-\d{2})$/;
  if (!Array.isArray(v) || v.length < 1 || v.length > 30 || !v.every(t => typeof t === "string" && re.test(t))) {
    throw new BadRequest(topics ? "Pick at least one topic (or All topics)." : "Pick at least one unit (or All units).");
  }
  return v.includes("all") ? ["all"] : [...new Set(v)];
}
async function libUpload(request, env) {
  const len = +(request.headers.get("Content-Length") || 0);
  if (len > LIB_MAX + 256 * 1024) return reply(413, {error: "Files can be up to 20 MB. That one is " + (len / 1048576).toFixed(1) + " MB."});
  const form = await request.formData().catch(() => null);
  if (!form) throw new BadRequest("bad upload");
  const lookup = hex64(form.get("lookup"));
  const file = form.get("file");
  if (!file || typeof file === "string" || !file.size) throw new BadRequest("Choose a file to share.");
  if (file.size > LIB_MAX) return reply(413, {error: "Files can be up to 20 MB. That one is " + (file.size / 1048576).toFixed(1) + " MB."});
  const title = String(form.get("title") || "").trim();
  if (title.length < 1 || title.length > 120) throw new BadRequest("Give the file a title (up to 120 characters).");
  const description = String(form.get("description") || "").trim();
  if (description.length > 500) throw new BadRequest("Keep the description to 500 characters.");
  const units = libTags(form.get("units"), false), topics = libTags(form.get("topics"), true);
  const show = form.get("show");
  const name = show === "name" ? String(form.get("name") || "").trim() : "";
  if (show !== "name" && show !== "anon") throw new BadRequest("Choose Show my name or Anonymous.");
  if (show === "name" && (name.length < 1 || name.length > 40)) throw new BadRequest("Type the name to show (up to 40 characters), or choose Anonymous.");
  if (form.get("noPatientInfo") !== "yes" || form.get("noExamContent") !== "yes") throw new BadRequest("Tick both boxes to confirm the file follows the sharing rules.");
  const buf = await file.arrayBuffer();
  const kind = sniffFile(buf);
  if (!kind) throw new BadRequest(LIB_BAD_TYPE);
  const t = LIB_TYPES[kind];
  const fileName = libFileName(file.name, kind);
  const id = await rpc(env, "lib_add", {p_lookup: lookup, p_title: title, p_description: description, p_units: units, p_topics: topics,
                                         p_display_name: name, p_file_name: fileName, p_mime: t.mime, p_size: buf.byteLength});
  try {
    await env.LIBRARY.put(id, buf, {httpMetadata: {contentType: t.mime}});
  } catch (e) {
    await rpc(env, "lib_delete", {p_lookup: lookup, p_id: id}).catch(() => {});
    return reply(502, {error: "Couldn't store the file. Try again."});
  }
  return reply(200, {result: {id, file_name: fileName, mime: t.mime, size: buf.byteLength}});
}
function adminOk(env, key) {
  return !!env.LIBRARY_ADMIN_KEY && typeof key === "string" && key.length === env.LIBRARY_ADMIN_KEY.length &&
         [...key].reduce((d, c, i) => d | (c.charCodeAt(0) ^ env.LIBRARY_ADMIN_KEY.charCodeAt(i)), 0) === 0;
}
async function handleLibrary(request, env, url) {
  const action = url.pathname.slice("/api/library/".length);
  if (request.method === "GET" && action.startsWith("file/")) return serveFile(env, url);
  if (request.method !== "POST") return reply(405, {error: "POST only"});
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return reply(403, {error: "wrong origin"});
  const missing = ["SUPABASE_URL", "SUPABASE_KEY"].filter(k => !env[k]);
  if (!env.LIBRARY) missing.push("LIBRARY");
  if (missing.length) return reply(503, {error: "the Library is not set up", missing});
  try {
    if (action === "upload") return await libUpload(request, env);
    const raw = await request.text();
    if (raw.length > 10000) return reply(413, {error: "too large"});
    let b;
    try { b = JSON.parse(raw || "{}") || {}; } catch (e) { throw new BadRequest("bad request"); }
    const uuid = v => { if (typeof v !== "string" || !/^[0-9a-f-]{36}$/.test(v)) throw new BadRequest("bad id"); return v; };
    if (action === "list") return reply(200, {result: await rpc(env, "lib_list", {p_lookup: hex64(b.lookup)})});
    if (action === "link") {
      const f = await rpc(env, "lib_get", {p_lookup: hex64(b.lookup), p_id: uuid(b.id)});
      if (!f) return reply(404, {error: "That file was deleted."});
      return reply(200, {result: {url: await fileLink(env, f)}});
    }
    if (action === "delete") {
      const id = uuid(b.id);
      const ok = await rpc(env, "lib_delete", {p_lookup: hex64(b.lookup), p_id: id});
      if (ok) await env.LIBRARY.delete(id);
      return reply(200, {result: !!ok});
    }
    if (action === "admin/list" || action === "admin/delete") {
      if (!adminOk(env, b.key)) return reply(403, {error: "not allowed"});
      if (action === "admin/list") {
        const rows = await rpc(env, "lib_admin_list", {p_key: env.LIBRARY_ADMIN_KEY});
        for (const r of rows) r.url = await fileLink(env, r);
        return reply(200, {result: rows});
      }
      const id = uuid(b.id);
      const ok = await rpc(env, "lib_admin_delete", {p_key: env.LIBRARY_ADMIN_KEY, p_id: id});
      if (ok) await env.LIBRARY.delete(id);
      return reply(200, {result: !!ok});
    }
    return reply(404, {error: "unknown"});
  } catch (err) {
    return libError(err);
  }
}
/* The owner's page for removing any file. Linked from nowhere; useless without LIBRARY_ADMIN_KEY. */
function adminPage() {
  return new Response(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow"><title>Library files</title>
<link rel="stylesheet" href="/assets/style.css">
<style>
body{padding:24px 16px;}main{max-width:880px;margin:0 auto;display:flex;flex-direction:column;gap:16px;font-family:'IBM Plex Sans',system-ui,sans-serif;color:var(--text);}
h1{font-family:'Young Serif',Georgia,serif;font-weight:400;color:var(--heading);margin:0;}
form,li{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}input{flex:1 1 240px;min-height:44px;padding:0 12px;border:1.5px solid var(--border);background:var(--card);color:var(--text);font:inherit;}
button{min-height:40px;padding:0 14px;border:1.5px solid var(--border);background:var(--card);color:var(--label);cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:12px;text-transform:uppercase;}
ul{list-style:none;margin:0;padding:0;}li{justify-content:space-between;padding:10px 0;border-top:1.5px solid var(--soft);}li span{flex:1 1 300px;}small{color:var(--text2);}
</style></head><body><main>
<h1>Library files</h1>
<form id="f"><input id="k" type="password" placeholder="Admin key" autocomplete="off"><button>Show files</button></form>
<p id="m"></p><ul id="l"></ul>
</main><script>
var key = sessionStorage.getItem("libAdmin") || "";
function post(a, b){ b.key = key; return fetch("/api/library/" + a, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(b)}).then(function(r){ return r.json(); }); }
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
function load(){
  post("admin/list", {}).then(function(r){
    if (!r.result){ document.getElementById("m").textContent = r.error || "Not allowed"; return; }
    sessionStorage.setItem("libAdmin", key);
    document.getElementById("m").textContent = r.result.length + " files";
    document.getElementById("l").innerHTML = r.result.map(function(f){
      return '<li data-id="' + f.id + '"><span><b>' + esc(f.title) + '</b><br><small>' + esc(f.name || "Anonymous") + " · " + esc(f.file_name) + " · " + Math.ceil(f.size / 1024) + " KB · " + new Date(f.created_at).toLocaleDateString() + '</small></span><a href="' + f.url + '">Download</a><button type="button">Delete</button></li>';
    }).join("");
  });
}
document.getElementById("f").addEventListener("submit", function(e){ e.preventDefault(); key = document.getElementById("k").value; load(); });
document.getElementById("l").addEventListener("click", function(e){
  if (e.target.tagName !== "BUTTON") return;
  var li = e.target.closest("li");
  if (!confirm("Delete this file for everyone?")) return;
  post("admin/delete", {id: li.getAttribute("data-id")}).then(function(r){ if (r.result) li.remove(); else alert(r.error || "Not deleted"); });
});
if (key) load();
</script></body></html>`, {headers: {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "X-Content-Type-Options": "nosniff"}});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/library/")) return handleLibrary(request, env, url);
    if (url.pathname === "/library-admin") return adminPage();
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);
    /* Challenge links: /c/<ID> opens the Challenges page for that challenge */
    const c = url.pathname.match(/^\/c\/([^/]+)\/?$/);
    if (c && SHORT_ID.test(c[1])) return Response.redirect(url.origin + "/challenges.html?join=" + c[1].toUpperCase(), 302);
    return env.ASSETS.fetch(request);
  }
};
