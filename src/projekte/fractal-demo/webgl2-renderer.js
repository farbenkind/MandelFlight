import { attachFractalNavigation } from "./fractal-navigation.js";
import { createMobileComputeScheduler, createMobileQuality, mobileRenderSize } from "./mobile-rendering.js";
import { fullscreenVertex, paletteFragment, fractalFragment, presentFragment } from "./webgl2-shaders.js";

export function createGlProgram(gl, vertexSource, fragmentSource) {
    const shaders = [];
    const program = gl.createProgram();
    if (!program) throw new Error("WebGL2-Programm konnte nicht angelegt werden.");
    try {
        for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
            const shader = gl.createShader(type);
            if (!shader) throw new Error("WebGL2-Shader konnte nicht angelegt werden.");
            shaders.push(shader);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                throw new Error(`WebGL2-Shaderfehler: ${gl.getShaderInfoLog(shader)}`);
            }
            gl.attachShader(program, shader);
        }
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(`WebGL2-Linkfehler: ${gl.getProgramInfoLog(program)}`);
        }
        return program;
    } catch (error) {
        gl.deleteProgram(program);
        throw error;
    } finally {
        for (const shader of shaders) gl.deleteShader(shader);
    }
}

export function waitForGl(gl) {
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) return Promise.reject(new Error("WebGL2-GPU-Synchronisation fehlgeschlagen."));
    gl.flush();
    return new Promise((resolve, reject) => {
        function poll() {
            if (gl.isContextLost()) {
                gl.deleteSync(sync);
                reject(new Error("WebGL2-GPU-Kontext verloren."));
                return;
            }
            const status = gl.clientWaitSync(sync, 0, 0);
            if (status === gl.TIMEOUT_EXPIRED) { setTimeout(poll, 2); return; }
            gl.deleteSync(sync);
            if (status === gl.WAIT_FAILED) reject(new Error("WebGL2-GPU-Kontext verloren."));
            else resolve();
        }
        poll();
    });
}

