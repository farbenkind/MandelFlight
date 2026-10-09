import { knobs, serializeKnobs, deserializeKnobs } from "./knob-state.js";
import { cmapParams } from "./colormap/params.js";
import { buildVisualizationPreset, isVisualizationPreset, readVisualizationPreset } from "./preset-format.js";
import { createCommunityAuthUI } from "./community-auth-ui.js";
import { createCommunityPresetCard, createLocalPresetCard, createCloudPresetCard } from "./ui/preset-card.js";
import { listLegacyCloudPresets, loadLegacyCloudPreset } from "./legacy-preset-store.js";
import {
    deletePreset, likePreset, listLikedPresetIds, listPresets, loadPresetData, recordPresetView,
    saveCommunityPreset, savePreset, setFeatured, setPublished,
} from "./community-store.js";

const CATEGORIES = ["featured", "community", "mine"];
const LOCAL_KEY = "presets";

export function createPresets({
    fractalRenderer, xlutUI, communitySession, onSignIn, onSignOut, onSwitchAccount, onChange,
    onSetLandingPreset,
}) {
    const popup = document.getElementById("presetPopup");
    const status = document.getElementById("presetStatus");
    const nameInput = document.getElementById("presetNameInput");
    const descriptionInput = document.getElementById("presetDescriptionInput");
    const publishInput = document.getElementById("presetPublishInput");
    const list = document.getElementById("communityPresetList");
    let currentCategory = "featured";
    let currentSort = "default";
    let currentSearch = "";
    let currentUser = null;
    let currentIsAdmin = false;
    let currentPresetId = null;
    let editingPreset = null;
    let busy = false;
    let revision = 0;
    let likedIds = new Set();

    function report(error) {
        console.error("Preset-Community:", error);
        status.textContent = error.message;
    }

    async function run(action) {
        if (busy) return;
        busy = true;
        popup.setAttribute("aria-busy", "true");
        try {
            await action();
        } catch (error) {
            report(error);
        } finally {
            busy = false;
            popup.setAttribute("aria-busy", "false");
        }
    }

    function onCommunityStateChange(state) {
        currentUser = state.user;
        currentIsAdmin = state.isAdmin;
        if (popup && !popup.classList.contains("hidden")) void refresh();
    }

    function selectCategory(category, refreshList = true) {
        currentCategory = category;
        for (const tab of document.querySelectorAll("[data-preset-category]")) {
            tab.setAttribute("aria-selected", String(tab.dataset.presetCategory === category));
        }
        document.getElementById("presetSaveUI").classList.toggle("hidden", category !== "mine");
        if (refreshList) void refresh();
    }

    function open(save = false) {
        popup.classList.remove("hidden");
        document.getElementById("presetBtn").setAttribute("aria-expanded", "true");
        if (save) {
            selectCategory("mine", false);
            showSave();
        }
        status.textContent = "";
        void refresh();
        document.getElementById("presetCloseBtn").focus();
    }

    function close() {
        popup.classList.add("hidden");
        document.getElementById("presetBtn").setAttribute("aria-expanded", "false");
        revision++;
        document.getElementById("presetBtn").focus();
    }

    function applyPreset(preset, entry) {
        const data = readVisualizationPreset(preset);
        const restored = deserializeKnobs(data.knobs, cmapParams);
        fractalRenderer.setView(data.view);
        Object.assign(knobs, restored);
        xlutUI.setChains(data.xlut);
        currentPresetId = entry?.id ?? null;
        onChange?.();
        const name = entry?.name ?? preset.name ?? "Preset";
        nameInput.value = name;
        status.textContent = `"${name}" geladen.`;
        if (entry?.id && currentUser) {
            recordPresetView(entry.id).catch(error => {
                console.error("Preset-Aufruf konnte nicht gezählt werden:", error);
            });
        }
    }

    function button(label, action, className = "") {
        const element = document.createElement("button");
        element.type = "button";
        element.textContent = label;
        element.className = className;
        element.addEventListener("click", () => run(action));
        return element;
    }

    function renderLocalImports(existingNames = new Set()) {
        let legacy = [];
        try {
            legacy = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
            if (!Array.isArray(legacy)) legacy = [];
        } catch (error) {
            console.error("Lokale Presets koennen nicht gelesen werden:", error);
            return;
        }
        for (const preset of legacy.filter(isVisualizationPreset)) {
            if (!preset?.name || existingNames.has(preset.name)) continue;
            const importButton = button("Anmelden zum Import", async () => {
                if (!currentUser) throw new Error("Zum Import bitte anmelden.");
                const data = readVisualizationPreset(preset);
                await savePreset({
                    name: preset.name,
                    description: "Aus lokalem Speicher importiert",
                    presetData: buildVisualizationPreset(preset.name, data.view, data.knobs, data.xlut),
                    publish: false,
                }, currentUser.id);
                status.textContent = `"${preset.name}" in My Presets importiert.`;
                await refresh();
            });
            if (currentUser) importButton.textContent = "In My Presets importieren";
            list.append(createLocalPresetCard(preset, importButton));
        }
    }

    async function renderCloudImports(request) {
        try {
            const entries = await listLegacyCloudPresets();
            if (request !== revision) return;
            for (const entry of entries) {
                const actions = document.createElement("div");
                actions.className = "community-preset-actions";
                actions.append(button("Laden", async () => {
                    applyPreset(await loadLegacyCloudPreset(entry.name), { name: entry.name });
                }));
                actions.append(button(currentUser ? "In My Presets importieren" : "Anmelden zum Import", async () => {
                    if (!currentUser) throw new Error("Zum Import bitte anmelden.");
                    const userId = currentUser.id;
                    const data = readVisualizationPreset(await loadLegacyCloudPreset(entry.name));
                    if (currentUser?.id !== userId) throw new Error("Konto hat sich geaendert. Bitte erneut importieren.");
                    await savePreset({
                        name: entry.name,
                        description: "Aus altem gemeinsamen Cloud-Speicher importiert",
                        presetData: buildVisualizationPreset(entry.name, data.view, data.knobs, data.xlut),
                        publish: false,
                    }, userId);
                    status.textContent = `"${entry.name}" in My Presets importiert.`;
                    await refresh();
                }));
                list.append(createCloudPresetCard(entry, actions));
            }
        } catch (error) {
            if (request !== revision) return;
            console.error("Alte Cloud-Presets konnten nicht geladen werden:", error);
            const failure = document.createElement("p");
            failure.className = "community-error";
            failure.textContent = error.message;
            list.append(failure);
        }
    }

    function renderEntry(entry) {
        const actions = document.createElement("div");
        actions.className = "community-preset-actions";
        actions.append(button("Laden", async () => {
            const loaded = await loadPresetData(entry.id);
            applyPreset(loaded.preset_data, entry);
        }));
        if (currentCategory === "mine") {
            actions.append(button(entry.is_public ? "Veröffentlichung zurückziehen" : "Veröffentlichen", async () => {
                await setPublished(entry.id, !entry.is_public, currentUser.id);
                status.textContent = entry.is_public ? "Preset ist jetzt privat." : "Preset ist jetzt öffentlich.";
                await refresh();
            }));
            actions.append(button("Aktuelle Ansicht überschreiben", () => {
                editingPreset = entry;
                nameInput.value = entry.name;
                descriptionInput.value = entry.description ?? "";
                publishInput.checked = entry.is_public;
                document.getElementById("presetSaveUI").classList.remove("hidden");
                nameInput.focus();
                nameInput.select();
            }));
            actions.append(button("Löschen", async () => {
                if (!window.confirm(`"${entry.name}" endgültig löschen?`)) return;
                await deletePreset(entry.id, currentUser.id);
                status.textContent = "Preset gelöscht.";
                await refresh();
            }));
        } else if (currentUser && entry.owner_id !== currentUser.id) {
            const liked = likedIds.has(entry.id);
            actions.append(button(liked ? "♥ Gefällt mir" : "♡ Like", async () => {
                await likePreset(entry.id, currentUser.id, !liked);
                await refresh();
            }));
            actions.append(button("In My Presets speichern", async () => {
                await saveCommunityPreset(entry.id);
                status.textContent = "Kopie in My Presets gespeichert.";
                await refresh();
            }));
        }
        if (currentIsAdmin && entry.is_public) {
            actions.append(button(entry.featured ? "Featured entfernen" : "Als Featured markieren", async () => {
                await setFeatured(entry.id, !entry.featured, Math.floor(Date.now() / 1000));
                status.textContent = entry.featured ? "Featured-Auszeichnung entfernt." : "Preset als Featured markiert.";
                await refresh();
            }));
        }
        return createCommunityPresetCard(entry, actions);
    }

    async function refresh() {
        const request = ++revision;
        list.replaceChildren();
        const loading = document.createElement("p");
        loading.textContent = "Presets werden geladen ...";
        list.append(loading);
        try {
            const entries = await listPresets(currentCategory, currentSort, currentUser?.id);
            if (request !== revision) return;
            likedIds = currentUser
                ? await listLikedPresetIds(currentUser.id, entries.map(entry => entry.id))
                : new Set();
            if (request !== revision) return;
            const filtered = entries.filter(entry =>
                `${entry.name} ${entry.description ?? ""} ${entry.profiles?.display_name ?? ""}`
                    .toLocaleLowerCase().includes(currentSearch.toLocaleLowerCase()));
            list.replaceChildren();
            if (!filtered.length) {
                const empty = document.createElement("p");
                empty.className = "community-empty";
                empty.textContent = currentCategory === "mine" && !currentUser
                    ? "Melde dich an, um My Presets zu verwenden."
                    : "Hier sind noch keine Presets.";
                list.append(empty);
            } else {
                for (const entry of filtered) list.append(renderEntry(entry));
            }
            if (currentCategory === "mine") {
                const existingNames = new Set(entries.map(entry => entry.name));
                renderLocalImports(existingNames);
                void renderCloudImports(request);
            }
            status.textContent = "";
        } catch (error) {
            if (request !== revision) return;
            list.replaceChildren();
            const failure = document.createElement("p");
            failure.className = "community-error";
            failure.textContent = error.message;
            list.append(failure);
            if (currentCategory === "mine") {
                renderLocalImports();
                void renderCloudImports(request);
            }
        }
    }

    function showSave() {
        selectCategory("mine");
        editingPreset = null;
        nameInput.value = "";
        descriptionInput.value = "";
        publishInput.checked = false;
        document.getElementById("presetSaveUI").classList.remove("hidden");
        nameInput.focus();
    }

    async function saveCurrent() {
        if (!currentUser) throw new Error("Zum Speichern bitte zuerst anmelden.");
        const name = nameInput.value.trim();
        if (!/^[\p{L}\p{N} _.\-+()]{1,64}$/u.test(name)) {
            throw new Error("Name: 1-64 Zeichen, Buchstaben/Zahlen, Leerzeichen oder _ . - + ( ).");
        }
        const presetData = buildVisualizationPreset(name, fractalRenderer.getView(), serializeKnobs(knobs), xlutUI.getChains());
        const saved = await savePreset({
            id: editingPreset?.id,
            name,
            description: descriptionInput.value.trim(),
            presetData,
            publish: publishInput.checked,
        }, currentUser.id);
        editingPreset = null;
        document.getElementById("presetSaveUI").classList.add("hidden");
        currentPresetId = saved.id;
        status.textContent = publishInput.checked
            ? `"${name}" gespeichert und veröffentlicht.`
            : `"${name}" in My Presets gespeichert.`;
        await refresh();
    }

    for (const category of CATEGORIES) {
        document.querySelector(`[data-preset-category="${category}"]`).addEventListener("click", () => {
            selectCategory(category);
        });
    }
    document.getElementById("presetSort").addEventListener("change", event => {
        currentSort = event.target.value;
        void refresh();
    });
    document.getElementById("presetSearch").addEventListener("input", event => {
        currentSearch = event.target.value.trim();
        void refresh();
    });
    document.getElementById("presetBtn").addEventListener("click", () => open());
    document.getElementById("presetCloseBtn").addEventListener("click", close);
    document.getElementById("presetSaveAsBtn").addEventListener("click", showSave);
    document.getElementById("presetSaveBtn").addEventListener("click", () => run(saveCurrent));
    document.getElementById("setLandingPresetBtn").addEventListener("click", () => run(async () => {
        if (!currentIsAdmin) throw new Error("Nur Admins koennen das Willkommensvisual aendern.");
        const presetData = buildVisualizationPreset(
            "landingpreset",
            fractalRenderer.getView(),
            serializeKnobs(knobs),
            xlutUI.getChains(),
        );
        await onSetLandingPreset(presetData);
        status.textContent = "Das aktuelle Visual wurde als Willkommensvisual gespeichert.";
    }));
    popup.addEventListener("keydown", event => {
        if (event.key === "Escape") { event.stopPropagation(); close(); }
    });
    createCommunityAuthUI({
        communitySession,
        execute: run,
        onSignIn,
        onSignOut,
        onSwitchAccount,
        onStateChange: onCommunityStateChange,
        onError: report,
    });

    return {
        openSave: () => open(true),
        openLoad: () => open(),
        isOpen: () => !popup.classList.contains("hidden"),
        getCurrentPresetId: () => currentPresetId,
        async loadDefault() {
            const defaultName = localStorage.getItem("defaultVisualizationPreset");
            if (!defaultName) return false;
            try {
                const legacy = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]")
                    .find(preset => preset.name === defaultName && isVisualizationPreset(preset));
                if (!legacy) return false;
                applyPreset(legacy);
                return true;
            } catch (error) {
                report(error);
                return false;
            }
        },
    };
}
