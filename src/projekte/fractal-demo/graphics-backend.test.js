import { test } from "node:test";
import assert from "node:assert/strict";
import { initializeGraphicsBackend } from "./graphics-backend.js";
import { createGlProgram, waitForGl } from "./webgl2-renderer.js";
import { paletteFragment, fractalFragment } from "./webgl2-shaders.js";
import { cmapParams } from "./colormap/params.js";

function canvas(gl = {}) {
    let replaced = false;
    const replacement = {
        getContext(type, options) {
            assert.equal(type, "webgl2");
            assert.equal(options.antialias, false);
            return gl;
        },
    };
    return {
        cloneNode(deep) { assert.equal(deep, false); return replacement; },
        replaceWith(value) { assert.equal(value, replacement); replaced = true; },
        get replaced() { return replaced; },
    };
}

test("WebGPU is preferred and the original canvas is retained", async () => {
    const device = {};
    const context = { configure() {} };
    const original = { getContext: () => context, cloneNode() { throw new Error("Unexpected fallback"); } };
    const graphics = await initializeGraphicsBackend(original, {
        requestAdapter: async () => ({ requestDevice: async () => device }),
        getPreferredCanvasFormat: () => "bgra8unorm",
    });
    assert.equal(graphics.backend, "webgpu");
    assert.equal(graphics.device, device);
});

test("missing API, null adapter and failed device acquisition fall back to a fresh WebGL2 canvas", async () => {
    const oldWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args);
    try {
        for (const gpu of [null, { requestAdapter: async () => null }, {
            requestAdapter: async () => ({ requestDevice: async () => { throw new Error("Device unavailable"); } }),
        }]) {
            const gl = {};
            const original = canvas(gl);
            const graphics = await initializeGraphicsBackend(original, gpu);
            assert.equal(graphics.backend, "webgl2");
            assert.equal(graphics.gl, gl);
            assert.equal(original.replaced, true);
        }
        assert.equal(warnings.length, 3);
        const unsupported = canvas(null);
        await assert.rejects(initializeGraphicsBackend(unsupported, null), /WebGPU:.*WebGL2/);
        assert.equal(unsupported.replaced, false);
    } finally {
        console.warn = oldWarn;
    }
});

test("GLSL uses shared parameter indices, retains phase and both Pastel formulas, and does not cap iterations", () => {
    cmapParams.forEach((p, i) => assert.ok(paletteFragment.includes(`#define ${p.wgsl} params[${i}]`)));
    assert.ok(paletteFragment.includes(`colorPipelineVersion params[${cmapParams.length}]`));
    assert.match(paletteFragment, /x \* mult \* 20\. - pos - phase/);
    assert.match(paletteFragment, /hsv.z \+ strength \* .5 \* hsv.z \* \(1\. - hsv.z\)/);
    assert.match(paletteFragment, /mix\(hsv.z, 1\., .25 \* strength\)/);
    assert.match(paletteFragment, /low \/ \(low \+ high\)/);
    assert.match(fractalFragment, /float\(iter\) >= maxIter/);
    assert.match(fractalFragment, /size.y - 1\. - floor\(gl_FragCoord.y\)/);
});

test("shader compilation and link failures include the driver log and release temporary resources", () => {
    for (const failCompile of [true, false]) {
        const deleted = [];
        const gl = {
            createProgram: () => "program", createShader: () => ({}),
            shaderSource() {}, compileShader() {}, attachShader() {}, linkProgram() {},
            getShaderParameter: () => !failCompile, getProgramParameter: () => false,
            getShaderInfoLog: () => "compile failed", getProgramInfoLog: () => "link failed",
            deleteProgram: value => deleted.push(value), deleteShader: value => deleted.push(value),
        };
        assert.throws(() => createGlProgram(gl, "", ""), failCompile ? /compile failed/ : /link failed/);
        assert.equal(deleted[0], "program");
        assert.equal(deleted.length, failCompile ? 2 : 3);
    }
});

test("WebGL fences wait for completion, clean up, and report context failure", async () => {
    const gl = {
        SYNC_GPU_COMMANDS_COMPLETE: 1, TIMEOUT_EXPIRED: 2, WAIT_FAILED: 3,
        fenceSync: () => ({}), flush() {}, deleteSync() {},
        clientWaitSync: () => 4, isContextLost: () => false,
    };
    await waitForGl(gl);
    gl.clientWaitSync = () => gl.WAIT_FAILED;
    await assert.rejects(waitForGl(gl), /Kontext verloren/);
    gl.fenceSync = () => null;
    await assert.rejects(waitForGl(gl), /Synchronisation/);
});
