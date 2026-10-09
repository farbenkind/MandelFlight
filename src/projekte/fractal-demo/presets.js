import { knobs, serializeKnobs, deserializeKnobs } from "./knob-state.js";
import { cmapParams } from "./colormap/params.js";
import { buildVisualizationPreset, isVisualizationPreset, readVisualizationPreset } from "./preset-format.js";
import { createCommunityAuthUI } from "./community-auth-ui.js";
import { createCommunityPresetCard, createLocalPresetCard, createCloudPresetCard } from "./ui/preset-card.js";
import { listLegacyCloudPresets, loadLegacyCloudPreset } from "./legacy-preset-store.js";
import { createPresetWorkspaceState } from "./preset-workspace-state.js";
import {
    deletePreset, likePreset, listLikedPresetIds, listPresets, loadPresetData, recordPresetView,
    saveCommunityPreset, savePreset, setFeatured, setPublished,
} from "./community-store.js";

const CATEGORIES = ["featured", "community", "mine"];
const LOCAL_KEY = "presets";

export function createPresets({
    fractalRenderer, xlutUI, communitySession, onSignIn, onSignOut, onChange,
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
    let currentDataset = "A";
    const workspaceState = createPresetWorkspaceState();

    function updateSaveTarget() {
        const account = currentUser?.user_metadata?.user_name || currentUser?.email || "dein Konto";
        document.getElementById("presetSaveTarget").textContent =
            `Speicherziel: ${account} · Datensatz ${currentDataset}. ${currentDataset === "B"
                ? "Testbestand bleibt privat."
                : "Privat, solange du nicht explizit veroeffentlichst."}`;
        document.getElementById("presetSaveBtn").disabled = !currentUser || !workspaceState.ready;
        publishInput.disabled = currentDataset === "B";
        document.getElementById("presetSaveBtn").textContent = editingPreset
            ? "Dieses Preset aktualisieren" : "Neues Preset speichern";
    }

    function report(error) {
        console.error("Preset-Community:", error);
        status.textContent = error.message;
    }

    async function run(action) {
        if (busy) return;
        busy = true;
        popup.setAttribute("aria-busy", "true");
        for (const id of ["authWorkspaceMode", "authGithubBtn", "authSignOutBtn", "presetSaveBtn"]) {
            document.getElementById(id).disabled = true;
        }
        try {
            await action();
        } catch (error) {
            report(error);
        } finally {
            busy = false;
            popup.setAttribute("aria-busy", "false");
            document.getElementById("authWorkspaceMode").value = communitySession?.getSnapshot().mode ?? "user";
            document.getElementById("authWorkspaceMode").disabled = !workspaceState.ready;
            document.getElementById("authGithubBtn").disabled = !communitySession;
            document.getElementById("authSignOutBtn").disabled = !communitySession;
            updateSaveTarget();
        }
    }

    function onCommunityStateChange(state) {
        if (workspaceState.update(state)) {
            revision++;
            editingPreset = null;
            currentPresetId = null;
            likedIds = new Set();
            nameInput.value = "";
            descriptionInput.value = "";
            publishInput.checked = false;
            document.getElementById("presetSaveUI").classList.add("hidden");
            list.replaceChildren();
            status.textContent = "";
        }
        currentUser = state.user;
        currentIsAdmin = state.isAdmin;
        currentDataset = state.dataset ?? "A";
        updateSaveTarget();
        if (popup && !popup.classList.contains("hidden") && (!currentUser || workspaceState.ready)) void refresh();
    }

    function selectCategory(category, refreshList = true) {
        currentCategory = category;
        for (const tab of document.querySelectorAll("[data-preset-category]")) {
            tab.setAttribute("aria-selected", String(tab.dataset.presetCategory === category));
        }
        document.getElementById("presetSaveUI").classList.add("hidden");
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
        const ticket = workspaceState.ticket();
        const element = document.createElement("button");
        element.type = "button";
        element.textContent = label;
        element.className = className;
        element.addEventListener("click", () => run(async () => {
            workspaceState.assert(ticket);
            await action(() => workspaceState.assert(ticket));
        }));
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
            const importButton = button("Anmelden zum Import", async assertCurrent => {
                if (!currentUser) throw new Error("Zum Import bitte anmelden.");
                const data = readVisualizationPreset(preset);
                await savePreset({
                    name: preset.name,
                    description: "Aus lokalem Speicher importiert",
                    presetData: buildVisualizationPreset(preset.name, data.view, data.knobs, data.xlut),
                    publish: false,
                }, currentUser.id);
                assertCurrent();
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
                    actions.append(button("Laden", async assertCurrent => {
                        const preset = await loadLegacyCloudPreset(entry.name);
                        assertCurrent();
                        applyPreset(preset, { name: entry.name });
                }));
                actions.append(button(currentUser ? "In My Presets importieren" : "Anmelden zum Import", async assertCurrent => {
                    if (!currentUser) throw new Error("Zum Import bitte anmelden.");
                    const userId = currentUser.id;
                    const data = readVisualizationPreset(await loadLegacyCloudPreset(entry.name));
                    assertCurrent();
                    if (currentUser?.id !== userId) throw new Error("Konto hat sich geaendert. Bitte erneut importieren.");
                    await savePreset({
                        name: entry.name,
                        description: "Aus altem gemeinsamen Cloud-Speicher importiert",
                        presetData: buildVisualizationPreset(entry.name, data.view, data.knobs, data.xlut),
                        publish: false,
                    }, userId);
                    assertCurrent();
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
        actions.append(button("Laden", async assertCurrent => {
            const loaded = await loadPresetData(entry.id);
            assertCurrent();
            applyPreset(loaded.preset_data, entry);
        }));
        if (currentCategory === "mine" && entry.owner_id === currentUser?.id && entry.dataset === currentDataset) {
            if (currentDataset !== "B") {
                actions.append(button(entry.is_public ? "Veröffentlichung zurückziehen" : "Veröffentlichen", async assertCurrent => {
                    await setPublished(entry.id, !entry.is_public, currentUser.id);
                    assertCurrent();
                    status.textContent = entry.is_public ? "Preset ist jetzt privat." : "Preset ist jetzt öffentlich.";
                    await refresh();
                }));
            }
            actions.append(button("Aktuelle Ansicht überschreiben", () => {
                editingPreset = entry;
                updateSaveTarget();
                nameInput.value = entry.name;
                descriptionInput.value = entry.description ?? "";
                publishInput.checked = entry.is_public;
                document.getElementById("presetSaveUI").classList.remove("hidden");
                nameInput.focus();
                nameInput.select();
            }));
            actions.append(button("Löschen", async assertCurrent => {
                if (!window.confirm(`"${entry.name}" endgültig löschen?`)) return;
                await deletePreset(entry.id, currentUser.id);
                assertCurrent();
                status.textContent = "Preset gelöscht.";
                await refresh();
            }));
        } else if (currentUser && (entry.owner_id !== currentUser.id || entry.dataset !== currentDataset)) {
            const liked = likedIds.has(entry.id);
            actions.append(button(liked ? "♥ Gefällt mir" : "♡ Like", async assertCurrent => {
                await likePreset(entry.id, currentUser.id, !liked);
                assertCurrent();
                await refresh();
            }));
            actions.append(button("In My Presets speichern", async assertCurrent => {
                await saveCommunityPreset(entry.id);
                assertCurrent();
                status.textContent = "Kopie in My Presets gespeichert.";
                await refresh();
            }));
        }
        if (currentIsAdmin && entry.is_public) {
            actions.append(button(entry.featured ? "Featured entfernen" : "Als Featured markieren", async assertCurrent => {
                await setFeatured(entry.id, !entry.featured, Math.floor(Date.now() / 1000));
                assertCurrent();
                status.textContent = entry.featured ? "Featured-Auszeichnung entfernt." : "Preset als Featured markiert.";
                await refresh();
            }));
        }
        return createCommunityPresetCard(entry, actions);
    }

    async function refresh() {
        const request = ++revision;
        const ticket = workspaceState.ticket();
        const userId = currentUser?.id;
        list.replaceChildren();
        const loading = document.createElement("p");
        loading.textContent = "Presets werden geladen ...";
        list.append(loading);
        try {
            if (userId && !workspaceState.ready) throw new Error("Kontoberechtigungen werden noch geprueft.");
            const entries = await listPresets(currentCategory, currentSort, userId);
            if (request !== revision) return;
            likedIds = userId
                ? await listLikedPresetIds(userId, entries.map(entry => entry.id))
                : new Set();
            if (request !== revision) return;
            workspaceState.assert(ticket);
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
        updateSaveTarget();
        nameInput.value = "";
        descriptionInput.value = "";
        publishInput.checked = false;
        document.getElementById("presetSaveUI").classList.remove("hidden");
        nameInput.focus();
    }

    async function saveCurrent() {
        if (!currentUser) throw new Error("Zum Speichern bitte zuerst anmelden.");
        if (!workspaceState.ready) throw new Error("Kontoberechtigungen werden noch geprueft.");
        const ticket = workspaceState.ticket();
        const userId = currentUser.id;
        if (editingPreset && (editingPreset.owner_id !== userId || editingPreset.dataset !== currentDataset)) {
            throw new Error("Bearbeitungsziel gehoert nicht zum aktiven Arbeitsbereich.");
        }
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
        }, userId);
        workspaceState.assert(ticket);
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
        const ticket = workspaceState.ticket();
        if (!currentIsAdmin) throw new Error("Nur Admins koennen das Willkommensvisual aendern.");
        const presetData = buildVisualizationPreset(
            "landingpreset",
            fractalRenderer.getView(),
            serializeKnobs(knobs),
            xlutUI.getChains(),
        );
        await onSetLandingPreset(presetData);
        workspaceState.assert(ticket);
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
