import { test } from "node:test";
import assert from "node:assert/strict";
import { capturePresetThumbnail, isPresetThumbnail } from "./preset-thumbnail.js";

test("canvas snapshots preserve displayed aspect and contain only the rendered canvas", () => {
    const canvas = { width: 1024, height: 1024, getBoundingClientRect: () => ({ width: 1200, height: 600 }) };
    let drawArgs, encodingArgs;
    const image = {
        getContext: type => {
            assert.equal(type, "2d");
            return { drawImage: (...args) => { drawArgs = args; } };
        },
        toDataURL: (...args) => { encodingArgs = args; return "data:image/jpeg;base64,/9j/"; },
    };
    const document = { createElement: tag => { assert.equal(tag, "canvas"); return image; } };
    const result = capturePresetThumbnail(canvas, document);
    assert.deepEqual(drawArgs, [canvas, 0, 0, 320, 160]);
    assert.deepEqual(encodingArgs, ["image/jpeg", 0.75]);
    assert.deepEqual(result, { width: 320, height: 160, dataUrl: "data:image/jpeg;base64,/9j/" });
});

test("thumbnail validation rejects external URLs, SVG, oversized images and invalid dimensions", () => {
    const valid = { width: 320, height: 180, dataUrl: "data:image/jpeg;base64,/9j/" };
    assert.ok(isPresetThumbnail(valid));
    for (const thumbnail of [
        null, { ...valid, width: 321 }, { ...valid, height: 0 }, { ...valid, width: 1.5 },
        { ...valid, dataUrl: "https://example.com/track.jpg" },
        { ...valid, dataUrl: "data:image/svg+xml;base64,AAAA" },
        { ...valid, dataUrl: `data:image/jpeg;base64,${"A".repeat(60000)}` },
    ]) assert.equal(isPresetThumbnail(thumbnail), false);
});

test("snapshot errors are explicit rather than saving an empty fallback", () => {
    assert.throws(() => capturePresetThumbnail({
        width: 0, height: 0, getBoundingClientRect: () => ({ width: 100, height: 100 }),
    }), /nicht bereit/);
    const canvas = { width: 100, height: 100, getBoundingClientRect: () => ({ width: 100, height: 100 }) };
    assert.throws(() => capturePresetThumbnail(canvas, {
        createElement: () => ({ getContext: () => null }),
    }), /Canvas nicht verfuegbar/);
});