export function createWebgl2Renderer({ canvas, gl, mobile, onViewChange, onQualityChange, onRenderError }) {
    const quality = mobile ? createMobileQuality() : null;
    const view = new Float32Array([-.5, 0, 3, 1000, 1]);
    const aspect = () => {
        const bounds = canvas.getBoundingClientRect();
        return bounds.height > 0 ? bounds.width / bounds.height : canvas.width / canvas.height;
    };
    view[4] = aspect();
    const paletteProgram = createGlProgram(gl, fullscreenVertex, paletteFragment);
    const fractalProgram = createGlProgram(gl, fullscreenVertex, fractalFragment);
    const presentProgram = createGlProgram(gl, fullscreenVertex, presentFragment);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.disable(gl.DITHER);
    const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (limit < 1024) throw new Error("WebGL2 unterstuetzt keine Palette mit 1024 Eintraegen.");
    const uniforms = new Map([paletteProgram, fractalProgram, presentProgram].map(program => [program, new Map()]));
    function uniform(program, name) {
        const cache = uniforms.get(program);
        if (!cache.has(name)) {
            const location = gl.getUniformLocation(program, name);
            if (location === null) throw new Error(`WebGL2-Uniform fehlt: ${name}`);
            cache.set(name, location);
        }
        return cache.get(name);
    }
    function texture(width, height, internal = gl.RGBA8, format = gl.RGBA, type = gl.UNSIGNED_BYTE, data = null) {
        const result = gl.createTexture();
        if (!result) throw new Error("WebGL2-Textur konnte nicht angelegt werden.");
        gl.bindTexture(gl.TEXTURE_2D, result);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, format, type, data);
        return result;
    }
    function framebuffer(image) {
        const result = gl.createFramebuffer();
        if (!result) throw new Error("WebGL2-Framebuffer konnte nicht angelegt werden.");
        gl.bindFramebuffer(gl.FRAMEBUFFER, result);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, image, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error("WebGL2-Framebuffer ist unvollstaendig.");
        }
        return result;
    }
    const palette = texture(1024, 1);
    const paletteFramebuffer = framebuffer(palette);
    const lut = texture(1024, 3, gl.R32F, gl.RED, gl.FLOAT,
        Float32Array.from({ length: 3072 }, (_, i) => (i % 1024) / 1024));
    let image, imageFramebuffer, width, height;
    function resize() {
        const bounds = canvas.getBoundingClientRect();
        const size = mobile ? mobileRenderSize(bounds.width || canvas.width, bounds.height || canvas.height,
            quality.getLongEdge(), limit) : { width: canvas.width, height: canvas.height };
        if (image && width === size.width && height === size.height) return;
        if (image) { gl.deleteTexture(image); gl.deleteFramebuffer(imageFramebuffer); }
        width = size.width;
        height = size.height;
        if (mobile) { canvas.width = width; canvas.height = height; }
        image = texture(width, height);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        imageFramebuffer = framebuffer(image);
        onQualityChange?.({ width, height });
    }
    resize();
    function bind(program, target, w, h) {
        gl.bindVertexArray(vao);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target);
        gl.viewport(0, 0, w, h);
        gl.useProgram(program);
    }
    function checkError() {
        const error = gl.getError();
        if (error !== gl.NO_ERROR) throw new Error(`WebGL2-Grafikfehler: ${error}`);
    }
    function compute() {
        resize();
        view[4] = aspect();
        bind(fractalProgram, imageFramebuffer, width, height);
        gl.uniform2f(uniform(fractalProgram, "center"), view[0], view[1]);
        gl.uniform1f(uniform(fractalProgram, "zoom"), view[2]);
        gl.uniform1f(uniform(fractalProgram, "maxIter"), view[3]);
        gl.uniform1f(uniform(fractalProgram, "aspect"), view[4]);
        gl.uniform2f(uniform(fractalProgram, "size"), width, height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, palette);
        gl.uniform1i(uniform(fractalProgram, "palette"), 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        checkError();
    }
    let lastRender = -Infinity;
    function present() {
        lastRender = performance.now();
        bind(presentProgram, null, canvas.width, canvas.height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, image);
        gl.uniform1i(uniform(presentProgram, "image"), 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // WebGL fallback always uses backpressure, even on desktop.
    const scheduler = createMobileComputeScheduler({
        compute, waitForGpu: () => waitForGl(gl), onError: onRenderError,
        onSample: (elapsed, time) => {
            if (!document.hidden && time - lastRender >= 1000 / 30) present();
            if (mobile && !document.hidden && quality.sample(elapsed, time)) scheduler.request();
        },
    });
    let pendingPalette = null;
    function runCompute(before, force = false) {
        if (before) pendingPalette = before;
        if (document.hidden && !force) return;
        scheduler.request(() => { pendingPalette?.(); pendingPalette = null; });
    }
    canvas.addEventListener("webglcontextlost", event => {
        event.preventDefault();
        scheduler.fail(new Error("WebGL2-Kontext verloren. Bitte Seite neu laden."));
    });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) runCompute(); });
    attachFractalNavigation(canvas, view, () => { runCompute(); onViewChange?.(getView()); });
    new ResizeObserver(() => { view[4] = aspect(); runCompute(); }).observe(canvas);
    function getView() {
        return { centerX: view[0], centerY: view[1], zoom: view[2], maxIter: view[3] };
    }
    const renderer = {
        cmSize: 1024,
        getView,
        setView(value) {
            view.set([value.centerX, value.centerY, value.zoom, value.maxIter], 0);
            runCompute();
        },
        runCompute,
        render(force = false) {
            if (scheduler.hasFailed()) return;
            if (!force && (document.hidden || scheduler.isRunning() || performance.now() - lastRender < 1000 / 30)) return;
            present();
        },
        flushCompute() { runCompute(undefined, true); return scheduler.flush(); },
    };
    function createColormap({ previewCanvas, curveCanvas }) {
        const preview = previewCanvas?.getContext("2d");
        const curve = curveCanvas?.getContext("2d");
        if ((previewCanvas && !preview) || (curveCanvas && !curve)) throw new Error("WebGL2-Palettevorschau konnte nicht gestartet werden.");
        for (const canvas of [previewCanvas, curveCanvas]) {
            if (canvas) { canvas.width = 1024; canvas.height = 64; }
        }
        const pixels = new Uint8Array(4096);
        function drawPreviews() {
            if (!preview && !curve) return;
            gl.readPixels(0, 0, 1024, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            if (preview) {
                const data = preview.createImageData(1024, 64);
                for (let row = 0; row < 64; row++) data.data.set(pixels, row * 4096);
                preview.putImageData(data, 0, 0);
            }
            if (curve) {
                const data = curve.createImageData(1024, 64);
                for (let y = 0; y < 64; y++) for (let x = 0; x < 1024; x++) {
                    const coverage = [0, 1, 2].map(c => Math.max(0, Math.min(1, 2 - Math.abs(y - pixels[x * 4 + c] / 255 * 63))));
                    const alpha = Math.max(...coverage);
                    const index = (y * 1024 + x) * 4;
                    for (let c = 0; c < 3; c++) data.data[index + c] = Math.round(255 * (1 - alpha + coverage[c] * alpha));
                    data.data[index + 3] = 255;
                }
                curve.putImageData(data, 0, 0);
            }
        }
        return {
            update(params) {
                bind(paletteProgram, paletteFramebuffer, 1024, 1);
                gl.uniform1fv(uniform(paletteProgram, "params[0]"), params);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, lut);
                gl.uniform1i(uniform(paletteProgram, "xlut"), 0);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
                checkError();
                drawPreviews();
            },
            setLut(channel, data) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, lut);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, channel, 1024, 1, gl.RED, gl.FLOAT,
                    data ?? Float32Array.from({ length: 1024 }, (_, i) => i / 1024));
                checkError();
            },
        };
    }
    return { renderer, createColormap };
}
