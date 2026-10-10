import { test } from "node:test";
import assert from "node:assert/strict";
import { createSource, createSourceContext, createTransform, serializeParams, sourceInputParam } from "./modulation.js";
import { beatDivisions } from "./beat-divisions.js";
import { KnobState, serializeKnobs, deserializeKnobs, ModMode } from "./knob-state.js";
import { applyModulations } from "./modulation-engine.js";
import { createAudioReactControl } from "./audio-react-control.js";

function tick(source, position, random = () => 0.25) {
    return createSourceContext({ signals: { beatPosition: position }, random }).evaluate(source);
}

test("Random initializes once, holds between boundaries and skips replay on jumps and reset", () => {
    const source = createSource("random");
    let draws = 0;
    const rng = () => ++draws / 10;
    assert.equal(tick(source, 0.2, rng), 0.1);
    assert.equal(tick(source, 0.9, rng), 0.1);
    assert.equal(tick(source, 1, rng), 0.2);
    assert.equal(tick(source, 1, rng), 0.2);
    assert.equal(tick(source, 5.3, rng), 0.3);
    assert.equal(source.lastTriggerPosition, 5);
    assert.equal(tick(source, 0.4, rng), 0.3);
    assert.equal(tick(source, 0.8, rng), 0.3);
    assert.equal(tick(source, 1, rng), 0.4);
    assert.equal(draws, 4);
});

test("all beat divisions and 1/1 alias trigger at exact phase-offset boundaries", () => {
    for (const entry of [...beatDivisions, { value: "1/1", beats: 4 }]) {
        const source = createSource("random", { division: entry.value, phase: 0.5 });
        let draws = 0;
        const rng = () => ++draws / 10;
        tick(source, 0, rng);
        tick(source, entry.beats * 0.49, rng);
        assert.equal(draws, 1, entry.value);
        tick(source, entry.beats * 0.5, rng);
        assert.equal(draws, 2, entry.value);
        tick(source, entry.beats * 1.49, rng);
        assert.equal(draws, 2, entry.value);
        tick(source, entry.beats * 1.5, rng);
        assert.equal(draws, 3, entry.value);
    }
    for (const phase of [0, 1]) {
        const source = createSource("random", { phase });
        assert.equal(tick(source, 0), 0.25);
        assert.equal(source.lastTriggerPosition, 0);
    }
});

test("parameter edits hold until next boundary and timing edits reanchor without drawing", () => {
    const source = createSource("random");
    let draws = 0;
    const rng = () => { draws++; return 0.25; };
    tick(source, 0, rng);
    source.params.center.value = 0.8;
    assert.equal(tick(source, 0.5, rng), 0.25);
    source.params.division.value = "1/8";
    tick(source, 0.5, rng);
    source.params.phase.value = 0.5;
    tick(source, 0.6, rng);
    assert.equal(draws, 1);
    assert.equal(tick(source, 0.75, rng), 0.4);
    assert.equal(draws, 2);
});

test("pausing holds Random and resume draws at most once for skipped boundaries", () => {
    const source = createSource("random");
    let draws = 0;
    const control = createAudioReactControl({ setAttribute() {}, addEventListener() {} },
        position => tick(source, position, () => { draws++; return 0.3; }));
    control.update(0);
    control.toggle();
    control.update(1);
    control.update(2);
    assert.equal(draws, 1);
    control.toggle();
    control.update(3);
    assert.equal(draws, 2);
    assert.equal(source.lastTriggerPosition, 3);
});

function statistics(params) {
    const source = createSource("random", params);
    const n = 10000;
    let sum = 0, variance = 0, middle = 0, edges = 0;
    for (let i = 0; i < n; i++) {
        const value = tick(source, i, () => (i + 0.5) / n);
        assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
        sum += value;
        variance += (value - 0.5) ** 2;
        if (value >= 0.35 && value <= 0.65) middle++;
        if (value < 0.1 || value > 0.9) edges++;
    }
    return { mean: sum / n, variance: variance / n, middle: middle / n, edges: edges / n };
}

