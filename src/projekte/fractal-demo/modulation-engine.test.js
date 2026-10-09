import { test } from "node:test";
import assert from "node:assert/strict";
import { applyModulations } from "./modulation-engine.js";
import { BaseMode, KnobState, ModMode } from "./knob-state.js";

function makeMod(mode, value) {
    return {
        sourceObj: { name: `source-${value}` },
        transformObj: { apply: () => value },
        amount: 1,
        mode,
    };
}

function evaluate(knob) {
    applyModulations({ test: knob }, {
        sourceContext: { evaluate: source => Number(source.name.slice("source-".length)) },
        log: () => {},
    });
}

test("punch-only modulation clamps the displayed value without moving the base", () => {
    const knob = new KnobState(0.9);
    knob.cmValue = 0.9;
    knob.modEnabled = true;
    knob.mods.push(makeMod(ModMode.PUNCH, 0.3));

    evaluate(knob);

    assert.equal(knob.liveValue, 0.9);
    assert.equal(knob.cmValue, 1);
});

test("slide base modulation updates the base and applies punch inside its range", () => {
    const knob = new KnobState(0.5);
    knob.modEnabled = true;
    knob.mode = BaseMode.SLIDE;
    knob.smooth = 0;
    knob.mods.push(makeMod(ModMode.BASE, 1), makeMod(ModMode.PUNCH, 0.2));

    evaluate(knob);

    assert.ok(Math.abs(knob.liveValue - 0.6) < 1e-12);
    assert.ok(Math.abs(knob.cmValue - 0.8) < 1e-12);
});

test("bounce base modulation reverses direction at the range boundary", () => {
    const knob = new KnobState(0.95);
    knob.modEnabled = true;
    knob.mode = BaseMode.BOUNCE;
    knob.smooth = 0;
    knob.mods.push(makeMod(ModMode.BASE, 1));

    evaluate(knob);

    assert.equal(knob.bounceDir, -1);
    assert.ok(Math.abs(knob.liveValue - (1 - 1e-6)) < 1e-12);
    assert.ok(Math.abs(knob.cmValue - knob.liveValue) < 1e-12);
});

test("disabled modulation does not change knob values", () => {
    const knob = new KnobState(0.4);
    knob.mods.push(makeMod(ModMode.PUNCH, 0.5));

    evaluate(knob);

    assert.equal(knob.liveValue, 0.4);
    assert.equal(knob.cmValue, 0.4);
});
