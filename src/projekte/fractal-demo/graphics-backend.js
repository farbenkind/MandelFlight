import { initializeGraphics } from "./gpu-startup.js";

export async function initializeGraphicsBackend(canvas, gpu = globalThis.navigator?.gpu) {
    let webgpuError;
    try {
        return { backend: "webgpu", ...await initializeGraphics(canvas, gpu) };
    } catch (error) {
        webgpuError = error;
        console.warn("WebGPU nicht verfuegbar; WebGL2 wird versucht:", error);
    }
    // A canvas cannot change context type after a WebGPU context was acquired.
    const replacement = canvas.cloneNode(false);
    const gl = replacement.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) {
        throw new Error(`WebGPU: ${webgpuError instanceof Error ? webgpuError.message : String(webgpuError)} WebGL2 ist ebenfalls nicht verfuegbar.`);
    }
    canvas.replaceWith(replacement);
    return { backend: "webgl2", canvas: replacement, gl };
}
