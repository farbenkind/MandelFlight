import { getStore } from "@netlify/blobs";
import { timingSafeEqual } from "node:crypto";

// Preset-API: Lesen ist oeffentlich, Schreiben/Loeschen braucht den Header "x-api-key"
// (Umgebungsvariable PRESET_WRITE_KEY in Netlify).
//   GET    /api/presets/:app          -> [{name, data}]
//   GET    /api/presets/:app/:name    -> data
//   PUT    /api/presets/:app/:name    -> speichert den JSON-Body
//   DELETE /api/presets/:app/:name

const APPS = new Set(["fractal"]);
const NAME_RE = /^[\p{L}\p{N} _.\-+()]{1,64}$/u;
const MAX_BYTES = 200_000;

const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Der Blob-Speicher kann Schluessel kodiert zurueckgeben; "%" ist in Namen verboten, Dekodieren ist also eindeutig
function plainKey(key) {
    try {
        for (let i = 0; i < 3; i++) {
            const d = decodeURIComponent(key);
            if (d === key) break;
            key = d;
        }
    } catch { /* unveraendert lassen */ }
    return key;
}

function authorized(req) {
    const expected = process.env.PRESET_WRITE_KEY;
    const given = req.headers.get("x-api-key");
    if (!expected || !given) return false;
    const a = Buffer.from(given), b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

export default async (req, context) => {
    const { app } = context.params;
    let name = context.params.name;
    try { if (name !== undefined) name = decodeURIComponent(name); } catch { return json({ error: "invalid name" }, 400); }
    if (!APPS.has(app)) return json({ error: "unknown app" }, 404);
    if (name !== undefined && !NAME_RE.test(name)) return json({ error: "invalid name" }, 400);

    const store = getStore({ name: "presets", consistency: "strong" });
    const key = n => `${app}/${n}`;

    if (req.method === "GET") {
        if (name === undefined) {
            const { blobs } = await store.list({ prefix: `${app}/` });
            const items = await Promise.all(blobs.map(async b => {
                const plain = plainKey(b.key);
                return { name: plain.slice(app.length + 1), data: await store.get(plain, { type: "json" }) };
            }));
            return json(items.filter(i => i.data !== null));
        }
        const data = await store.get(key(name), { type: "json" });
        return data === null ? json({ error: "not found" }, 404) : json(data);
    }

    if (req.method === "PUT" || req.method === "DELETE") {
        if (!authorized(req)) return json({ error: "unauthorized" }, 401);
        if (name === undefined) return json({ error: "name required" }, 400);

        if (req.method === "DELETE") {
            await store.delete(key(name));
            return json({ ok: true });
        }
        const text = await req.text();
        if (text.length > MAX_BYTES) return json({ error: "too large" }, 413);
        try { JSON.parse(text); } catch { return json({ error: "invalid json" }, 400); }
        await store.set(key(name), text);
        return json({ ok: true });
    }

    return json({ error: "method not allowed" }, 405);
};

export const config = { path: ["/api/presets/:app", "/api/presets/:app/:name"] };