import "./style.css";

const status = document.getElementById("status");
function report(message, error = false) {
    status.textContent = message;
    status.classList.toggle("error", error);
}
function fail(error) {
    console.error("Jam Prototype:", error);
    report(error instanceof Error ? error.message : String(error), true);
}

const role = new URLSearchParams(location.search).get("role");
if (role === "sender" || role === "viewer") {
    document.getElementById(role).hidden = false;
    try {
        if (!globalThis.BroadcastChannel) throw new Error("Dieser Browser unterstuetzt BroadcastChannel nicht.");
        const channel = new BroadcastChannel("mandelflight-jam-prototype");
        const cleanup = role === "sender" ? startSender(channel) : startViewer(channel);
        window.addEventListener("pagehide", () => { cleanup(); channel.close(); }, { once: true });
    } catch (error) {
        fail(error);
    }
}

function startSender(channel) {
    const start = document.getElementById("start");
    const stop = document.getElementById("stop");
    const meter = document.getElementById("level");
    let stream = null;
    let context = null;
    let source = null;
    let timer = null;
    let generation = 0;
    let pulseId = 0;
    const senderId = crypto.randomUUID();

    function release() {
        generation++;
        clearInterval(timer);
        timer = null;
        source?.disconnect();
        source = null;
        stream?.getTracks().forEach(track => track.stop());
        stream = null;
        if (context) {
            const closing = context;
            context = null;
            void closing.close().catch(fail);
        }
        meter.value = 0;
        channel.postMessage({ senderId, level: 0, pulseId });
        start.disabled = false;
        stop.disabled = true;
    }

    start.addEventListener("click", async () => {
        start.disabled = true;
        stop.disabled = false;
        const current = ++generation;
        report("Mikrofonfreigabe wird angefragt ...");
        try {
            if (!navigator.mediaDevices?.getUserMedia) throw new Error("Mikrofonzugriff braucht HTTPS oder localhost und einen unterstuetzten Browser.");
            context = new AudioContext();
            await context.resume();
            if (current !== generation) return;
            const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (current !== generation) { mic.getTracks().forEach(track => track.stop()); return; }
            stream = mic;
            const analyser = context.createAnalyser();
            analyser.fftSize = 1024;
            source = context.createMediaStreamSource(stream);
            source.connect(analyser);
            const samples = new Float32Array(analyser.fftSize);
            let previous = 0;
            let lastPulse = -Infinity;
            function tick() {
                analyser.getFloatTimeDomainData(samples);
                let energy = 0;
                for (const sample of samples) energy += sample * sample;
                const rms = Math.sqrt(energy / samples.length);
                const level = Math.min(1, rms * 8);
                const now = performance.now();
                if (level > 0.15 && level - previous > 0.08 && now - lastPulse > 250) {
                    pulseId++;
                    lastPulse = now;
                }
                previous = level;
                meter.value = level;
                channel.postMessage({ senderId, level, pulseId });
            }
            timer = setInterval(tick, 50);
            for (const track of stream.getAudioTracks()) {
                track.addEventListener("ended", () => {
                    if (current !== generation) return;
                    release();
                    report("Mikrofon wurde getrennt. Bitte erneut starten.", true);
                }, { once: true });
            }
            report("Mikrofon aktiv. Jetzt klatschen oder sprechen.");
        } catch (error) {
            if (current !== generation) return;
            release();
            fail(error);
        }
    });
    stop.addEventListener("click", () => { release(); report("Mikrofon gestoppt."); });
    report("Mikrofon starten; dann Zuschauerfenster oeffnen.");
    return release;
}

