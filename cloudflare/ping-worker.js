/* Keep-alive for the free Supabase project, which pauses after 7 days without activity.
   A separate Cloudflare Worker (not part of the Pages site) on a schedule: Monday and Thursday.
   It calls the ping() database function, which also deletes challenges 7 days after they
   expire and frees nicknames unused for a year.

   Setup: paste this into a new Worker, add the variables SUPABASE_URL (text) and SUPABASE_KEY
   (secret: the publishable/anon key, never the secret/service_role key), then add the cron
   trigger "0 15 * * 1,4". Free plan. */
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(ping(env));
  },

  /* Visiting the Worker's own address runs a ping too, so you can check it works */
  async fetch(request, env) {
    try {
      const at = await ping(env);
      return new Response("Supabase is awake: " + at + "\n");
    } catch (err) {
      return new Response(String(err.message) + "\n", {status: 502});
    }
  }
};

async function ping(env) {
  const key = env.SUPABASE_KEY;
  const headers = {"Content-Type": "application/json", apikey: key};
  /* Older "anon" keys are JWTs and also go in Authorization; newer sb_publishable_ keys don't */
  if (!key.startsWith("sb_")) headers.Authorization = "Bearer " + key;
  const res = await fetch(env.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/rpc/ping", {
    method: "POST", headers, body: "{}"
  });
  if (!res.ok) throw new Error("Supabase ping failed: HTTP " + res.status + " " + (await res.text()).slice(0, 200));
  return res.json();
}