test("distribution continuously morphs bounded normal through uniform to U-shaped", () => {
    const normal = statistics({ distribution: -1 });
    const uniform = statistics({ distribution: 0 });
    const u = statistics({ distribution: 1 });
    assert.ok(normal.middle > 0.65);
    assert.ok(normal.variance > 0.00027 && normal.variance < 0.00028);
    assert.ok(Math.abs(uniform.variance - 1 / 12) < 0.0001);
    assert.equal(u.edges, 1);
    assert.ok(u.variance > 0.23);
    for (const result of [normal, uniform, u]) assert.ok(Math.abs(result.mean - 0.5) < 1e-6);
    for (const distribution of [-0.7, 0, 0.7]) {
        const a = tick(createSource("random", { distribution }), 0, () => 0.2);
        const b = tick(createSource("random", { distribution: distribution + 0.00001 }), 0, () => 0.2);
        assert.ok(Math.abs(a - b) < 0.00001);
    }
});

test("extreme normal variance is reduced by 1/81 and U lobes are nine times narrower", () => {
    const normal = createSource("random", { distribution: -1 });
    const u = createSource("random", { distribution: 1 });
    const count = 10000;
    let normalVariance = 0, previousVariance = 0;
    let leftSum = 0, leftSquares = 0, oldLeftSum = 0, oldLeftSquares = 0;
    for (let i = 0; i < count; i++) {
        const probability = (i + 0.5) / count;
        const value = tick(normal, i, () => probability);
        const previous = 0.5 + (value - 0.5) * 9;
        normalVariance += (value - 0.5) ** 2;
        previousVariance += (previous - 0.5) ** 2;
        const edge = tick(u, i, () => probability);
        const arcsine = Math.sin(probability * Math.PI / 2) ** 2;
        if (i < count / 2) {
            assert.ok(Math.abs(edge * 9 - arcsine) < 1e-12);
            leftSum += edge;
            leftSquares += edge ** 2;
            oldLeftSum += arcsine;
            oldLeftSquares += arcsine ** 2;
        } else assert.ok(Math.abs((1 - edge) * 9 - (1 - arcsine)) < 1e-12);
    }
    assert.ok(Math.abs(normalVariance / previousVariance - 1 / 81) < 1e-12);
    const n = count / 2;
    const variance = leftSquares / n - (leftSum / n) ** 2;
    const oldVariance = oldLeftSquares / n - (oldLeftSum / n) ** 2;
    assert.ok(Math.abs(variance / oldVariance - 1 / 81) < 1e-12);
});

test("Center and Skew bias in the specified directions and endpoints stay bounded", () => {
    assert.ok(statistics({ center: 0.2 }).mean < 0.36);
    assert.ok(statistics({ center: 0.8 }).mean > 0.64);
    assert.ok(statistics({ skew: -1 }).mean < 0.15);
    assert.ok(statistics({ skew: 1 }).mean > 0.85);
    for (const distribution of [-1, 0, 1]) {
        for (const center of [0, 0.5, 1]) {
            for (const skew of [-1, 1]) {
                for (const uniform of [0, 0.5, 1 - Number.EPSILON]) {
                    const value = tick(createSource("random", { distribution, center, skew }), 0, () => uniform);
                    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
                }
            }
        }
    }
});

test("Random works in the regular source graph, engine and preset roundtrip", () => {
    const source = createSource("random", { distribution: -0.3, center: 0.6, skew: 0.2, division: "1/8", phase: 0.5 });
    const processor = {
        name: "testProcessor", params: { source: sourceInputParam("random") },
        update: function(context) { return context.input(this, "source"); },
    };
    let draws = 0;
    const context = createSourceContext({ signals: { beatPosition: 0 }, random: () => { draws++; return 0.3; } });
    assert.equal(context.evaluate(processor), 0.3);
    assert.equal(context.evaluate(processor), 0.3);
    assert.equal(draws, 1);
    const knob = new KnobState(0.2);
    knob.modEnabled = true;
    knob.mods.push({ sourceObj: source, transformObj: createTransform("linear"), amount: 0.5, mode: ModMode.PUNCH });
    applyModulations({ test: knob }, { sourceContext: context, log: () => {} });
    assert.ok(knob.cmValue > 0.2 && knob.cmValue <= 1);
    const saved = serializeKnobs({ test: knob });
    const restored = deserializeKnobs(saved, [{ id: "test", init: 0.2 }]).test.mods[0].sourceObj;
    assert.deepEqual(serializeParams(restored.params), serializeParams(source.params));
    assert.equal(restored.currentValue, null);
    assert.equal(restored.lastTriggerPosition, null);
    assert.throws(() => createSource("random", { distribution: 2 }), /Invalid/);
    assert.throws(() => tick(createSource("random"), undefined), /not initialized/);
});
