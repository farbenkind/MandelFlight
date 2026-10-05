import { fmod } from "./util.js";

export function makeEnv({ name, source, attack, decay }) {
    return {
        type: "env",
        name,
        source,
        value: 0,

        params: {
            attack: { min: 0, max: 1, exp: false, value: attack },
            decay: { min: 0, max: 1, exp: false, value: decay }
        },

        update() {
            const input = this.source();
            if (input > 0) this.value += this.params.attack.value;
            this.value *= this.params.decay.value;
            return this.value;
        }
    };
}
export function makeConst({ name, value }) {
    return {
        type: "const",
        name,
        value: 0,

        params: {
            value: { min: -1, max: 1, exp: false, value: value },
        },

        update() {
            this.value = this.params.value.value;
            return this.value;
        }
    };
}
export function makeOsc1({ name, freq, shape }) {
    return {
        type: "osc",
        name,
        freq,
        shape,
        value: 0,
        phase: 0,

        params: {
            freq: { min: 1 / 3600, max: 5, exp: true, value: freq },
            shape: { min: -1.0, max: 1, exp: false, value: shape },
        },

        update() {
            // Phase update
            this.phase = fmod(this.phase + this.params.freq.value * (1 / 60), 1.0);

            const t = this.phase;
            const S = this.params.shape.value;

            // Peak position (0 = ramp down, 0.5 = triangle, 1 = ramp up)
            const p = (S + 1) * 0.5;

            // Abstand zum Peak
            const d = Math.abs(t - p);

            // Normierung: linker oder rechter Bereich
            const denom = (t < p ? p : (1 - p));

            // Schutz gegen 0
            const safe = denom + 1e-6;

            // Dreiecksform
            this.value = 1 - d / safe;

            return this.value;
        }
    };
}
export function makeLinearTransform({ slope = 1 / 2, bias = 0 }) {
    return {
        type: "linear",
        name: "linear",
        params: {
            slope: { min: -1, max: 1, exp: false, value: slope },
            bias: { min: -1, max: 1, exp: false, value: bias }
        },

        apply(x) {
            const s = Math.pow(this.params.slope.value * 2, 3);
            const b = Math.pow(this.params.bias.value * 2, 3);
            return (x + b) * s;
        }
    }
};
export function makePowerTransform({ exponent = 1 }) {
    return {
        type: "power",
        name: "power",
        params: {
            exponent: { min: 1 / 5, max: 5, exp: true, value: exponent },
        },

        apply(x) {
            return Math.pow(x, this.params.exponent.value);
        }
    }
}
export function makeSourceFromName(name) {

    // Audio‑Beats (globale Variablen)
    if (name === "bassEnv") return makeEnv({
        name: name,
        source: () => window.bassBeat,
        attack: 0.3,
        decay: 0.7
    });

    if (name === "midEnv") return makeEnv({
        name,
        source: () => window.midBeat,
        attack: 0.3,
        decay: 0.7
    });

    if (name === "treEnv") return makeEnv({
        name,
        source: () => window.treBeat,
        attack: 0.3,
        decay: 0.7
    });

    // OSC‑Quellen
    if (name === "osc1") return makeOsc1({
        name,
        freq: 1,
        shape: 0,
    });

    if (name === "osc2") return makeOsc({
        name,
        freq: 0.4,
        phase: 0
    });

    if (name === "const") return makeConst({
        name,
        value: .1,
    });

    // Random‑Quelle
    if (name === "random") return makeRandom({
        name,
        speed: 0.3
    });

    if (name === "bassBeat") return { name, type: "beat", update: () => window.bassBeat, params: {} };
    if (name === "midBeat") return { name, type: "beat", update: () => window.midBeat, params: {} };
    if (name === "treBeat") return { name, type: "beat", update: () => window.treBeat, params: {} };
    // Fallback
    console.warn("Unknown source:", name);
    return makeEnv({
        name: "fallbackEnv",
        source: () => 0,
        attack: 0.0,
        decay: 1.0
    });
}

export function createSource(name, params) {
    //const obj = sourceRegistry[name]();
    const obj = makeSourceFromName(name);
    Object.assign(obj.params, params);
    return obj;
}
export function createTransform(name, params) {
    //const obj = transformRegistry[name]();
    const obj = makeLinearTransform(.5, .5);
    Object.assign(obj.params, params);
    return obj;
}
