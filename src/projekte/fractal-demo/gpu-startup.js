export async function initializeGraphics(canvas, gpu = globalThis.navigator?.gpu) {
    if (!gpu) throw new Error("Dieser Browser stellt WebGPU nicht bereit.");
    const adapter = await gpu.requestAdapter();
    if (!adapter) throw new Error("Es wurde kein geeigneter WebGPU-Grafikadapter gefunden.");
    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");
    if (!context) throw new Error("Der WebGPU-Zeichenbereich ist nicht verfuegbar.");
    const format = gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "opaque" });
    return { device, context, format };
}
