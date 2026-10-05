import { knobs, serializeKnobs, deserializeKnobs } from "./knob-state.js";
import { openYesNo } from "./ui/dialogs.js";

export function createPresets({ fractalRenderer, packCMParams }) {
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
            version: 1
        };
    }
    //          2. Lokales Speichern (localStorage)
    function savePresetLocal(preset) {
        const presets = JSON.parse(localStorage.getItem("presets") || "[]");
        presets.push(preset);
        localStorage.setItem("presets", JSON.stringify(presets));
    }
    //          3. Lokales Laden (Liste anzeigen)
    function loadPresetsLocal() {
        return JSON.parse(localStorage.getItem("presets") || "[]");
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
    //          7. Load‑Popup öffnen (Taste L Liste Anzeigen)
    function deletePreset(index) {
        const presets = loadPresetsLocal();
        presets.splice(index, 1);
        localStorage.setItem("presets", JSON.stringify(presets));
    }

    function openPresetLoadPopup() {
        popupOpen = true;

        presetPopupTitle.textContent = "Preset laden";
        presetSaveUI.classList.add("hidden");
        presetLoadUI.classList.remove("hidden");
        presetPopup.classList.remove("hidden");

        const presets = loadPresetsLocal();
        presetList.innerHTML = "";

        presets.forEach((p, idx) => {
            const li = document.createElement("li");
            li.textContent = p.name;

            // Laden
            li.onclick = () => applyPreset(p);

            // Löschen
            const del = document.createElement("button");
            del.textContent = "X";
            del.style.float = "right";
            del.onclick = (ev) => {
                ev.stopPropagation();
                deletePreset(idx);
                openPresetLoadPopup(); // reload list
            };

            li.appendChild(del);
            presetList.appendChild(li);
        });
    }
    //          8. Preset anwenden
    function applyPreset(preset) {
        // Fractal
        fractalRenderer.setView({
            centerX: preset.fractalParams.centerX,
            centerY: preset.fractalParams.centerY,
            zoom: preset.fractalParams.zoom,
            maxIter: preset.fractalParams.iter,
        });

        // CM Editor
        //Object.assign(knobs, preset.knobs);
        Object.assign(knobs, deserializeKnobs(preset.knobs));

        presetPopup.classList.add("hidden");
        popupOpen = false;
    }
    // Save Preset
    async function trySavePreset(name) {
        const presets = loadPresetsLocal();
        const exists = presets.some(p => p.name === name);

        if (exists) {
            const action = await openYesNo(`Preset "${name}" existiert bereits.\nOverwrite?`);
            if (action !== "yes") return;
        }

        const preset = buildPreset(name);
        savePresetLocal(preset);
        closePresetPopup();
    }

    //          9. Save‑Button
    document.getElementById("presetSaveBtn").onclick = () => {
        const name = presetNameInput.value.trim();
        trySavePreset(name)
    };

    return { openSave: openPresetSavePopup, openLoad: openPresetLoadPopup, isOpen: () => popupOpen };
}
