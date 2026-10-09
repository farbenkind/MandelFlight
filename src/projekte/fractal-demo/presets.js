import { knobs, serializeKnobs, deserializeKnobs } from "./knob-state.js";
import { cmapParams } from "./colormap/params.js";
import { buildVisualizationPreset, isVisualizationPreset, readVisualizationPreset } from "./preset-format.js";
import { createCommunityAuthUI } from "./community-auth-ui.js";
import { createCommunityPresetCard, createLocalPresetCard } from "./ui/preset-card.js";
import { createLocalPresetStore } from "./local-preset-store.js";
import { createPresetWorkspaceState } from "./preset-workspace-state.js";
import {
    deletePreset, likePreset, listLikedPresetIds, listPresets, loadPresetData, recordPresetView,
    saveCommunityPreset, savePreset, setFeatured, setPublished,
} from "./community-store.js";

const CATEGORIES = ["featured", "community", "mine", "local"];
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
    const localStore = createLocalPresetStore();
    let saveDestination = "account";

    function updateSaveTarget() {
        const local = saveDestination === "local";
        const account = currentUser?.user_metadata?.user_name || currentUser?.email || "dein Konto";
        document.getElementById("presetSaveTarget").textContent = local
            ? "Speicherziel: Dieser Browser auf dieser Domain. Kein Cloud-Backup; unabhaengig vom Konto."
            : `Speicherziel: ${account} · Datensatz ${currentDataset}. ${currentDataset === "B"
                ? "Testbestand bleibt privat."
                : "Privat, solange du nicht explizit veroeffentlichst."}`;
        document.getElementById("presetSaveBtn").disabled = busy || (!local && (!currentUser || !workspaceState.ready));
        document.getElementById("presetSaveAsBtn").disabled = busy || !currentUser || !workspaceState.ready;
        publishInput.disabled = local || currentDataset === "B";
        publishInput.closest("label").classList.toggle("hidden", local);
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
        for (const id of ["authWorkspaceMode", "authGithubBtn", "authSignOutBtn", "presetSaveBtn", "presetSaveLocalBtn", "presetSaveAsBtn"]) {
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
            document.getElementById("presetSaveLocalBtn").disabled = false;
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
        if (popup && !popup.classList.contains("hidden")
            && (currentCategory === "local" || !currentUser || workspaceState.ready)) void refresh();
    }

    function selectCategory(category, refreshList = true) {
        currentCategory = category;
        for (const tab of document.querySelectorAll("[data-preset-category]")) {
            tab.setAttribute("aria-selected", String(tab.dataset.presetCategory === category));
        }
        document.getElementById("presetSaveUI").classList.add("hidden");
        const sortInput = document.getElementById("presetSort");
        for (const option of sortInput.options) {
            option.disabled = category === "local" && ["likes", "views", "saves"].includes(option.value);
        }
        if (category === "local" && ["likes", "views", "saves"].includes(currentSort)) {
            currentSort = "default";
            sortInput.value = currentSort;
        }
        if (refreshList) void refresh();
    }

    function open(save = false) {
        popup.classList.remove("hidden");
        document.getElementById("presetBtn").setAttribute("aria-expanded", "true");
        if (save) {
            showSave("local");
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

    function renderLocalPresets() {
        const search = currentSearch.toLocaleLowerCase();
        const entries = localStore.list().filter(preset =>
            `${preset.name} ${preset.description ?? ""}`.toLocaleLowerCase().includes(search));
        entries.sort(currentSort === "name"
            ? (a, b) => a.name.localeCompare(b.name)
            : (a, b) => (b.updated ?? b.created ?? 0) - (a.updated ?? a.created ?? 0));
        list.replaceChildren();
        if (!entries.length) {
            const empty = document.createElement("p");
            empty.textContent = "Hier sind noch keine lokalen Presets. Speichere ein Visual auf diesem Geraet.";
            list.append(empty);
        }
        for (const preset of entries) {
            const actions = document.createElement("div");
            actions.className = "community-preset-actions";
            actions.append(button("Laden", () => applyPreset(preset)));
            actions.append(button("Aktuelle Ansicht hier aktualisieren", () => {
                saveDestination = "local";
                editingPreset = preset;
                nameInput.value = preset.name;
                descriptionInput.value = preset.description ?? "";
                publishInput.checked = false;
                updateSaveTarget();
                document.getElementById("presetSaveUI").classList.remove("hidden");
                nameInput.focus();
            }));
            actions.append(button("Auf diesem Geraet loeschen", async () => {
                if (!window.confirm(`"${preset.name}" nur auf diesem Geraet loeschen?`)) return;
                localStore.delete(preset.name);
                if (editingPreset?.name === preset.name && saveDestination === "local") {
                    editingPreset = null;
                    document.getElementById("presetSaveUI").classList.add("hidden");
                }
                status.textContent = "Lokales Preset geloescht. Kontopresets bleiben unveraendert.";
                await refresh();
            }));
            if (currentUser && workspaceState.ready) actions.append(button("Private Kopie in mein Konto speichern", async assertCurrent => {
                const data = readVisualizationPreset(preset);
                await savePreset({
                    name: preset.name,
                    description: preset.description || "Aus lokalem Speicher importiert",
                    presetData: buildVisualizationPreset(preset.name, data.view, data.knobs, data.xlut),
                    publish: false,
                }, currentUser.id);
                assertCurrent();
                status.textContent = `"${preset.name}" privat in Datensatz ${currentDataset} kopiert. Lokales Original bleibt erhalten.`;
                await refresh();
            }));
            list.append(createLocalPresetCard(preset, actions));
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
                saveDestination = "account";
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
            actions.append(button("In Meine Presets speichern", async assertCurrent => {
                await saveCommunityPreset(entry.id);
                assertCurrent();
                status.textContent = "Private Kopie in Meine Presets gespeichert.";
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
            if (currentCategory === "local") {
                renderLocalPresets();
                return;
            }
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
                    ? "Melde dich fuer Meine Presets an. Ohne Login kannst du auf diesem Geraet speichern."
                    : "Hier sind noch keine Presets.";
                list.append(empty);
            } else {
                for (const entry of filtered) list.append(renderEntry(entry));
            }
        } catch (error) {
            if (request !== revision) return;
            list.replaceChildren();
            const failure = document.createElement("p");
            failure.className = "community-error";
            failure.textContent = error.message;
            list.append(failure);
            console.error("Preset-Bibliothek:", error);
        }
    }

    function showSave(destination) {
        saveDestination = destination;
        selectCategory(destination === "local" ? "local" : "mine");
        editingPreset = null;
        updateSaveTarget();
        nameInput.value = "";
        descriptionInput.value = "";
        publishInput.checked = false;
        document.getElementById("presetSaveUI").classList.remove("hidden");
        nameInput.focus();
    }

    async function saveCurrent() {
        const local = saveDestination === "local";
        if (!local && !currentUser) throw new Error("Zum Speichern im Konto bitte zuerst anmelden.");
        if (!local && !workspaceState.ready) throw new Error("Kontoberechtigungen werden noch geprueft.");
        const ticket = workspaceState.ticket();
        const userId = currentUser?.id;
        if (!local && editingPreset && (editingPreset.owner_id !== userId || editingPreset.dataset !== currentDataset)) {
            throw new Error("Bearbeitungsziel gehoert nicht zum aktiven Arbeitsbereich.");
        }
        const name = nameInput.value.trim();
        if (!/^[\p{L}\p{N} _.\-+()]{1,64}$/u.test(name)) {
            throw new Error("Name: 1-64 Zeichen, Buchstaben/Zahlen, Leerzeichen oder _ . - + ( ).");
        }
        const presetData = buildVisualizationPreset(name, fractalRenderer.getView(), serializeKnobs(knobs), xlutUI.getChains());
        if (local) {
            localStore.save({
                name, description: descriptionInput.value.trim(), presetData,
                originalName: editingPreset?.name ?? null,
            });
            editingPreset = null;
            currentPresetId = null;
            document.getElementById("presetSaveUI").classList.add("hidden");
            status.textContent = `"${name}" auf diesem Geraet gespeichert. Kein Cloud-Backup.`;
            await refresh();
            return;
        }
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
            : `"${name}" in deinem Konto · Datensatz ${currentDataset} gespeichert.`;
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
    document.getElementById("presetSaveAsBtn").addEventListener("click", () => showSave("account"));
    document.getElementById("presetSaveLocalBtn").addEventListener("click", () => showSave("local"));
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
    updateSaveTarget();
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
