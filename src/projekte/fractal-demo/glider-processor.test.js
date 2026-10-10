import { test } from "node:test";
import assert from "node:assert/strict";
import { createSource, createSourceContext, createTransform, serializeParams } from "./modulation.js";
import { makeGliderProcessor } from "./glider-processor.js";
import { createAudioReactControl } from "./audio-react-control.js";
import { KnobState, ModMode, serializeKnobs, deserializeKnobs } from "./knob-state.js";
import { applyModulations } from "./modulation-engine.js";

function tick(glider, position, deltaTime = 0.025, random = () => 0.25) {
    return createSourceContext({ deltaTime, signals: { beatPosition: position }, random }).evaluate(glider);
}

test("Random through Glider initializes at input and smooths later held values without overshoot", () => {
    const glider = createSource("glider");
    assert.deepEqual(Object.keys(glider.params), ["input", "speed"]);
    assert.equal(tick(glider, 0, 0.025, () => 0.2), 0.2);
    assert.equal(tick(glider, 0.5, 0.025, () => 0.9), 0.2);
    let value = tick(glider, 1, 0.025, () => 0.8);
    assert.ok(value > 0.2 && value < 0.8);
    for (let i = 0; i < 20; i++) {
        const next = tick(glider, 1.1);
        assert.ok(next >= value && next <= 0.8);
        value = next;
    }
    const down = tick(glider, 2, 0.025, () => 0.1);
    assert.ok(down < value && down > 0.1);
});

test("BeatSaw through Glider smooths the wrap and source switches retain the output", () => {
    const glider = createSource("glider", { input: "beatSaw" });
    assert.equal(tick(glider, 0.9), 0.9);
    const value = tick(glider, 1);
    assert.ok(value > 0 && value < 0.9);
    glider.params.input.value = "random";
    const switched = tick(glider, 1.1, 0.025, () => 0.1);
    assert.ok(switched > 0.1 && switched < value);
    glider.params.input.value = "glider";
    assert.throws(() => tick(glider, 2), /Cyclic/);
});

test("exponential smoothing is invariant under time subdivision at every Speed", () => {
    for (const speed of [0, 0.5, 1]) {
        function response(steps) {
            const glider = makeGliderProcessor({});
            glider.params.speed.value = speed;
            glider.update({ deltaTime: 0, input: () => 0 });
            for (let i = 0; i < steps; i++) glider.update({ deltaTime: 1 / steps, input: () => 1 });
            return glider.output;
        }
        assert.ok(Math.abs(response(1) - response(40)) < 1e-12);
        assert.ok(Math.abs(response(40) - response(144)) < 1e-12);
        if (speed === 0) assert.ok(response(40) > 0 && response(40) < 0.002);
        if (speed === 0.5) assert.ok(response(40) > 0.25 && response(40) < 0.3);
        if (speed === 1) assert.ok(response(40) > 0.999);
    }
});

test("zero elapsed time holds output, pause does not catch up, and each tick evaluates once", () => {
    const glider = createSource("glider");
    tick(glider, 0, 0.025, () => 0.2);
    assert.equal(tick(glider, 1, 0, () => 0.8), 0.2);
    const control = createAudioReactControl({ setAttribute() {}, addEventListener() {} },
        position => tick(glider, position, 0.025, () => 0.8));
    control.toggle();
    control.update(2);
    control.update(100);
    assert.equal(glider.output, 0.2);
    control.toggle();
    control.update(101);
    const expected = 0.2 + 0.6 * -Math.expm1(-Math.sqrt(0.1) * 0.025);
    assert.ok(Math.abs(glider.output - expected) < 1e-12);
    const context = createSourceContext({ signals: { beatPosition: 102 }, random: () => 0.9 });
    const once = context.evaluate(glider);
    assert.equal(context.evaluate(glider), once);
});

test("Glider chains apply to targets and serialize only Input and Speed", () => {
    for (const [target, input] of [["hueShift", "random"], ["relax-r", "beatSaw"]]) {
        const knob = new KnobState(0.1);
        knob.modEnabled = true;
        const glider = createSource("glider", { input, speed: 0.75 });
        knob.mods.push({ sourceObj: glider, transformObj: createTransform("linear"), amount: 0.5, mode: ModMode.PUNCH });
        applyModulations({ [target]: knob }, {
            sourceContext: createSourceContext({ signals: { beatPosition: 0.5 }, random: () => 0.6 }), log: () => {},
        });
        assert.ok(knob.cmValue > 0.1);
        const restored = deserializeKnobs(serializeKnobs({ [target]: knob }))[target].mods[0].sourceObj;
        assert.deepEqual(serializeParams(restored.params), { input, speed: 0.75 });
        assert.equal(restored.output, null);
        assert.equal(tick(restored, 0.5, 0.025, () => 0.6), input === "random" ? 0.6 : 0.5);
    }
});

test("invalid Speed, time and input fail explicitly", () => {
    assert.throws(() => createSource("glider", { speed: 2 }), /Invalid/);
    const glider = makeGliderProcessor({});
    for (const deltaTime of [-1, NaN, Infinity]) {
        assert.throws(() => glider.update({ deltaTime, input: () => 0 }), /deltaTime/);
    }
    assert.throws(() => glider.update({ deltaTime: 0.025, input: () => NaN }), /Input/);
    glider.params.speed.value = NaN;
    assert.throws(() => glider.update({ deltaTime: 0.025, input: () => 0 }), /Speed/);
});
