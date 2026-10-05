// Preset-Speicher: localStorage + optional Server (Cloudflare KV ueber /api/presets/fractal).
const BASE = "/api/presets/fractal";
const LOCAL_KEY = "presets";
const KEY_KEY = "presetKey";

const readLocal = () => JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
const writeLocal = (list) => localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
const url = (name) => `${BASE}/${encodeURIComponent(name)}`;

export function getWriteKey() {
    let key = localStorage.getItem(KEY_KEY);
    if (!key) {
        key = (prompt("Schreib-Passwort für den Server:") || "").trim();
        if (key) localStorage.setItem(KEY_KEY, key);
    }
    return key;
}

export function forgetWriteKey() {
    localStorage.removeItem(KEY_KEY);
}

async function fetchRemoteList() {
    try {
        const res = await fetch(BASE, { cache: "no-store" });
        return res.ok ? await res.json() : [];
    } catch {
        return [];
    }
}

// Liste aus lokalen und Server-Presets; bei gleichem Namen gewinnt der Server-Eintrag.
export async function listPresets() {
    const byName = new Map();
    for (const p of readLocal()) byName.set(p.name, { name: p.name, created: p.created ?? 0, local: true, remote: false });
    for (const r of await fetchRemoteList()) {
        const prev = byName.get(r.name);
        byName.set(r.name, { name: r.name, created: r.created, local: !!prev, remote: true });
    }
    return [...byName.values()].sort((a, b) => b.created - a.created);
}

export async function loadPreset(entry) {
    if (entry.remote) {
        const res = await fetch(url(entry.name), { cache: "no-store" });
        if (res.ok) return res.json();
    }
    return readLocal().find((p) => p.name === entry.name) ?? null;
}

export function hasLocal(name) {
    return readLocal().some((p) => p.name === name);
}

export function saveLocal(preset) {
    const list = readLocal().filter((p) => p.name !== preset.name);
    list.push(preset);
    writeLocal(list);
}

export function deleteLocal(name) {
    writeLocal(readLocal().filter((p) => p.name !== name));
}

async function writeRemote(method, name, body) {
    const key = getWriteKey();
    if (!key) throw new Error("Kein Passwort eingegeben.");
    const res = await fetch(url(name), { method, headers: { "x-api-key": key }, body });
    if (res.status === 401) {
        forgetWriteKey();
        throw new Error("Falsches Passwort.");
    }
    if (!res.ok) throw new Error(`Server-Fehler ${res.status}`);
}

export const saveRemote = (preset) => writeRemote("PUT", preset.name, JSON.stringify(preset));
export const deleteRemote = (name) => writeRemote("DELETE", name);