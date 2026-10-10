import { attachFractalNavigation } from "./fractal-navigation.js";
import { createMobileQuality, createMobileComputeScheduler, mobileRenderSize } from "./mobile-rendering.js";

export function createFractalRenderer({ canvas, context, device, format, onViewChange, mobile = false, onRenderError, onQualityChange }) {
    const quality = mobile ? createMobileQuality() : null;
    function getCanvasAspect() {
        const bounds = canvas.getBoundingClientRect();
        return bounds.height > 0 ? bounds.width / bounds.height : canvas.width / canvas.height;
    }

    const fractalParams = new Float32Array([
        -0.5,
        0.0,
        3.0,
        1000.0,
        getCanvasAspect(),
    ]);

    const fractalParamsBuffer = device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(fractalParamsBuffer, 0, fractalParams);

    const cmSize = 1024;
    const colormapTexture = device.createTexture({
        label: "ColorMap Texture",
        size: [cmSize, 1],
        format: "rgba8unorm",
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });

    attachFractalNavigation(canvas, fractalParams, () => {
        device.queue.writeBuffer(fractalParamsBuffer, 0, fractalParams);
        runCompute();
        onViewChange?.(getView());
    });

    const shaderModule = device.createShaderModule({
        code: /*wgsl*/ `
  struct VSOut {
    @builtin(position) pos : vec4<f32>,
    @location(0) uv : vec2<f32>,
};

struct Params {
    center: vec2<f32>,
    zoom : f32,
    maxIter : f32,
    aspect : f32,
};


@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VSOut {
    let pos = array<vec2<f32>, 3>(
        vec2<f32>(-3, -1),
        vec2<f32>(1, -1),
        vec2<f32>(1.0,  3)
    );

    let p = pos[idx];
    let uv = (p + vec2(1.0, 1.0)) * 0.5;

    var out : VSOut;
    out.pos = vec4<f32>(p, 0.0, 1.0);
    out.uv  = uv;
    return out;
}

@group(0) @binding(0)
var fractalTex : texture_2d<f32>;
@group(0) @binding(1)
var fractalSampler : sampler;

@fragment
fn fs_main(@location(0) uv: vec2<f32>)
    -> @location(0) vec4<f32> {

    return textureSample(fractalTex, fractalSampler, uv);
}

@group(1) @binding(0)
var outputTex : texture_storage_2d<rgba8unorm, write>;

@group(1) @binding(2)
var paletteTex : texture_2d<f32>;


@group(1) @binding(1)
var<uniform> params : Params; 
// params = (center.xy, zoom, maxIter, time)

@compute @workgroup_size(8, 8)
fn cs_main(@builtin(global_invocation_id) gid : vec3<u32>) {
    let size = textureDimensions(outputTex);
    if (gid.x >= size.x || gid.y >= size.y) {
        return;
    }

    let uv = vec2<f32>(
        f32(gid.x) / f32(size.x),
        f32(gid.y) / f32(size.y)
    );

    let c = vec2<f32>(
        params.center.x + (uv.x - 0.5) * params.zoom * params.aspect,
        params.center.y + (uv.y - 0.5) * params.zoom
    );

    var z = vec2<f32>(0.0, 0.0);
    var iter : u32 = 0u;

    var diver :f32 = 0.0;
    loop {
        if (iter >= u32(params.maxIter)) { diver = 1.0; break; }
        if (dot(z, z) > 4.0) {break; }

        let x = z.x*z.x - z.y*z.y + c.x;
        let y = 2.0*z.x*z.y + c.y;
        z = vec2<f32>(x, y);

        iter = iter + 1u;
    }

    let idx = clamp(f32(iter) / params.maxIter, 0.0, 1.0);
    let px = i32(idx * 1023.0);

    var color = textureLoad(paletteTex, vec2<i32>(px, 0), 0);

    if (diver > 0.1) {
        color = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    }
    textureStore(outputTex, vec2<i32>(i32(gid.x), i32(gid.y)), color);
} 
  `
    });

    const computePipeline = device.createComputePipeline({
        layout: "auto",
        compute: {
            module: shaderModule,
            entryPoint: "cs_main",
        },
    });

    let width, height, fractalTexture, fractalRenderBindGroup, computeBindGroup;

    function resizeTexture() {
        const bounds = canvas.getBoundingClientRect();
        const size = mobile ? mobileRenderSize(bounds.width || canvas.width, bounds.height || canvas.height,
            quality.getLongEdge(), device.limits.maxTextureDimension2D) : { width: canvas.width, height: canvas.height };
        if (fractalTexture && width === size.width && height === size.height) return false;
        width = size.width;
        height = size.height;
        if (mobile) { canvas.width = width; canvas.height = height; }
        const previousTexture = fractalTexture;
        fractalTexture = device.createTexture({
            size: { width, height },
            format: "rgba8unorm",
            usage:
                GPUTextureUsage.STORAGE_BINDING |
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.RENDER_ATTACHMENT,
        });
        const fractalView = fractalTexture.createView();
        fractalRenderBindGroup = device.createBindGroup({
            layout: fractalRenderPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: fractalView },
                { binding: 1, resource: sampler },
            ],
        });
        computeBindGroup = device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(1),
            entries: [
                { binding: 0, resource: fractalView },
                { binding: 1, resource: { buffer: fractalParamsBuffer } },
                { binding: 2, resource: colormapTexture.createView() },
            ],
        });
        previousTexture?.destroy();
        onQualityChange?.({ width, height, longEdge: quality?.getLongEdge() });
        return true;
    }

    const sampler = device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
    });

    const fractalRenderPipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: { module: shaderModule, entryPoint: "vs_main", buffers: [] },
        fragment: { module: shaderModule, entryPoint: "fs_main", targets: [{ format }] }
    });
    resizeTexture();

    function compute() {
        resizeTexture();
        fractalParams[4] = getCanvasAspect();
        device.queue.writeBuffer(fractalParamsBuffer, 0, fractalParams);
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(computePipeline);
        pass.setBindGroup(1, computeBindGroup);
        pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
        pass.end();
        device.queue.submit([encoder.finish()]);
    }

    const scheduler = mobile ? createMobileComputeScheduler({
        compute,
        waitForGpu: () => device.queue.onSubmittedWorkDone(),
        onSample: (elapsed, time) => {
            if (!document.hidden && time - lastRender >= 1000 / 30) present();
            if (!document.hidden && quality.sample(elapsed, time)) scheduler.request();
        },
        onError: onRenderError,
    }) : null;
    if (mobile) {
        device.lost.then(info => scheduler.fail(new Error(`WebGPU-Geraet verloren: ${info.message}`)));
    }

    let pendingPalette = null;
    function runCompute(beforeCompute, force = false) {
        if (scheduler) {
            if (beforeCompute) pendingPalette = beforeCompute;
            if (document.hidden && !force) return;
            scheduler.request(() => {
                pendingPalette?.();
                pendingPalette = null;
            });
        }
        else { beforeCompute?.(); compute(); }
    }
    if (mobile) document.addEventListener("visibilitychange", () => { if (!document.hidden) runCompute(); });

    const resizeObserver = new ResizeObserver(() => {
        const aspect = getCanvasAspect();
        if (fractalParams[4] === aspect && !mobile) return;

        fractalParams[4] = aspect;
        device.queue.writeBuffer(fractalParamsBuffer, 0, fractalParams);
        runCompute();
    });
    resizeObserver.observe(canvas);

    let lastRender = -Infinity;
    function render(force = false) {
        if (scheduler?.hasFailed()) return;
        if (mobile && !force && (document.hidden || scheduler.isRunning() || performance.now() - lastRender < 1000 / 30)) return;
        present();
    }

    function present() {
        lastRender = performance.now();
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
                clearValue: { r: 1, g: 0, b: 0, a: 1 }
            }]
        });

        pass.setPipeline(fractalRenderPipeline);
        pass.setBindGroup(0, fractalRenderBindGroup);
        pass.draw(3);
        pass.end();

        device.queue.submit([encoder.finish()]);
    }

    function getView() {
        return {
            centerX: fractalParams[0],
            centerY: fractalParams[1],
            zoom: fractalParams[2],
            maxIter: fractalParams[3],
        };
    }

    function setView(view) {
        fractalParams[0] = view.centerX;
        fractalParams[1] = view.centerY;
        fractalParams[2] = view.zoom;
        fractalParams[3] = view.maxIter;

        device.queue.writeBuffer(fractalParamsBuffer, 0, fractalParams);
        runCompute();
    }

    return {
        colormapTexture,
        cmSize,
        getView,
        render,
        runCompute,
        setView,
        flushCompute: () => {
            if (!scheduler) return device.queue.onSubmittedWorkDone();
            runCompute(undefined, true);
            return scheduler.flush();
        },
    };
}
