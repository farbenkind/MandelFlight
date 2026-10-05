import { bakeChain } from "../../function-plotter/functions.js";

const SEL_KEY = "xlutSelection";
const PRESETS_KEY = "plotterPresets";
const CHANNELS = ["XR", "XG", "XB"];

const readJSON = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};

// Pro xCmap-Kanal ein Dropdown mit den im Function Plotter gespeicherten Presets.
// Die gewaehlte Kette wird zur LUT gebacken und per setLut auf die GPU gelegt.
export function createXlutUI({ root, cmSize, setLut, onChange }) {
    const selection = readJSON(SEL_KEY, [null, null, null]);
    // Aus einem geladenen Preset eingebettete Ketten (haben Vorrang vor der Auswahl)
    const embedded = [null, null, null];

    function chainOf(channel) {
        if (embedded[channel]) return embedded[channel];
        return readJSON(PRESETS_KEY, []).find(p => p.name === selection[channel])?.stages ?? null;
    }

    function apply(channel) {
        const stages = chainOf(channel);
        setLut(channel, stages ? bakeChain(stages, cmSize) : null);
    }

    function build() {
        const presets = readJSON(PRESETS_KEY, []);
        root.replaceChildren();
        CHANNELS.forEach((label, channel) => {
            const row = document.createElement("label");
            row.textContent = `${label} Kette: `;
            const sel = document.createElement("select");
            sel.append(new Option("(keine)", ""));
            for (const p of presets) sel.append(new Option(p.name, p.name));
            if (embedded[channel]) sel.append(new Option("(aus Preset)", "__embedded"));
            sel.value = embedded[channel] ? "__embedded" : presets.some(p => p.name === selection[channel]) ? selection[channel] : "";
            sel.addEventListener("change", () => {
                if (sel.value === "__embedded") return;
                embedded[channel] = null;
                selection[channel] = sel.value || null;
                localStorage.setItem(SEL_KEY, JSON.stringify(selection));
                apply(channel);
                onChange();
            });
            row.append(sel);
            root.append(row);
        });
        CHANNELS.forEach((_, c) => apply(c));
    }

    // Presets koennen im Plotter-Tab geaendert worden sein
    window.addEventListener("focus", () => { build(); onChange(); });
    build();
    return {
        getChains: () => CHANNELS.map((_, c) => chainOf(c)),
        setChains(chains) {
            CHANNELS.forEach((_, c) => { embedded[c] = chains?.[c] ?? null; selection[c] = null; });
            localStorage.setItem(SEL_KEY, JSON.stringify(selection));
            build();
            onChange();
        },
    };
}