// Preset-API als Cloudflare Pages Function. Speicher: Workers KV (Binding "PRESETS").
// Lesen ist oeffentlich, Schreiben/Loeschen braucht den Header "x-api-key"
// (Secret PRESET_WRITE_KEY).
//   GET    /api/presets/:app         -> [{name, created}]  (neueste zuerst)
//   GET    /api/presets/:app/:name   -> Preset-JSON
//   PUT    /api/presets/:app/:name   -> speichert den JSON-Body
//   DELETE /api/presets/:app/:name

const APPS = new Set(["fractal"]);
const NAME_RE = /^[\p{L}\p{N} _.\-+()]{1,64}$/u;
const MAX_BYTES = 200_000;

const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
    });

// Vergleicht per SHA-256-Hash, damit Laenge und Inhalt des Keys nicht ueber die Laufzeit durchsickern
async function authorized(request, env) {
    const given = request.headers.get("x-api-key");
    if (!env.PRESET_WRITE_KEY || !given) return false;
    const enc = new TextEncoder();
    const [a, b] = await Promise.all([
        crypto.subtle.digest("SHA-256", enc.encode(given)),
        crypto.subtle.digest("SHA-256", enc.encode(env.PRESET_WRITE_KEY)),
    ]);
    const x = new Uint8Array(a), y = new Uint8Array(b);
    let diff = 0;
    for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
    return diff === 0;
}

async function listNames(kv, app) {
    const items = [];
    let cursor;
    do {
        const page = await kv.list({ prefix: `${app}/`, cursor });
        for (const k of page.keys) {
            items.push({ name: k.name.slice(app.length + 1), created: k.metadata?.created ?? 0 });
        }
        cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return items.sort((a, b) => b.created - a.created);
}

export async function onRequest({ request, env, params }) {
    if (!env.PRESETS) return json({ error: "KV binding PRESETS missing" }, 500);

    const [app, rawName, ...rest] = params.path ?? [];
    if (!APPS.has(app) || rest.length) return json({ error: "not found" }, 404);

    let name = rawName;
    if (name !== undefined) {
        try { name = decodeURIComponent(name); } catch { return json({ error: "invalid name" }, 400); }
        if (!NAME_RE.test(name)) return json({ error: "invalid name" }, 400);
    }
    const key = `${app}/${name}`;

    if (request.method === "GET") {
        if (name === undefined) return json(await listNames(env.PRESETS, app));
        const text = await env.PRESETS.get(key);
        return text === null
            ? json({ error: "not found" }, 404)
            : new Response(text, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }

    if (request.method === "PUT" || request.method === "DELETE") {
        if (!(await authorized(request, env))) return json({ error: "unauthorized" }, 401);
        if (name === undefined) return json({ error: "name required" }, 400);

        if (request.method === "DELETE") {
            await env.PRESETS.delete(key);
            return json({ ok: true });
        }
        const text = await request.text();
        if (text.length > MAX_BYTES) return json({ error: "too large" }, 413);
        try { JSON.parse(text); } catch { return json({ error: "invalid json" }, 400); }
        await env.PRESETS.put(key, text, { metadata: { created: Date.now() } });
        return json({ ok: true });
    }

    return json({ error: "method not allowed" }, 405);
}