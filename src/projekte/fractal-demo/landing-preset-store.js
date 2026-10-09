const SETTING_KEY = "landing_preset";

export async function getLandingPreset(client) {
    if (!client) return null;
    const { data, error } = await client.from("site_settings")
        .select("setting_value")
        .eq("setting_key", SETTING_KEY)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.setting_value ?? null;
}

export async function setLandingPreset(presetData, client) {
    if (!client) throw new Error("Community ist noch nicht konfiguriert.");
    const { error } = await client.rpc("set_landing_preset", {
        preset_payload: presetData,
    });
    if (error) throw new Error(error.message);
}
