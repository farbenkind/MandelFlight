import { fmod } from "./util.js";
import { beatDivisions, dividedBeatPhase } from "./beat-divisions.js";
import { legacyModulationSignals, MODULATION_DELTA_TIME } from "./modulation-runtime.js";
import { makeRandomSource } from "./random-source.js";
import { makeGliderProcessor } from "./glider-processor.js";

export function makeEnv({ name = "env", source = "bassBeat", attack = 0.3, decay = 0.7 }) {
    return {
        type: "env",
        name,
        source,
        value: 0,

        params: {
            ...(typeof source === "string" ? { source: sourceInputParam(source) } : {}),
            attack: { ui: "slider", min: 0, max: 1, exp: false, value: attack },
            decay: { ui: "slider", min: 0, max: 1, exp: false, value: decay }
        },

        update(context = createSourceContext()) {
            const input = typeof this.source === "function"
                ? this.source() : context.input(this, "source");
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
            value: { ui: "slider", min: -1, max: 1, exp: false, value: value },
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
            freq: { ui: "slider", min: 1 / 3600, max: 5, exp: true, value: freq },
            shape: { ui: "slider", min: -1.0, max: 1, exp: false, value: shape },
        },

        update(context = createSourceContext()) {
            // Phase update
            // Preserve the legacy 1/60 increment at the existing 40 Hz tick rate.
            this.phase = fmod(this.phase + this.params.freq.value * context.deltaTime * (2 / 3), 1.0);

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
            slope: { ui: "slider", min: -1, max: 1, exp: false, value: slope },
            bias: { ui: "slider", min: -1, max: 1, exp: false, value: bias }
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
            exponent: { ui: "slider", min: 1 / 5, max: 5, exp: true, value: exponent },
        },

        apply(x) {
            return Math.pow(x, this.params.exponent.value);
        }
    }
}
export const sourceRegistry = new Map();
sourceRegistry.set("random", { label: "Random", category: "Source", create: makeRandomSource });
sourceRegistry.set("glider", {
    label: "Glider", category: "Processor",
    create: () => makeGliderProcessor(sourceInputParam("random")),
});
export const transformRegistry = new Map([
    ["linear", { label: "Linear", initialParams: { slope: 1, bias: 0 }, create: () => makeLinearTransform({}) }],
    ["power", { label: "Power", create: () => makePowerTransform({}) }],
]);

for (const [band, signal] of [["bass", "bassBeat"], ["mid", "midBeat"], ["tre", "treBeat"]]) {
    sourceRegistry.set(`${band}Env`, {
        label: `${band}Env`, category: "Processor",
        create: () => makeEnv({
            name: `${band}Env`, source: signal, attack: 0.3, decay: 0.7,
        }),
    });
    sourceRegistry.set(signal, {
        label: signal, category: "Source",
        create: () => ({
            name: signal, type: "beat", params: {},
            update: (context = createSourceContext()) => context.signal(signal),
        }),
    });
}
sourceRegistry.set("osc1", {
    label: "osc1", category: "Generator",
    create: () => makeOsc1({ name: "osc1", freq: 1, shape: 0 }),
});
sourceRegistry.set("const", {
    label: "const", category: "Source",
    create: () => makeConst({ name: "const", value: 0.1 }),
});

const beatClockSignals = {
    beatPhase: phase => phase,
    beatSaw: phase => phase,
    beatTri: phase => 1 - Math.abs(2 * phase - 1),
    beatPulse: phase => phase < 0.5 ? 1 : 0,
    beatSin: phase => 0.5 - 0.5 * Math.cos(2 * Math.PI * phase),
};

for (const [name, signal] of Object.entries(beatClockSignals)) {
    sourceRegistry.set(name, {
        label: name, category: "Source",
        create: () => ({
            name, type: "clock",
            params: name === "beatPhase" ? {} : {
                division: {
                    ui: "select", label: "Division", value: "1/4",
                    options: beatDivisions.map(({ value, label }) => ({ value, label })),
                },
            },
            update(context = createSourceContext()) {
                if (name !== "beatPhase") {
                    return signal(dividedBeatPhase(context.signal("beatPosition"), this.params.division.value));
                }
                const phase = context.signal("beatPhase");
                if (!Number.isFinite(phase)) {
                    throw new Error("BeatClock phase is not initialized.");
                }
                return signal(fmod(phase, 1));
            },
        }),
    });
}

