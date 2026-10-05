import cmEditorRenderCode from "./cmap-render.wgsl?raw";
import cmComputeShaderCode from "./cmap-compute.wgsl?raw";

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
    const renderModule = device.createShaderModule({
        label: "ColorMap Render Shader",
        code: cmEditorRenderCode,
    });
    const computeModule = device.createShaderModule({
        label: "ColorMap Compute Shader",
        code: cmComputeShaderCode,
    });

    const previewPipeline = device.createRenderPipeline({
        label: "ColorMap Preview Pipeline",
        layout: "auto",
        vertex: { module: renderModule, entryPoint: "cm_vs", buffers: [] },
        fragment: { module: renderModule, entryPoint: "cm_fs", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
    });

    const curvePipeline = device.createRenderPipeline({
        label: "ColorMap AA Curve Pipeline",
        layout: "auto",
        vertex: { module: renderModule, entryPoint: "cm_vs", buffers: [] },
        fragment: { module: renderModule, entryPoint: "cmAACurve_fs", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
    });

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

    const previewBindGroup = device.createBindGroup({
        label: "ColorMap Preview BindGroup",
        layout: previewPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: colormapTexture.createView() }],
    });
    const curveBindGroup = device.createBindGroup({
        label: "AA Curve BindGroup",
        layout: curvePipeline.getBindGroupLayout(0),
        entries: [{ binding: 1, resource: curveTexture.createView() }],
    });
    const computeBindGroup = device.createBindGroup({
        label: "ColorMap Compute BindGroup",
        layout: computePipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: paramsBuffer } },
            { binding: 1, resource: colormapTexture.createView() },
            { binding: 2, resource: curveTexture.createView() },
        ],
    });

    const previewContext = configureCanvas(previewCanvas, device, format);
    const curveContext = configureCanvas(curveCanvas, device, format);

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
        fullscreenPass(device, previewContext, previewPipeline, previewBindGroup,
            "ColorMap Preview Encoder", { r: 0, g: 0, b: 0, a: 1 });
    }

    function renderCurve() {
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

    return { update };
}
