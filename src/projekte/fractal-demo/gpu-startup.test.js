import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeGraphics } from "./gpu-startup.js";

test("unsupported graphics fail with explicit reasons", async () => {
    await assert.rejects(initializeGraphics({}, null), /WebGPU nicht bereit/);
    await assert.rejects(initializeGraphics({}, { requestAdapter: async () => null }), /Grafikadapter/);
    await assert.rejects(initializeGraphics({}, {
        requestAdapter: async () => ({ requestDevice: async () => { throw new Error("Device unavailable"); } }),
    }), /Device unavailable/);
    await assert.rejects(initializeGraphics({ getContext: () => null }, {
        requestAdapter: async () => ({ requestDevice: async () => ({}) }),
    }), /Zeichenbereich/);
});

test("supported graphics retain the existing opaque WebGPU configuration", async () => {
    const device = {};
    let config;
    const context = { configure: value => { config = value; } };
    const canvas = { getContext: type => { assert.equal(type, "webgpu"); return context; } };
    const result = await initializeGraphics(canvas, {
        requestAdapter: async () => ({ requestDevice: async () => device }),
        getPreferredCanvasFormat: () => "bgra8unorm",
    });

    assert.deepEqual(config, { device, format: "bgra8unorm", alphaMode: "opaque" });
    assert.deepEqual(result, { device, context, format: "bgra8unorm" });
});

test("all fractal entry points use guarded startup and a mobile viewport", async () => {
    const urls = ["../../../index.html", "./index.html", "./fullscreen.html"];
    for (const path of urls) {
        const html = await readFile(new URL(path, import.meta.url), "utf8");
        assert.match(html, /name="viewport" content="width=device-width, initial-scale=1"/);
        assert.match(html, /src="\/src\/projekte\/fractal-demo\/startup.js"/);
        assert.doesNotMatch(html, /src="\/src\/projekte\/fractal-demo\/main.js"/);
    }
});
