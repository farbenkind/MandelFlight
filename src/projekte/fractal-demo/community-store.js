import { supabase } from "./supabase-client.js";

const PRESET_FIELDS = "id,owner_id,name,description,preview_palette,is_public,featured,featured_order,likes,views,saves,created_at,updated_at,source_preset_id,profiles!presets_owner_id_fkey(display_name)";

function client() {
    if (!supabase) throw new Error("Community ist noch nicht konfiguriert. Supabase-URL und Anon-Key fehlen.");
    return supabase;
}

function throwIfError({ error }) {
    if (error) throw new Error(error.message);
}

export async function listPresets(category, sort, userId) {
    const db = client();
    let query = db.from("presets").select(PRESET_FIELDS);
    if (category === "featured") query = query.eq("is_public", true).eq("featured", true);
    else if (category === "community") query = query.eq("is_public", true);
    else {
        if (!userId) return [];
        query = query.eq("owner_id", userId);
    }
    const order = sort === "name"
        ? [{ column: "name", ascending: true }, { column: "id", ascending: true }]
        : sort === "likes" || sort === "views" || sort === "saves"
            ? [{ column: sort, ascending: false }, { column: "name", ascending: true }]
            : category === "featured"
                ? [{ column: "featured_order", ascending: true }, { column: "created_at", ascending: false }]
                : [{ column: "created_at", ascending: false }];
    for (const item of order) query = query.order(item.column, { ascending: item.ascending });
    const { data, error } = await query.limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
}

export async function savePreset({ id, name, description, presetData, publish }, userId) {
    const db = client();
    if (!userId) throw new Error("Zum Speichern bitte anmelden.");
    const record = {
        name,
        description,
        preset_data: presetData,
        is_public: Boolean(publish),
        schema_version: 1,
        preset_kind: "visual",
    };
    if (id) {
        const { data, error } = await db.from("presets").update(record)
            .eq("id", id).eq("owner_id", userId).select(PRESET_FIELDS).single();
        if (error) throw new Error(error.message);
        return data;
    }
    const { data, error } = await db.from("presets").insert(record).select(PRESET_FIELDS).single();
    if (error) throw new Error(error.message);
    return data;
}

export async function setPublished(id, publish, userId) {
    const { data, error } = await client().from("presets")
        .update({ is_public: Boolean(publish) }).eq("id", id).eq("owner_id", userId)
        .select("id").single();
    if (error) throw new Error(error.message);
    return data;
}

export async function loadPresetData(id) {
    const { data, error } = await client().from("presets").select("id,name,preset_data")
        .eq("id", id).single();
    if (error) throw new Error(error.message);
    return data;
}

export async function setFeatured(id, featured, order) {
    const { error } = await client().rpc("set_preset_featured", {
        preset_uuid: id,
        is_featured: featured,
        display_order: order,
    });
    if (error) throw new Error(error.message);
}

export async function deletePreset(id, userId) {
    const { error } = await client().from("presets").delete()
        .eq("id", id).eq("owner_id", userId);
    throwIfError({ error });
}

export async function likePreset(id, userId, liked) {
    const db = client();
    if (liked) {
        const { error } = await db.from("preset_likes").upsert(
            { preset_id: id, user_id: userId }, { onConflict: "preset_id,user_id", ignoreDuplicates: true },
        );
        throwIfError({ error });
    } else {
        const { error } = await db.from("preset_likes").delete()
            .eq("preset_id", id).eq("user_id", userId);
        throwIfError({ error });
    }
}

export async function saveCommunityPreset(id) {
    const { data, error } = await client().rpc("save_community_preset", { source_preset: id });
    if (error) throw new Error(error.message);
    return data;
}

export async function recordPresetView(id) {
    const { error } = await client().rpc("record_preset_view", { viewed_preset: id });
    if (error) throw new Error(error.message);
}

export async function listLikedPresetIds(userId, presetIds) {
    if (!userId || !presetIds.length) return new Set();
    const { data, error } = await client().from("preset_likes").select("preset_id")
        .eq("user_id", userId).in("preset_id", presetIds);
    if (error) throw new Error(error.message);
    return new Set((data ?? []).map(row => row.preset_id));
}

export async function submitProblem(problem, captchaToken) {
    const { error } = await client().from("problem_reports").insert({
        title: problem.title,
        description: problem.description,
        category: problem.category,
        app_version: problem.appVersion,
        browser: problem.browser,
        operating_system: problem.operatingSystem,
        occurred_at: problem.occurredAt,
        preset_id: problem.presetId,
        captcha_token: captchaToken || null,
    });
    if (error) throw new Error(error.message);
}
