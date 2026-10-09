import { test } from "node:test";
import assert from "node:assert/strict";
import { cmapParams } from "./colormap/params.js";
import { KnobState, serializeKnobs, deserializeKnobs } from "./knob-state.js";
import { buildVisualizationPreset, readVisualizationPreset } from "./preset-format.js";

const view = { centerX: -0.5, centerY: 0, zoom: 3, maxIter: 1000 };

test("geometry/color/post Visual presets and legacy formats restore the same visualization", () => {
    const states = Object.fromEntries(cmapParams.map(p => [p.id, new KnobState(p.init)]));
    states.pastel.cmValue = 0.75;
    const knobs = serializeKnobs(states);
    const preset = buildVisualizationPreset("New", view, knobs, [null, null, null]);
    assert.deepEqual(Object.keys(preset), ["schemaVersion", "kind", "geometry", "color", "post"]);
    assert.deepEqual(Object.keys(preset.geometry), ["fractal"]);
    assert.equal(preset.post.knobs.pastel.cmValue, 0.75);
    const parsed = readVisualizationPreset(JSON.parse(JSON.stringify(preset)));
    assert.deepEqual(parsed.view, view);
    assert.deepEqual(parsed.knobs, knobs);
    assert.deepEqual(readVisualizationPreset({
        ...preset, thumbnail: { width: 320, height: 180, dataUrl: "data:image/jpeg;base64,/9j/" },
    }), parsed);
    assert.equal(deserializeKnobs(parsed.knobs, cmapParams).pastel.cmValue, 0.75);
    const legacyV2 = readVisualizationPreset({
        version: 2, kind: "visualization",
        modules: {
            fractal: view,
            cmap: { knobs: Object.fromEntries(Object.entries(knobs).filter(([id]) => cmapParams.find(p => p.id === id)?.section === "primCmap")) },
            xcmap: { knobs: {}, xlut: [null, null, null] },
            misc: { knobs: {} },
        },
    });
    assert.deepEqual(legacyV2.view, view);
    const legacy = readVisualizationPreset({
        version: 1, knobs, fractalParams: { ...view, iter: 1000 }, xlut: [null, null, null],
    });
    assert.deepEqual(legacy.knobs, parsed.knobs);
    assert.equal(legacy.view.maxIter, 1000);
    assert.throws(() => readVisualizationPreset({ ...preset, kind: "cmap" }), /Visualisierungs/);
    assert.throws(() => readVisualizationPreset({ ...preset, geometry: {} }), /Schichten/);
});
