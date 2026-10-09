import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cmapParams, cmapSections, cmapStructWGSL, packCMParams } from "./colormap/params.js";
import { KnobState, serializeKnobs, deserializeKnobs } from "./knob-state.js";
import { updateKnobVisual } from "./ui/knob-visual.js";

test("PrimCmap power runs from dark at 0 to bright at 1", async () => {
    const shader = await readFile(new URL("./colormap/cmap-compute.wgsl", import.meta.url), "utf8");
    assert.match(shader, /fn primcolmap1[\s\S]*?spk\(c, 1\.0 - power, 10000\.0\)/);
    assert.match(shader, /fn primcolmap2[\s\S]*?spk\(c, 1\.0 - power, 10000\.0\)/);
});

test("Relax leads each xCmap column and is packed in schema order", () => {
    const states = Object.fromEntries(cmapParams.map(param => [param.id, new KnobState(param.init)]));
    for (const [index, panel] of cmapSections[0].panels.entries()) {
        const relax = panel.knobs[0];
        assert.match(relax.id, /^relax-x/);
        assert.match(panel.knobs[1].id, /^prePow-x/);
        assert.equal(relax.init, 0);
        states[relax.id].cmValue = index / 4;
        assert.ok(cmapStructWGSL.includes(`${relax.wgsl} : f32,`));
    }
    const packed = packCMParams(states);
    assert.equal(packed.length, cmapParams.length);
    cmapParams.forEach((param, index) => assert.equal(packed[index], Math.fround(states[param.id].cmValue)));
});

test("old presets reset missing Relax states, while new presets preserve modulation", () => {
    const saved = serializeKnobs({ "prePow-xr": new KnobState(0.734) });
    const restored = deserializeKnobs(saved, cmapParams);
    for (const param of cmapParams.filter(param => param.id.startsWith("relax-"))) {
        assert.deepEqual(restored[param.id], new KnobState(0));
    }
    assert.equal(restored["prePow-xr"].liveValue, 0.734);
    restored["relax-xall"].liveValue = 0.5;
    restored["relax-xall"].cmValue = 0.75;
    restored["relax-xall"].modEnabled = true;
    const roundTrip = deserializeKnobs(JSON.parse(JSON.stringify(serializeKnobs(restored))), cmapParams);
    assert.equal(roundTrip["relax-xall"].liveValue, 0.5);
    assert.equal(roundTrip["relax-xall"].cmValue, 0.75);
    assert.equal(roundTrip["relax-xall"].modEnabled, true);
});

test("Shift ends each xCmap column and retains channel/ALL values in presets and GPU packing", () => {
    const states = Object.fromEntries(cmapParams.map(param => [param.id, new KnobState(param.init)]));
    cmapSections[0].panels.forEach((panel, index) => {
        const shift = panel.knobs.at(-1);
        assert.match(shift.id, /^shift-x/);
        assert.equal(shift.init, 0);
        states[shift.id].liveValue = (index + 1) / 8;
        states[shift.id].cmValue = (index + 1) / 8;
    });
    const restored = deserializeKnobs(JSON.parse(JSON.stringify(serializeKnobs(states))), cmapParams);
    const packed = packCMParams(restored);
    cmapParams.forEach((param, index) => {
        if (param.id.startsWith("shift-")) assert.equal(packed[index], states[param.id].cmValue);
    });
});

test("Pastel is neutral in old presets and retains modulated values in new snapshots", () => {
    const misc = cmapSections.find(section => section.id === "miscCmap");
    assert.deepEqual(misc.panels[0].knobs.map(param => param.id), ["phaseShift", "hueShift", "pastel"]);
    const restored = deserializeKnobs(serializeKnobs({ hueShift: new KnobState(0.25) }), cmapParams);
    assert.deepEqual(restored.pastel, new KnobState(0));
    restored.pastel.liveValue = 0.5;
    restored.pastel.cmValue = 0.75;
    restored.pastel.modEnabled = true;
    const snapshot = deserializeKnobs(JSON.parse(JSON.stringify(serializeKnobs(restored))), cmapParams);
    assert.equal(snapshot.pastel.liveValue, 0.5);
    assert.equal(snapshot.pastel.cmValue, 0.75);
    assert.equal(snapshot.pastel.modEnabled, true);
    assert.equal(packCMParams(snapshot)[cmapParams.findIndex(param => param.id === "pastel")], 0.75);
    assert.ok(cmapStructWGSL.includes("pastel : f32,"));
});

test("knob value labels display final values without changing the base/punch visualization", () => {
    const classes = new Map();
    const properties = new Map();
    const value = { textContent: "" };
    const toggle = { classList: { toggle: (name, enabled) => classes.set(name, enabled) } };
    const element = {
        style: { setProperty: (name, value) => properties.set(name, value) },
        classList: toggle.classList,
        parentElement: { querySelector: selector => selector === ".knob-value" ? value : toggle },
    };
    const state = new KnobState(0.5);
    state.cmValue = 0.734;
    state.modEnabled = true;
    updateKnobVisual(element, state);
    assert.equal(value.textContent, "0.734");
    assert.equal(element.style.transform, "rotate(0deg)");
    assert.equal(properties.get("--punch-offset"), `${(0.734 - 0.5) * 270}deg`);
    assert.equal(classes.get("punch-up"), true);
    assert.equal(classes.get("active"), true);
    state.liveValue = 0.8;
    updateKnobVisual(element, state, { rotate: false });
    assert.equal(element.style.transform, "rotate(0deg)");
    assert.equal(classes.get("punch-down"), true);
});
