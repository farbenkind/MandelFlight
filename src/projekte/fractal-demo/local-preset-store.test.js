import { test } from "node:test";
import assert from "node:assert/strict";
import { createLocalPresetStore } from "./local-preset-store.js";

const presetData = {
    schemaVersion: 1, kind: "visual",
    geometry: { fractal: { centerX: -0.5, centerY: 0, zoom: 3, maxIter: 1000 } },
    color: { knobs: {}, xlut: [null, null, null] }, post: { knobs: {} },
};
function fixture(initial = "[]") {
    let raw = initial;
    const storage = {
        getItem(key) { assert.equal(key, "presets"); return raw; },
        setItem(key, value) { assert.equal(key, "presets"); raw = value; },
    };
    return { store: createLocalPresetStore(storage), raw: () => raw };
}

test("signed-out local saves persist full visuals and allow explicit update, rename and delete", () => {
    const { store } = fixture();
    store.save({ name: "Local", description: "Private device", presetData });
    assert.deepEqual(store.list()[0].color, presetData.color);
    assert.equal(store.list()[0].description, "Private device");
    assert.throws(() => store.save({ name: "Local", presetData }), /existiert/);
    store.save({ name: "Renamed", originalName: "Local", presetData });
    assert.equal(store.list().length, 1);
    assert.equal(store.list()[0].name, "Renamed");
    store.delete("Renamed");
    assert.deepEqual(store.list(), []);
});

test("legacy visual presets remain readable and unrelated records survive writes", () => {
    const other = { name: "Chain", kind: "chain", stages: [] };
    const legacy = { name: "Old", knobs: {}, fractalParams: { centerX: 0, centerY: 0, zoom: 2, iter: 100 }, version: 1 };
    const { store, raw } = fixture(JSON.stringify([other, legacy]));
    assert.deepEqual(store.list(), [legacy]);
    store.save({ name: "New", presetData });
    store.delete("Old");
    assert.deepEqual(JSON.parse(raw())[0], other);
    assert.equal(store.list()[0].name, "New");
});

test("invalid storage, stale edits, collisions and quota errors do not overwrite data", () => {
    for (const initial of ["{}", "broken"]) {
        const { store, raw } = fixture(initial);
        assert.throws(() => store.save({ name: "New", presetData }));
        assert.equal(raw(), initial);
    }
    const { store, raw } = fixture();
    store.save({ name: "One", presetData });
    store.save({ name: "Two", presetData });
    const before = raw();
    assert.throws(() => store.save({ name: "Two", originalName: "One", presetData }), /existiert/);
    assert.throws(() => store.save({ name: "New", originalName: "Gone", presetData }), /existiert nicht/);
    assert.throws(() => store.save({ name: "Invalid", presetData: {} }));
    assert.equal(raw(), before);
    const quotaStore = createLocalPresetStore({
        getItem: () => before, setItem() { throw new Error("Storage quota exceeded"); },
    });
    assert.throws(() => quotaStore.save({ name: "Three", presetData }), /quota/);
});
