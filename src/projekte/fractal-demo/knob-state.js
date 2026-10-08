import { createSource, createTransform, serializeParams } from "./modulation.js";

export const ModMode = {
    PUNCH: "punch",
    BASE: "base",
};
export const BaseMode = {
    SLIDE: "slide",
    BOUNCE: "bounce",
}
export const ModTransfrom = {
    LINEAR: "linear",
    POWER: "power",
}
export const sliderMod = {
    SYMLIN: "symlin",
    LINEAR: "linear",
    QUBIC: "qubic",
}


export class KnobState {
    constructor(initValue) {
        this.liveValue = initValue;
        this.cmValue = initValue;
        this.presetValue = initValue;

        this.modEnabled = false;
        this.knobPressed = false;

        this.mods = [];
        this.mode = BaseMode.BOUNCE,
            this.bounceDir = 1;
        this.min = 0;
        this.max = 1;
        this.smooth = .1;
    }
}
export const knobs = {};

export function serializeKnobs(knobs) {
    const out = {};

    for (const key in knobs) {
        const k = knobs[key];

        out[key] = {
            liveValue: k.liveValue,
            cmValue: k.cmValue,
            modEnabled: k.modEnabled,
            knobPressed: k.knobPressed,
            mods: k.mods.map(m => ({
                amount: m.amount,
                mode: m.mode,
                source: m.sourceObj.name,      // z.B. "bassBeat", "midEnv", "const"
                sourceParams: serializeParams(m.sourceObj.params),
                transform: m.transformObj.name, // z.B. "scale", "curve"
                transformParams: serializeParams(m.transformObj.params),
            })),
            mode: k.mode,
            bounceDir: k.bounceDir,
            min: k.min,
            max: k.max,
            smooth: k.smooth,
        };
    }

    return out;
}
export function deserializeKnobs(data, defaults = []) {
    const out = Object.fromEntries(defaults.map(param => [param.id, new KnobState(param.init)]));

    for (const key in data) {
        const k = data[key];

        out[key] = {
            liveValue: k.liveValue,
            cmValue: k.cmValue,
            modEnabled: k.modEnabled,
            knobPressed: k.knobPressed,

            mods: k.mods.map(m => ({
                amount: m.amount,
                mode: m.mode,

                sourceObj: createSource(m.source, m.sourceParams),
                transformObj: createTransform(m.transform, m.transformParams),
            })),

            mode: k.mode,
            bounceDir: k.bounceDir,
            min: k.min,
            max: k.max,
            smooth: k.smooth,
        };
    }

    return out;
}
