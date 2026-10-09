import { isVisualizationPreset, readVisualizationPreset } from "./preset-format.js";

const KEY = "presets";

export function createLocalPresetStore(storage) {
    function read() {
        const entries = JSON.parse((storage ?? globalThis.localStorage).getItem(KEY) ?? "[]");
        if (!Array.isArray(entries)) throw new Error("Lokaler Preset-Speicher ist ungueltig. Daten wurden nicht veraendert.");
        return entries;
    }

    return {
        list() {
            return read().filter(entry => isVisualizationPreset(entry) && typeof entry.name === "string");
        },
        save({ name, description = "", presetData, originalName = null }) {
            if (!/^[\p{L}\p{N} _.\-+()]{1,64}$/u.test(name)) throw new Error("Ungueltiger Preset-Name.");
            readVisualizationPreset(presetData);
            const entries = read();
            const index = originalName === null ? -1
                : entries.findIndex(entry => isVisualizationPreset(entry) && entry.name === originalName);
            if (originalName !== null && index === -1) throw new Error("Lokales Bearbeitungsziel existiert nicht mehr.");
            if (entries.some((entry, i) => i !== index && entry?.name === name)) {
                throw new Error(`"${name}" existiert auf diesem Geraet bereits. Anderen Namen verwenden oder gezielt aktualisieren.`);
            }
            const saved = { ...presetData, name, description, created: index === -1 ? Date.now() : entries[index].created, updated: Date.now() };
            if (index === -1) entries.push(saved);
            else entries[index] = saved;
            (storage ?? globalThis.localStorage).setItem(KEY, JSON.stringify(entries));
            return saved;
        },
        delete(name) {
            const entries = read();
            const index = entries.findIndex(entry => isVisualizationPreset(entry) && entry.name === name);
            if (index === -1) throw new Error("Lokales Preset existiert nicht mehr.");
            entries.splice(index, 1);
            (storage ?? globalThis.localStorage).setItem(KEY, JSON.stringify(entries));
        },
    };
}
