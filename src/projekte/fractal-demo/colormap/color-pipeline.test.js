import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createColorPipeline, readColorPipelineVersion } from "./color-pipeline.js";
import { cmapParams, packCMParams } from "./params.js";
import { KnobState, serializeKnobs, deserializeKnobs } from "../knob-state.js";
import { buildVisualizationPreset, readVisualizationPreset } from "../preset-format.js";
import { createSource, makeLinearTransform } from "../modulation.js";
import { createLocalPresetStore } from "../local-preset-store.js";

const view = { centerX: -0.5, centerY: 0, zoom: 3, maxIter: 1000 };
const states = () => Object.fromEntries(cmapParams.map(p => [p.id, new KnobState(p.init)]));

test("pipeline state defaults to new looks but missing and unsupported versions are handled explicitly", () => {
    const pipeline = createColorPipeline();
    assert.equal(pipeline.getVersion(), 2);
    pipeline.setVersion(undefined);
    assert.equal(pipeline.getVersion(), 1);
    for (const value of [null, 0, 3, "2", NaN]) {
        assert.throws(() => pipeline.setVersion(value), /Farbpipeline-Version/);
        assert.equal(pipeline.getVersion(), 1);
    }
});

test("unversioned formats retain the current legacy look and neutral Contrast when resaved or copied", () => {
    const knobs = serializeKnobs(states());
    delete knobs.contrast;
    const unversioned = buildVisualizationPreset("Old", view, knobs, []);
    delete unversioned.colorPipelineVersion;
    const presets = [
        unversioned,
        { version: 1, fractalParams: { ...view, iter: 1000 }, knobs },
        { version: 2, modules: { fractal: view, cmap: { knobs }, xcmap: { knobs: {} }, misc: { knobs: {} } } },
    ];
    for (const preset of presets) {
        const parsed = readVisualizationPreset(preset);
        assert.equal(parsed.colorPipelineVersion, 1);
        const restored = deserializeKnobs(parsed.knobs, cmapParams);
        assert.deepEqual(restored.contrast, new KnobState(0.5));
        assert.equal(packCMParams(restored, parsed.colorPipelineVersion).at(-1), 1);
        const copy = buildVisualizationPreset("Copy", parsed.view, serializeKnobs(restored), parsed.xlut, parsed.colorPipelineVersion);
        assert.equal(readVisualizationPreset(JSON.parse(JSON.stringify(copy))).colorPipelineVersion, 1);
    }
    assert.throws(() => readVisualizationPreset({ ...unversioned, colorPipelineVersion: 3 }), /Farbpipeline-Version/);
    assert.equal(readColorPipelineVersion(undefined), 1);
});

test("new pipeline and modulated Contrast survive local storage, copies and fullscreen snapshots", () => {
    const knobs = states();
    knobs.contrast.liveValue = 0.7;
    knobs.contrast.cmValue = 0.8;
    knobs.contrast.modEnabled = true;
    knobs.contrast.mods.push({
        sourceObj: createSource("glider"), transformObj: makeLinearTransform({}), amount: 0.4, mode: "punch",
    });
    const payload = buildVisualizationPreset("New", view, serializeKnobs(knobs), []);
    let saved;
    const store = createLocalPresetStore({ getItem: () => saved ?? null, setItem: (_, value) => { saved = value; } });
    store.save({ name: "New", presetData: payload });
    const parsed = readVisualizationPreset(store.list()[0]);
    assert.equal(parsed.colorPipelineVersion, 2);
    const restored = deserializeKnobs(parsed.knobs, cmapParams);
    assert.equal(restored.contrast.mods[0].sourceObj.name, "glider");
    assert.equal(restored.contrast.cmValue, 0.8);
    assert.equal(restored.contrast.modEnabled, true);
    const snapshot = JSON.parse(JSON.stringify({ knobs: serializeKnobs(restored), colorPipelineVersion: parsed.colorPipelineVersion }));
    const packed = packCMParams(deserializeKnobs(snapshot.knobs, cmapParams), snapshot.colorPipelineVersion);
    assert.equal(packed.at(-1), 2);
    assert.equal(packed[cmapParams.findIndex(p => p.id === "contrast")], Math.fround(0.8));
});

test("shader applies the specified V contrast after versioned Pastel without altering PhaseShift", async () => {
    const shader = await readFile(new URL("./cmap-compute.wgsl", import.meta.url), "utf8");
    assert.match(shader, /if \(contrast == 0\.5\) \{\s*return rgb;/);
    assert.match(shader, /let exponent = pow\(2\.0, 2\.0 \* contrast - 1\.0\);/);
    assert.match(shader, /let low = pow\(hsv\.z, exponent\);/);
    assert.match(shader, /let high = pow\(1\.0 - hsv\.z, exponent\);/);
    assert.match(shader, /hsv\.x, hsv\.y, low \/ \(low \+ high\)/);
    assert.match(shader, /contrastColor\(pastelColor\(shiftHue\(/);
    assert.match(shader, /x \* mult \* 20\.0 - pos - phaseShift/);
    assert.match(shader, /vec4<f32>\(color, 1\.0\)/);
});
