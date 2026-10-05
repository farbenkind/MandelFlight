// Einzige Quelle für alle Colormap-Parameter. Daraus entstehen:
//   - die Knob-Panels im Editor (ui/cmap-ui.js)
//   - das Float32Array für den GPU-Uniform-Buffer (packCMParams)
//   - die CMParams-Struct im WGSL-Shader (cmapStructWGSL)
// Die Reihenfolge der Knobs bestimmt die Reihenfolge im Buffer.

const knob = (id, label, init, wgsl) => ({ id, label, init, wgsl });

const primChannel = (c, color, mult) => {
    const C = c.toUpperCase();
    return {
        color,
        knobs: [
            knob(`amount-${c}`, `Amount ${C}`, 1, `amount_${c}`),
            knob(`shape-${c}`, `Shape ${C}`, 0.5, `shape_${c}`),
            knob(`pow-${c}`, `Pow ${C}`, 0.5, `pow_${c}`),
            knob(`pos-${c}`, `Pos ${C}`, 0.5, `pos_${c}`),
            knob(`mult-${c}`, `Mult ${C}`, mult, `mult_${c}`),
        ],
    };
};

const warpChannel = (c, color) => {
    const C = c.toUpperCase();
    return {
        color,
        knobs: [
            knob(`prePow-x${c}`, `Shape1 X${C}`, 0.5, `xpre_${c}`),
            knob(`waveMix-x${c}`, `Mix X${C}`, 0, `xmix_${c}`),
            knob(`waveFreq-x${c}`, `Freq X${C}`, 0.1, `xfreq_${c}`),
            knob(`postPow-x${c}`, `Shape2 X${C}`, 0.5, `xpost_${c}`),
            knob(`shift-x${c}`, `Shift X${C}`, 0, `xshift_${c}`),
        ],
    };
};

// Domain-Warper vor der PrimCmap; Sektionen erscheinen von links nach rechts
export const cmapSections = [
    {
        id: "xCmap",
        containerId: "xchannels",
        panels: [
            warpChannel("r", "red"),
            warpChannel("g", "green"),
            warpChannel("b", "blue"),
        ],
    },
    {
        id: "primCmap",
        containerId: "channels",
        panels: [
            primChannel("r", "red", 0.2),
            primChannel("g", "green", 0.4),
            primChannel("b", "blue", 0.6),
            {
                color: "all",
                knobs: [
                    knob("phaseShift", "phaseShift", 0, "phaseShift"),
                    knob("hueShift", "hueShift", 0, "hueShift"),
                ],
            },
        ],
    },
];

export const cmapParams = cmapSections.flatMap(s => s.panels.flatMap(p => p.knobs));

export function packCMParams(knobs) {
    return new Float32Array(cmapParams.map(p => knobs[p.id].cmValue));
}

export const cmapStructWGSL =
    "struct CMParams {\n" +
    cmapParams.map(p => `    ${p.wgsl} : f32,`).join("\n") +
    "\n};";
