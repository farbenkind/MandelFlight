import { createClient } from "@supabase/supabase-js";
import { buildVisualizationPreset, readVisualizationPreset } from "../src/projekte/fractal-demo/preset-format.js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ownerId = process.env.LEGACY_PRESET_OWNER_ID;
const legacyBase = (process.env.LEGACY_PRESET_API || "https://mandelflight.pages.dev/api/presets/fractal").replace(/\/+$/, "");

if (!supabaseUrl || !serviceRoleKey || !ownerId) {
    throw new Error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and LEGACY_PRESET_OWNER_ID before importing.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
});

async function getJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Legacy preset request failed (${response.status}): ${url}`);
    return response.json();
}

const entries = await getJson(legacyBase);
if (!Array.isArray(entries)) throw new Error("Legacy preset API returned an invalid list.");

let imported = 0;
let skipped = 0;
for (const entry of entries) {
    if (!entry?.name || ![undefined, "visualization", "visual"].includes(entry.kind)) {
        skipped++;
        continue;
    }
    const { data: existing, error: lookupError } = await supabase.from("presets")
        .select("id").eq("owner_id", ownerId).eq("name", entry.name).maybeSingle();
    if (lookupError) throw new Error(`Could not check "${entry.name}": ${lookupError.message}`);
    if (existing) {
        skipped++;
        continue;
    }
    const legacyPreset = await getJson(`${legacyBase}/${encodeURIComponent(entry.name)}`);
    const visual = readVisualizationPreset(legacyPreset);
    const presetData = buildVisualizationPreset(
        entry.name, visual.view, visual.knobs, visual.xlut,
    );
    const createdAt = Number.isFinite(entry.created) && entry.created > 0
        ? new Date(entry.created).toISOString()
        : new Date().toISOString();
    const { error } = await supabase.from("presets").insert({
        owner_id: ownerId,
        name: entry.name,
        description: "Aus der bisherigen MandelFlight-Preset-Sammlung importiert.",
        preset_kind: "visual",
        schema_version: 1,
        preset_data: presetData,
        is_public: true,
        created_at: createdAt,
    });
    if (error) throw new Error(`Could not import "${entry.name}": ${error.message}`);
    imported++;
    console.log(`Imported: ${entry.name}`);
}

console.log(`Legacy import complete: ${imported} imported, ${skipped} skipped.`);