function startViewer(channel) {
    const canvas = document.getElementById("visual");
    canvas.hidden = false;
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
    if (!gl) throw new Error("Die Jam-Grafik braucht WebGL2. Dieser Browser stellt es nicht bereit.");
    const vertex = `#version 300 es
    void main() {
        vec2 p = gl_VertexID == 0 ? vec2(-1.,-1.) : gl_VertexID == 1 ? vec2(3.,-1.) : vec2(-1.,3.);
        gl_Position = vec4(p,0.,1.);
    }`;
    const fragment = `#version 300 es
    precision highp float;
    uniform vec2 size;
    uniform float radius;
    uniform vec3 tint;
    uniform vec3 ages;
    out vec4 color;
    void main() {
        vec2 p = (gl_FragCoord.xy - size*.5) / min(size.x,size.y);
        float d = length(p);
        float disk = 1. - smoothstep(radius-.005, radius+.005, d);
        float rings = 0.;
        for (int i=0; i<3; i++) {
            if (ages[i] >= 0. && ages[i] < 1.2) {
                float r = .08 + ages[i]*.4;
                rings += (1.-smoothstep(.003,.01,abs(d-r))) * (1.-ages[i]/1.2);
            }
        }
        color = vec4(tint * clamp(disk + rings,0.,1.),1.);
    }`;
    const program = gl.createProgram();
    if (!program) throw new Error("Jam-WebGL-Programm konnte nicht angelegt werden.");
    const shaders = [];
    try {
        for (const [type, code] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
            const shader = gl.createShader(type);
            if (!shader) throw new Error("Jam-Shader konnte nicht angelegt werden.");
            shaders.push(shader);
            gl.shaderSource(shader, code);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Jam-Shader: ${gl.getShaderInfoLog(shader)}`);
            gl.attachShader(program, shader);
        }
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Jam-Shaderlink: ${gl.getProgramInfoLog(program)}`);
    } catch (error) {
        gl.deleteProgram(program);
        throw error;
    } finally {
        for (const shader of shaders) gl.deleteShader(shader);
    }
    gl.useProgram(program);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const uniforms = Object.fromEntries(["size", "radius", "tint", "ages"].map(name => {
        const location = gl.getUniformLocation(program, name);
        if (location === null) throw new Error(`Jam-Uniform fehlt: ${name}`);
        return [name, location];
    }));
    const colors = [[0.2, 0.75, 1], [1, 0.3, 0.55], [0.45, 1, 0.45]];
    let color = 0;
    let target = 0;
    let level = 0;
    let receivedAt = -Infinity;
    let senderId = null;
    let lastPulse = 0;
    let connected = false;
    let previousFrame = performance.now();
    const pulses = [];
    let frameId;
    let lost = false;
    function pulse() {
        color = (color + 1) % colors.length;
        pulses.unshift(performance.now());
        pulses.length = Math.min(3, pulses.length);
    }
    channel.onmessage = event => {
        const data = event.data;
        if (!data || typeof data.senderId !== "string" || !Number.isFinite(data.level)
            || data.level < 0 || data.level > 1 || !Number.isSafeInteger(data.pulseId) || data.pulseId < 0) {
            fail(new Error("Ungueltige Jam-Nachricht."));
            return;
        }
        if (data.senderId !== senderId) { senderId = data.senderId; lastPulse = data.pulseId; }
        else if (data.pulseId > lastPulse) pulse();
        lastPulse = data.pulseId;
        target = data.level;
        receivedAt = performance.now();
        connected = true;
        report(`Sender empfangen. Pegel: ${data.level.toFixed(2)} | Impulse: ${data.pulseId}`);
    };
    document.getElementById("test").addEventListener("click", () => {
        target = 0.8;
        receivedAt = performance.now();
        pulse();
        report("Lokaler Grafiktest - kein Mikrofon-/Verbindungstest.");
    });
    canvas.addEventListener("webglcontextlost", event => {
        event.preventDefault();
        lost = true;
        cancelAnimationFrame(frameId);
        fail(new Error("WebGL-Kontext verloren. Bitte Seite neu laden."));
    });
    function frame(time) {
        if (lost) return;
        const dt = Math.max(0, Math.min(0.1, (time - previousFrame) / 1000));
        previousFrame = time;
        if (time - receivedAt > 1000) {
            target = 0;
            if (connected) { connected = false; report("Keine aktuellen Senderdaten. Mikrofon starten oder Verbindung pruefen."); }
        }
        level += (target - level) * (1 - Math.exp(-12 * dt));
        const width = Math.max(1, Math.round(canvas.clientWidth));
        const height = Math.max(1, Math.round(canvas.clientHeight));
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        gl.viewport(0, 0, width, height);
        gl.uniform2f(uniforms.size, width, height);
        gl.uniform1f(uniforms.radius, 0.06 + level * 0.25);
        gl.uniform3fv(uniforms.tint, colors[color]);
        gl.uniform3fv(uniforms.ages, [0, 1, 2].map(i => pulses[i] === undefined ? -1 : (time - pulses[i]) / 1000));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        frameId = requestAnimationFrame(frame);
    }
    frameId = requestAnimationFrame(frame);
    report("Warte auf Sender. Fuer Grafiktest den Testimpuls verwenden.");
    return () => { cancelAnimationFrame(frameId); gl.deleteProgram(program); gl.deleteVertexArray(vao); };
}
