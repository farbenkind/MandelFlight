import { test } from "node:test";
import assert from "node:assert/strict";
import { createFractalRenderer } from "./fractal-renderer.js";

test("mobile renderer resizes textures, releases old resources and preserves view/palette; desktop stays fixed", async () => {
    const names = ["window", "document", "ResizeObserver", "GPUBufferUsage", "GPUTextureUsage"];
    const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
    let observe;
    const visibility = new Map();
    globalThis.window = { addEventListener() {} };
    globalThis.document = { hidden: false, addEventListener: (name, handler) => visibility.set(name, handler) };
    globalThis.ResizeObserver = class { constructor(callback) { observe = callback; } observe() {} };
    globalThis.GPUBufferUsage = { UNIFORM: 1, COPY_DST: 2 };
    globalThis.GPUTextureUsage = { STORAGE_BINDING: 1, TEXTURE_BINDING: 2, RENDER_ATTACHMENT: 4 };
    try {
        for (const mobile of [true, false]) {
            let bounds = { width: 390, height: 844 };
            const textures = [], dispatches = [], writes = [], sizes = [];
            const layout = { getBindGroupLayout: () => ({}) };
            const pass = {
                setPipeline() {}, setBindGroup() {}, draw() {}, end() {},
                dispatchWorkgroups: (...args) => dispatches.push(args),
            };
            const device = {
                limits: { maxTextureDimension2D: 8192 },
                lost: new Promise(() => {}),
                queue: {
                    writeBuffer: (_, __, data) => writes.push([...data]), submit() {},
                    onSubmittedWorkDone: async () => {},
                },
                createBuffer: () => ({}), createShaderModule: () => ({}),
                createComputePipeline: () => layout, createRenderPipeline: () => layout,
                createSampler: () => ({}), createBindGroup: () => ({}),
                createTexture(options) {
                    const texture = { options, destroyed: false, createView: () => ({}), destroy() { this.destroyed = true; } };
                    textures.push(texture);
                    return texture;
                },
                createCommandEncoder: () => ({ beginComputePass: () => pass, beginRenderPass: () => pass, finish() {} }),
            };
            const canvas = { width: 1920, height: 1080, addEventListener() {}, getBoundingClientRect: () => bounds };
            const renderer = createFractalRenderer({
                canvas, device, format: "bgra8unorm", mobile,
                context: { getCurrentTexture: () => ({ createView: () => ({}) }) },
                onRenderError: error => { throw error; },
                onQualityChange: size => sizes.push(size),
            });
            assert.deepEqual(textures[0].options.size, [1024, 1]);
            assert.equal(canvas.height, mobile ? 360 : 1080);
            const palette = renderer.colormapTexture;
            let colorUpdates = 0;
            renderer.runCompute(() => colorUpdates++);
            await renderer.flushCompute();
            assert.equal(colorUpdates, 1);
            const view = renderer.getView();
            bounds = { width: 844, height: 390 };
            observe();
            await renderer.flushCompute();
            assert.equal(renderer.colormapTexture, palette);
            assert.deepEqual(renderer.getView(), view);
            assert.equal(writes.at(-1)[4], Math.fround(844 / 390));
            if (mobile) {
                assert.equal(canvas.width, 360);
                assert.equal(canvas.height, 166);
                assert.equal(textures[1].destroyed, true);
                assert.deepEqual(dispatches.at(-1), [45, 21]);
                assert.equal(sizes.length, 2);
                document.hidden = true;
                const before = dispatches.length;
                renderer.runCompute(() => colorUpdates++);
                assert.equal(dispatches.length, before);
                document.hidden = false;
                visibility.get("visibilitychange")();
                await renderer.flushCompute();
                assert.equal(colorUpdates, 2);
            } else {
                assert.equal(canvas.width, 1920);
                assert.equal(canvas.height, 1080);
                assert.equal(textures[1].destroyed, false);
                assert.deepEqual(dispatches.at(-1), [240, 135]);
            }
        }
    } finally {
        for (const name of names) globalThis[name] = previous[name];
    }
});
