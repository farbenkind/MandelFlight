import cmEditorRenderCode from "./cmap-render.wgsl?raw";
import cmComputeShaderTemplate from "./cmap-compute.wgsl?raw";
import { cmapStructWGSL } from "./params.js";

const cmComputeShaderCode = cmComputeShaderTemplate.replace("//__CMPARAMS_STRUCT__", cmapStructWGSL);

const PREVIEW_WIDTH = 1024;
const PREVIEW_HEIGHT = 64;

function configureCanvas(canvas, device, format) {
    canvas.width = PREVIEW_WIDTH;
    canvas.height = PREVIEW_HEIGHT;
    const context = canvas.getContext("webgpu");
    context.configure({ device, format, alphaMode: "premultiplied" });
    return context;
}

function fullscreenPass(device, context, pipeline, bindGroup, label, clearValue) {
    const encoder = device.createCommandEncoder({ label });
    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            storeOp: "store",
            clearValue,
        }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
}

// Berechnet die Colormap per Compute-Shader in `colormapTexture` und zeichnet
// die beiden Editor-Vorschauen. `paramCount` ist die Anzahl der f32-Werte der CMParams-Struct.
export function createColormapGpu({ device, format, colormapTexture, cmSize, previewCanvas, curveCanvas, paramCount }) {
    const hasPreview = Boolean(previewCanvas && curveCanvas);
    const renderModule = hasPreview ? device.createShaderModule({
        label: "ColorMap Render Shader",
        code: cmEditorRenderCode,
    }) : null;
    const computeModule = device.createShaderModule({
        label: "ColorMap Compute Shader",
        code: cmComputeShaderCode,
    });

    const previewPipeline = hasPreview ? device.createRenderPipeline({
        label: "ColorMap Preview Pipeline",
        layout: "auto",
        vertex: { module: renderModule, entryPoint: "cm_vs", buffers: [] },
        fragment: { module: renderModule, entryPoint: "cm_fs", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
    }) : null;

    const curvePipeline = hasPreview ? device.createRenderPipeline({
        label: "ColorMap AA Curve Pipeline",
        layout: "auto",
        vertex: { module: renderModule, entryPoint: "cm_vs", buffers: [] },
        fragment: { module: renderModule, entryPoint: "cmAACurve_fs", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
    }) : null;

    const computePipeline = device.createComputePipeline({
        label: "ColorMap Compute Pipeline",
        layout: "auto",
        compute: { module: computeModule, entryPoint: "cm_main" },
    });

    const curveTexture = device.createTexture({
        label: "Curve 1D Texture",
        size: [cmSize, 3],
        format: "rgba8unorm",
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });

    // Uniform-Buffer muss auf 16 Byte aufgerundet sein
    const paramsBuffer = device.createBuffer({
        size: Math.ceil(paramCount / 4) * 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // xCmap-LUTs: 3 Kanaele x cmSize Werte, initial Identitaet
    const lutData = new Float32Array(3 * cmSize);
    for (let c = 0; c < 3; c++) for (let i = 0; i < cmSize; i++) lutData[c * cmSize + i] = i / cmSize;
    const lutBuffer = device.createBuffer({
        size: lutData.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(lutBuffer, 0, lutData);

    const previewBindGroup = hasPreview ? device.createBindGroup({
        label: "ColorMap Preview BindGroup",
        layout: previewPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: colormapTexture.createView() }],
    }) : null;
    const curveBindGroup = hasPreview ? device.createBindGroup({
        label: "AA Curve BindGroup",
        layout: curvePipeline.getBindGroupLayout(0),
        entries: [{ binding: 1, resource: curveTexture.createView() }],
    }) : null;
    const computeBindGroup = device.createBindGroup({
        label: "ColorMap Compute BindGroup",
        layout: computePipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: paramsBuffer } },
            { binding: 1, resource: colormapTexture.createView() },
            { binding: 2, resource: curveTexture.createView() },
            { binding: 3, resource: { buffer: lutBuffer } },
        ],
    });

    const previewContext = hasPreview ? configureCanvas(previewCanvas, device, format) : null;
    const curveContext = hasPreview ? configureCanvas(curveCanvas, device, format) : null;

    function runCompute() {
        const encoder = device.createCommandEncoder({ label: "ColorMap Compute Encoder" });
        const pass = encoder.beginComputePass();
        pass.setPipeline(computePipeline);
        pass.setBindGroup(0, computeBindGroup);
        pass.dispatchWorkgroups(Math.ceil(cmSize / 64));
        pass.end();
        device.queue.submit([encoder.finish()]);
    }

    function renderPreview() {
        if (!previewContext) return;
        fullscreenPass(device, previewContext, previewPipeline, previewBindGroup,
            "ColorMap Preview Encoder", { r: 0, g: 0, b: 0, a: 1 });
    }

    function renderCurve() {
        if (!curveContext) return;
        fullscreenPass(device, curveContext, curvePipeline, curveBindGroup,
            "ColorMap AA Curve Encoder", { r: 1, g: 1, b: 1, a: 1 });
    }

    // Parameter hochladen, Colormap berechnen, beide Vorschauen neu zeichnen
    function update(params) {
        device.queue.writeBuffer(paramsBuffer, 0, params);
        runCompute();
        renderPreview();
        renderCurve();
    }

    // channel 0..2 = R,G,B; lut = Float32Array(cmSize) oder null fuer Identitaet
    function setLut(channel, lut) {
        const data = lut ?? Float32Array.from({ length: cmSize }, (_, i) => i / cmSize);
        device.queue.writeBuffer(lutBuffer, channel * cmSize * 4, data);
    }

    return { update, setLut };
}
