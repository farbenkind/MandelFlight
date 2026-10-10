import { test } from "node:test";
import assert from "node:assert/strict";
import { createSourceContext, createSource, serializeParams } from "./modulation.js";
import { createModulationRuntime } from "./modulation-runtime.js";
import { createAudioReactControl } from "./audio-react-control.js";

test("explicit contexts evaluate signals and processors without browser globals", () => {
    const signals = { bassBeat: 1, beatPhase: 0.25, beatPosition: 0.25 };
    const context = createSourceContext({ signals, random: () => 0.125 });
    signals.bassBeat = 0;
    assert.equal(context.evaluate(createSource("bassBeat")), 1);
    assert.equal(context.evaluate(createSource("beatTri")), 0.5);
    assert.equal(context.evaluate(createSource("beatPhase")), 0.25);
    const env = createSource("bassEnv", { attack: 0.4, decay: 0.5 });
    assert.equal(context.evaluate(env), 0.2);
    assert.equal(context.evaluate(env), 0.2);
    assert.equal(context.random(), 0.125);
});

test("oscillator keeps legacy speed at 40 Hz and advances independently of tick subdivision", () => {
    const evaluate = steps => {
        const osc = createSource("osc1", { freq: 1, shape: 0 });
        for (let i = 0; i < steps; i++) {
            createSourceContext({ deltaTime: 0.5 / steps, signals: {} }).evaluate(osc);
        }
        return osc.phase;
    };
    assert.ok(Math.abs(evaluate(20) - 1 / 3) < 1e-12);
    assert.ok(Math.abs(evaluate(60) - evaluate(20)) < 1e-12);
    const osc = createSource("osc1");
    createSourceContext({ signals: {} }).evaluate(osc);
    assert.ok(Math.abs(osc.phase - 1 / 60) < 1e-12);
    createSourceContext({ deltaTime: 0, signals: {} }).evaluate(osc);
    assert.ok(Math.abs(osc.phase - 1 / 60) < 1e-12);
    const restored = createSource("osc1", serializeParams(osc.params));
    assert.equal(restored.phase, 0);
    assert.deepEqual(serializeParams(restored.params), serializeParams(osc.params));
});

test("pause does not accumulate elapsed modulation time or replay stale signal snapshots", () => {
    const runtime = createModulationRuntime();
    const ticks = [];
    const button = { setAttribute() {}, addEventListener() {} };
    const control = createAudioReactControl(button, signals => ticks.push(runtime.next(signals)));
    control.update({ bassBeat: 1 });
    control.toggle();
    for (let i = 0; i < 100; i++) control.update({ bassBeat: 2 });
    control.toggle();
    control.update({ bassBeat: 3 });
    assert.equal(ticks.length, 2);
    assert.equal(ticks[1].time, 0.05);
    assert.equal(ticks[1].deltaTime, 0.025);
    assert.equal(ticks[1].signals.bassBeat, 3);
});

test("invalid time, missing signals and invalid random output fail explicitly", () => {
    for (const deltaTime of [-1, NaN, Infinity]) {
        assert.throws(() => createSourceContext({ deltaTime }), /Modulation time/);
    }
    assert.throws(() => createSourceContext({ time: -1 }), /Modulation time/);
    const context = createSourceContext({ signals: {} });
    assert.throws(() => context.evaluate(createSource("bassBeat")), /not initialized/);
    assert.throws(() => createSourceContext({ random: null }), /invalid/);
    for (const value of [-1, 1, NaN]) {
        assert.throws(() => createSourceContext({ random: () => value }).random(), /\[0, 1\)/);
    }
});
