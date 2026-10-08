import { test } from "node:test";
import assert from "node:assert/strict";
import { createSource, createTransform, restoreParams, serializeParams, sourceRegistry, createSourceContext, sourceInputParam, makeEnv } from "./modulation.js";
import { KnobState, serializeKnobs, deserializeKnobs } from "./knob-state.js";

test("old preset metadata does not overwrite parameter definitions", () => {
    const source = createSource("bassEnv", {
        attack: { min: -10, max: 10, value: 0.4 },
        decay: { value: 0.8 },
    });
    assert.deepEqual(source.params.attack, {
        ui: "slider", min: 0, max: 1, exp: false, value: 0.4,
    });
    assert.deepEqual(serializeParams(source.params), { source: "bassBeat", attack: 0.4, decay: 0.8 });
});

test("all parameter types round trip without UI metadata", () => {
    const params = {
        amount: { ui: "slider", min: 0, max: 1, value: 0 },
        division: { ui: "select", options: ["1/4", "1/8"], value: "1/4" },
        enabled: { ui: "checkbox", value: false },
        numeric: { ui: "select", options: [{ label: "Two", value: 2 }], value: 2 },
    };
    restoreParams(params, { amount: 0.5, division: "1/8", enabled: true, numeric: 2 });
    assert.deepEqual(serializeParams(params), {
        amount: 0.5, division: "1/8", enabled: true, numeric: 2,
    });
    assert.throws(() => restoreParams(params, { amount: NaN }), /Invalid/);
    assert.throws(() => restoreParams(params, { division: "1/32" }), /Invalid/);
    assert.throws(() => restoreParams(params, { enabled: "true" }), /Invalid/);
    assert.throws(() => restoreParams(params, { unknown: 1 }), /Unknown/);
});

test("every advertised source has a factory and declared controls", () => {
    for (const name of sourceRegistry.keys()) {
        const source = createSource(name);
        assert.equal(source.name, name);
        assert.equal(typeof source.update, "function");
        for (const param of Object.values(source.params)) assert.ok(["slider", "select", "checkbox"].includes(param.ui));
    }
    assert.throws(() => createSource("missing"), /Unknown/);
});

test("clock sources follow global phase without independent state", () => {
    const previousWindow = globalThis.window;
    globalThis.window = { beatPhase: 0 };
    try {
        const expected = {
            beatPhase: [0, 0.25, 0.5, 0.75, 0],
            beatSaw: [0, 0.25, 0.5, 0.75, 0],
            beatTri: [0, 0.5, 1, 0.5, 0],
            beatPulse: [1, 1, 0, 0, 1],
            beatSin: [0, 0.5, 1, 0.5, 0],
        };
        for (const [name, values] of Object.entries(expected)) {
            const source = createSource(name);
            assert.deepEqual(source.params, {});
            [0, 0.25, 0.5, 0.75, 1].forEach((phase, index) => {
                window.beatPhase = phase;
                assert.ok(Math.abs(source.update() - values[index]) < 1e-10);
            });
            const restored = createSource(name, serializeParams(source.params));
            assert.equal(restored.name, name);
        }
        window.beatPhase = undefined;
        assert.throws(() => createSource("beatPhase").update(), /not initialized/);
    } finally {
        globalThis.window = previousWindow;
    }
});

test("source inputs resolve, switch and survive preset serialization", () => {
    const previousWindow = globalThis.window;
    globalThis.window = { bassBeat: 1, midBeat: 0 };
    try {
        const env = makeEnv({ source: "bassBeat", attack: 0.4, decay: 0.5 });
        assert.equal(createSourceContext().evaluate(env), 0.2);
        env.params.source.value = "midBeat";
        assert.equal(createSourceContext().evaluate(env), 0.1);
        const restored = createSource("bassEnv", serializeParams(env.params));
        assert.equal(restored.params.source.value, "midBeat");
        assert.equal(createSourceContext().evaluate(restored), 0);
        const context = createSourceContext();
        env.params.source.value = "bassBeat";
        const once = context.evaluate(env);
        assert.equal(context.evaluate(env), once);
    } finally {
        globalThis.window = previousWindow;
    }
});

test("new registry processors work without UI or serialization changes", () => {
    let updates = 0;
    sourceRegistry.set("testSignal", {
        create: () => ({ name: "testSignal", params: {}, update() { updates++; return 0.5; } }),
    });
    sourceRegistry.set("testProcessor", {
        create: () => ({
            name: "testProcessor",
            params: { source: sourceInputParam("testSignal") },
            update(context) { return context.input(this, "source") * 2; },
        }),
    });
    try {
        const processor = createSource("testProcessor");
        const context = createSourceContext();
        assert.equal(context.evaluate(processor), 1);
        assert.equal(context.evaluate(processor), 1);
        assert.equal(updates, 1);
        assert.ok(processor.params.source.options.some(option => option.value === "testSignal"));
        const restored = createSource("testProcessor", serializeParams(processor.params));
        assert.equal(createSourceContext().evaluate(restored), 1);
        processor.params.source.value = "testProcessor";
        assert.throws(() => createSourceContext().evaluate(processor), /Cyclic/);
        processor.params.source.value = "missing";
        assert.throws(() => createSourceContext().evaluate(processor), /Unknown source input/);
        assert.throws(() => createSource("testProcessor", { source: "missing" }), /Invalid/);
    } finally {
        sourceRegistry.delete("testSignal");
        sourceRegistry.delete("testProcessor");
    }
});

test("knob presets retain source and transform identity and values", () => {
    const knob = new KnobState(0.5);
    knob.mods.push({
        sourceObj: createSource("osc1", { freq: 0.8, shape: -0.4 }),
        transformObj: createTransform("power", { exponent: 2 }),
        amount: 0.7, mode: "punch",
    });
    const saved = serializeKnobs({ hueShift: knob });
    assert.equal(saved.hueShift.mods[0].sourceParams.freq, 0.8);
    const restored = deserializeKnobs(JSON.parse(JSON.stringify(saved)));
    assert.equal(restored.hueShift.mods[0].transformObj.name, "power");
    assert.equal(restored.hueShift.mods[0].transformObj.apply(0.5), 0.25);
    assert.equal(restored.hueShift.mods[0].sourceObj.params.shape.value, -0.4);
});
