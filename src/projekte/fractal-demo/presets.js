import { knobs, serializeKnobs, deserializeKnobs } from "./knob-state.js";
import { openYesNo, openAlert } from "./ui/dialogs.js";
import { listPresets, loadPreset, saveLocal, deleteLocal, saveRemote, deleteRemote } from "./preset-store.js";

export function createPresets({ fractalRenderer, packCMParams, xlutUI, onChange }) {
    let popupOpen = false;
    //          1. Preset‑Struktur (sauber & cloud‑ready)
    function buildPreset(name) {
        const fractalView = fractalRenderer.getView();
        return {
            name,
            created: Date.now(),
            cmParams: packCMParams(),
            knobs: serializeKnobs(knobs),
            fractalParams: {
                centerX: fractalView.centerX,
                centerY: fractalView.centerY,
                zoom: fractalView.zoom,
                iter: fractalView.maxIter,
            },
            audioReact: {
                bass: window.bassBeat,
                mid: window.midBeat,
                tre: window.treBeat
            },
            xlut: xlutUI.getChains(),
            version: 1
        };
    }
    //          5. JS‑Logik für Popup
    const presetPopup = document.getElementById("presetPopup");
    const presetPopupTitle = document.getElementById("presetPopupTitle");
    const presetSaveUI = document.getElementById("presetSaveUI");
    const presetLoadUI = document.getElementById("presetLoadUI");
    const presetNameInput = document.getElementById("presetNameInput");
    const presetList = document.getElementById("presetList");

    function closePresetPopup() {
        popupOpen = false;
        presetPopup.classList.add("hidden");
    }

    document.getElementById("presetCloseBtn").onclick = () => {
        presetPopup.classList.add("hidden");
        popupOpen = false;
    };
    //          6. Save‑Popup öffnen (Taste S)
    function openPresetSavePopup() {
        popupOpen = true;
        presetPopupTitle.textContent = "Preset speichern";
        presetSaveUI.classList.remove("hidden");
        presetLoadUI.classList.add("hidden");
        presetPopup.classList.remove("hidden");
    }
    //          7. Load-Popup öffnen (Taste L): lokale und Server-Presets
    async function openPresetLoadPopup() {
        popupOpen = true;

        presetPopupTitle.textContent = "Preset laden";
        presetSaveUI.classList.add("hidden");
        presetLoadUI.classList.remove("hidden");
        presetPopup.classList.remove("hidden");
        presetList.textContent = "Lade …";

        const entries = await listPresets();
        presetList.textContent = "";
        if (!entries.length) presetList.textContent = "Keine Presets vorhanden.";

        for (const entry of entries) {
            const li = document.createElement("li");
            li.textContent = `${entry.remote ? "☁ " : "💾 "}${entry.name}`;

            li.onclick = async () => {
                try {
                    const preset = await loadPreset(entry);
                    if (preset) applyPreset(preset);
                    else openAlert("Preset konnte nicht geladen werden.");
                } catch (error) {
                    console.error("Preset konnte nicht geladen werden:", error);
                    openAlert(error.message);
                }
            };

            const del = document.createElement("button");
            del.textContent = "X";
            del.style.float = "right";
            del.onclick = async (ev) => {
                ev.stopPropagation();
                if (await openYesNo(`Preset "${entry.name}" löschen?${entry.remote ? "\n(auch auf dem Server)" : ""}`) !== "yes") return;
                try {
                    if (entry.remote) await deleteRemote(entry.name);
                    deleteLocal(entry.name);
                } catch (err) {
                    await openAlert(err.message);
                }
                openPresetLoadPopup();
            };

            li.appendChild(del);
            presetList.appendChild(li);
        }
    }    //          8. Preset anwenden
    function applyPreset(preset) {
        const restoredKnobs = deserializeKnobs(preset.knobs);
        // Fractal
        fractalRenderer.setView({
            centerX: preset.fractalParams.centerX,
            centerY: preset.fractalParams.centerY,
            zoom: preset.fractalParams.zoom,
            maxIter: preset.fractalParams.iter,
        });

        // CM Editor
        //Object.assign(knobs, preset.knobs);
        Object.assign(knobs, restoredKnobs);
        xlutUI.setChains(preset.xlut);
        onChange?.();

        presetPopup.classList.add("hidden");
        popupOpen = false;
    }
    // Save Preset: lokal oder (mit Passwort) auf dem Server
    async function trySavePreset(name, toServer) {
        if (!name) return;
        const existing = (await listPresets()).some(p => p.name === name && (toServer ? p.remote : p.local));
        if (existing) {
            const action = await openYesNo(`Preset "${name}" existiert bereits.\nOverwrite?`);
            if (action !== "yes") return;
        }

        const preset = buildPreset(name);
        try {
            if (toServer) await saveRemote(preset);
            else saveLocal(preset);
        } catch (err) {
            await openAlert(err.message);
            return;
        }
        closePresetPopup();
    }

    //          9. Save-Buttons
    document.getElementById("presetSaveBtn").onclick = () =>
        trySavePreset(presetNameInput.value.trim(), false);
    document.getElementById("presetSaveRemoteBtn").onclick = () =>
        trySavePreset(presetNameInput.value.trim(), true);

    return { openSave: openPresetSavePopup, openLoad: openPresetLoadPopup, isOpen: () => popupOpen };
}