export function makeSourceFromName(name) {
    const entry = sourceRegistry.get(name);
    if (!entry) throw new Error(`Unknown or unimplemented source: ${name}`);
    return entry.create();
}

export function sourceInputParam(value) {
    return {
        ui: "select",
        reference: "source",
        value,
        get options() {
            return [...sourceRegistry].map(([name, entry]) => ({
                label: entry.label ?? name, value: name,
            }));
        },
    };
}

const sourceInputs = new WeakMap();

// One context per modulation tick: shared instances advance only once.
export function createSourceContext({
    deltaTime = MODULATION_DELTA_TIME, time = 0,
    signals = legacyModulationSignals(), random = Math.random,
} = {}) {
    if (!Number.isFinite(deltaTime) || deltaTime < 0 || !Number.isFinite(time) || time < 0) {
        throw new Error("Modulation time and deltaTime must be finite and nonnegative.");
    }
    if (!signals || typeof signals !== "object" || typeof random !== "function") {
        throw new Error("Modulation signals and random provider are invalid.");
    }
    const snapshot = { ...signals };
    const values = new Map();
    const active = [];
    return {
        deltaTime,
        time,
        signal(name) {
            const value = snapshot[name];
            if (!Number.isFinite(value)) throw new Error(`Modulation signal ${name} is not initialized or finite.`);
            return value;
        },
        random() {
            const value = random();
            if (!Number.isFinite(value) || value < 0 || value >= 1) {
                throw new Error("Modulation random provider must return a value in [0, 1).");
            }
            return value;
        },
        evaluate(source) {
            if (values.has(source)) return values.get(source);
            if (active.some(item => item === source || item.name === source.name)) {
                throw new Error(`Cyclic source input: ${[...active.map(item => item.name), source.name].join(" -> ")}`);
            }
            active.push(source);
            try {
                const value = source.update(this);
                values.set(source, value);
                return value;
            } finally {
                active.pop();
            }
        },
        input(owner, key) {
            const param = owner.params[key];
            if (param?.reference !== "source") throw new Error(`Not a source input: ${key}`);
            if (!sourceRegistry.has(param.value)) throw new Error(`Unknown source input: ${param.value}`);
            let inputs = sourceInputs.get(owner);
            if (!inputs) {
                inputs = new Map();
                sourceInputs.set(owner, inputs);
            }
            let input = inputs.get(key);
            if (!input || input.name !== param.value) {
                input = { name: param.value, source: createSource(param.value) };
                inputs.set(key, input);
            }
            return this.evaluate(input.source);
        },
    };
}

export function serializeParams(params) {
    return Object.fromEntries(Object.entries(params).map(([key, param]) => [key, param.value]));
}

export function restoreParams(params, saved = {}) {
    for (const [key, savedParam] of Object.entries(saved)) {
        const param = params[key];
        if (!param) throw new Error(`Unknown parameter: ${key}`);
        const value = savedParam !== null && typeof savedParam === "object"
            ? savedParam.value : savedParam;
        const valid = param.ui === "slider"
            ? typeof value === "number" && Number.isFinite(value) && value >= param.min && value <= param.max
            : param.ui === "select"
                ? param.options.some(option => (typeof option === "object" ? option.value : option) === value)
                : param.ui === "checkbox" && typeof value === "boolean";
        if (!valid) throw new Error(`Invalid value for parameter: ${key}`);
        param.value = value;
    }
}

export function createSource(name, params) {
    const obj = makeSourceFromName(name);
    restoreParams(obj.params, params);
    return obj;
}

export function createTransform(name, params) {
    const entry = transformRegistry.get(name);
    if (!entry) throw new Error(`Unknown transform: ${name}`);
    const obj = entry.create();
    restoreParams(obj.params, params);
    return obj;
}
