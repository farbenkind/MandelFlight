import { isVisualizationPreset, readVisualizationPreset } from "./preset-format.js";

const BASE = "/api/presets/fractal";

async function read(path, fetcher) {
    const response = await fetcher(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`Alte Cloud-Presets: HTTP ${response.status}`);
    return response.json();
}

export async function listLegacyCloudPresets(fetcher = globalThis.fetch) {
    const entries = await read(BASE, fetcher);
    if (!Array.isArray(entries) || entries.some(entry =>
        !entry || typeof entry.name !== "string" || !entry.name.trim())) {
        throw new Error("Ungueltige Liste der alten Cloud-Presets.");
    }
    return entries.filter(isVisualizationPreset);
}

export async function loadLegacyCloudPreset(name, fetcher = globalThis.fetch) {
    if (typeof name !== "string" || !name.trim()) throw new Error("Preset-Name fehlt.");
    const preset = await read(`${BASE}/${encodeURIComponent(name)}`, fetcher);
    readVisualizationPreset(preset);
    return preset;
}
