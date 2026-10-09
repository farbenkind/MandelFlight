import { knobs, serializeKnobs, deserializeKnobs } from "./knob-state.js";
import { cmapParams } from "./colormap/params.js";
import { buildVisualizationPreset, isVisualizationPreset, readVisualizationPreset } from "./preset-format.js";
import { supabase } from "./supabase-client.js";
import { signIn, signOut } from "./community-auth.js";
import {
    deletePreset, likePreset, listLikedPresetIds, listPresets, loadPresetData, recordPresetView,
    saveCommunityPreset, savePreset, setFeatured, setPublished,
} from "./community-store.js";

const CATEGORIES = ["featured", "community", "mine"];
const LOCAL_KEY = "presets";

export function createPresets({ fractalRenderer, xlutUI, onChange }) {
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
    let currentSession = null;
    let currentIsAdmin = false;
    let profileRevision = 0;
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

    function setSession(session) {
        currentSession = session;
        currentUser = session?.user ?? null;
        currentIsAdmin = false;
        const currentRevision = ++profileRevision;
        const signedOut = document.getElementById("authSignedOut");
        const signedIn = document.getElementById("authSignedIn");
        signedOut.classList.toggle("hidden", Boolean(currentUser));
        signedIn.classList.toggle("hidden", !currentUser);
        document.getElementById("authUserName").textContent =
            currentUser?.user_metadata?.full_name
            || currentUser?.user_metadata?.name
            || currentUser?.email
            || "Angemeldet";
        document.getElementById("problemBtn").disabled = !currentUser;
        if (popup && !popup.classList.contains("hidden")) void refresh();
        if (currentUser && supabase) {
            supabase.from("profiles").select("is_admin").eq("id", currentUser.id).maybeSingle()
                .then(({ data, error }) => {
                    if (error) throw error;
                    if (currentRevision !== profileRevision) return;
                    currentIsAdmin = Boolean(data?.is_admin);
                    if (popup && !popup.classList.contains("hidden")) void refresh();
                })
                .catch(error => {
                    if (currentRevision === profileRevision) report(error);
                });
        }
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
            const card = document.createElement("article");
            card.className = "community-preset-card legacy-preset";
            const title = document.createElement("h3");
            title.textContent = preset.name;
            const note = document.createElement("p");
            note.textContent = "Lokales Legacy-Preset – nach Anmeldung in My Presets importierbar.";
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
            card.dataset.localName = preset.name;
            card.append(title, note, importButton);
            list.append(card);
        }
    }

    function makePreview(entry) {
        const preview = document.createElement("div");
        preview.className = "community-preset-preview";
        const colors = entry.preview_palette ?? {};
        const amount = key => {
            const value = colors[key];
            return Number.isFinite(value) ? Math.max(0, Math.min(255, Math.round(value * 255))) : 70;
        };
        preview.style.setProperty("--preview-a", `rgb(${amount("amount-r")}, ${amount("amount-g")}, ${amount("amount-b")})`);
        preview.style.setProperty("--preview-b", `hsl(${Math.round((Number.isFinite(colors.phaseShift) ? colors.phaseShift : 0) * 360)}, 85%, 48%)`);
        preview.setAttribute("aria-label", "Farbvorschau des Presets");
        return preview;
    }

    function appendStats(card, entry) {
        const stats = document.createElement("p");
        stats.className = "community-preset-stats";
        stats.textContent = `❤️ ${entry.likes}   👁 ${entry.views}   📦 ${entry.saves}`;
        card.append(stats);
    }

    function renderEntry(entry) {
        const card = document.createElement("article");
        card.className = "community-preset-card";
        card.append(makePreview(entry));

        const heading = document.createElement("div");
        heading.className = "community-preset-heading";
        const title = document.createElement("h3");
        title.textContent = entry.name;
        heading.append(title);
        if (entry.featured) {
            const badge = document.createElement("span");
            badge.className = "featured-badge";
            badge.textContent = "★ Featured";
            heading.append(badge);
        }
        card.append(heading);

        const author = document.createElement("p");
        author.className = "community-preset-author";
        author.textContent = `von ${entry.profiles?.display_name || "MandelFlight User"}`;
        card.append(author);
        if (entry.description) {
            const description = document.createElement("p");
            description.className = "community-preset-description";
            description.textContent = entry.description;
            card.append(description);
        }
        appendStats(card, entry);

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
            actions.append(button(entry.featured ? "Featured entfernen" : "Als Featured kuratieren", async () => {
                await setFeatured(entry.id, !entry.featured, Date.now());
                status.textContent = entry.featured ? "Featured-Auszeichnung entfernt." : "Preset als Featured markiert.";
                await refresh();
            }));
        }
        card.append(actions);
        return card;
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
            if (currentCategory === "mine") renderLocalImports(new Set(entries.map(entry => entry.name)));
            status.textContent = "";
        } catch (error) {
            if (request !== revision) return;
            list.replaceChildren();
            const failure = document.createElement("p");
            failure.className = "community-error";
            failure.textContent = error.message;
            list.append(failure);
            if (currentCategory === "mine") renderLocalImports();
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
    document.getElementById("authGithubBtn").addEventListener("click", () => run(() => signIn("github")));
    document.getElementById("authSignOutBtn").addEventListener("click", () => run(signOut));
    popup.addEventListener("keydown", event => {
        if (event.key === "Escape") { event.stopPropagation(); close(); }
    });
    if (supabase) {
        supabase.auth.getSession().then(({ data, error }) => {
            if (error) report(error);
            setSession(data?.session ?? null);
        });
        supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    } else {
        document.getElementById("communityConfigNotice").textContent =
            "Community-Login ist noch nicht eingerichtet. Die öffentlichen Presets sind nach der Supabase-Konfiguration verfügbar.";
    }

    return {
        openSave: () => open(true),
        openLoad: () => open(),
        isOpen: () => !popup.classList.contains("hidden"),
        getCurrentPresetId: () => currentPresetId,
        getSession: () => currentSession,
        setSession,
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
