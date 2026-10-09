// Legacy-Lesezugriff auf bisherige KV-Presets. Community-Schreibzugriffe
// laufen ausschliesslich ueber Supabase; KV-Mutationen sind deaktiviert.
//   GET    /api/presets/:app         -> [{name, created}]  (neueste zuerst)
//   GET    /api/presets/:app/:name   -> Preset-JSON
//   PUT/DELETE -> 410 Gone

const APPS = new Set(["fractal"]);
const NAME_RE = /^[\p{L}\p{N} _.\-+()]{1,64}$/u;

const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
    });

async function listNames(kv, app) {
    const items = [];
    let cursor;
    do {
        const page = await kv.list({ prefix: `${app}/`, cursor });
        for (const k of page.keys) {
            items.push({
                name: k.name.slice(app.length + 1), created: k.metadata?.created ?? 0,
                kind: k.metadata?.kind ?? "visualization",
            });
        }
        cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return items.sort((a, b) => b.created - a.created);
}

export async function onRequest({ request, env, params }) {
    const [app, rawName, ...rest] = params.path ?? [];
    if (!APPS.has(app) || rest.length) return json({ error: "not found" }, 404);

    let name = rawName;
    if (name !== undefined) {
        try { name = decodeURIComponent(name); } catch { return json({ error: "invalid name" }, 400); }
        if (!NAME_RE.test(name)) return json({ error: "invalid name" }, 400);
    }
    const key = `${app}/${name}`;

    if (request.method === "GET") {
        if (!env.PRESETS) return json({ error: "KV binding PRESETS missing" }, 500);
        if (name === undefined) return json(await listNames(env.PRESETS, app));
        const text = await env.PRESETS.get(key);
        return text === null
            ? json({ error: "not found" }, 404)
            : new Response(text, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }

    if (request.method === "PUT" || request.method === "DELETE") {
        return json({ error: "Legacy KV-Schreibzugriffe sind deaktiviert. Community-Presets nutzen Supabase." }, 410);
    }

    return json({ error: "method not allowed" }, 405);
}