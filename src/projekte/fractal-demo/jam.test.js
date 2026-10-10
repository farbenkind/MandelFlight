import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const code = (await readFile(new URL("./jam/main.js", import.meta.url), "utf8")).replace('import "./style.css";', "");

function harness() {
    const channels = [];
    let time = 0;
    let rms = 0;
    let denied = false;
    let permissionResolve;
    let pendingPermission = false;
    const tracks = [];
    const frames = new Map();
    const timers = new Map();
    let id = 0;
    const graphics = { radius: 0, tint: [], ages: [], draws: 0 };
    const errors = [];
    const gl = {
        createProgram: () => ({}), createShader: () => ({}), createVertexArray: () => ({}),
        shaderSource() {}, compileShader() {}, attachShader() {}, linkProgram() {},
        getShaderParameter: () => true, getProgramParameter: () => true,
        deleteProgram() {}, deleteShader() {}, deleteVertexArray() {}, useProgram() {}, bindVertexArray() {},
        getUniformLocation: (_, name) => name,
        uniform1f: (_, value) => { graphics.radius = value; },
        uniform2f() {},
        uniform3fv: (name, value) => { graphics[name] = [...value]; },
        viewport() {}, drawArrays: () => graphics.draws++,
    };
    function page(role) {
        const elements = new Map();
        const handlers = new Map();
        function element() {
            return {
                hidden: true, disabled: false, textContent: "", value: 0,
                width: 300, height: 150, clientWidth: 800, clientHeight: 600,
                classList: { toggle() {} },
                handlers: new Map(),
                addEventListener(name, callback) { this.handlers.set(name, callback); },
                getContext: () => gl,
            };
        }
        class Channel {
            constructor() { channels.push(this); }
            postMessage(data) { for (const channel of channels) if (channel !== this && !channel.closed) channel.onmessage?.({ data }); }
            close() { this.closed = true; }
        }
        class AudioContext {
            resume() { return Promise.resolve(); }
            close() { return Promise.resolve(); }
            createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData: samples => samples.fill(rms) }; }
            createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
        }
        function mic() {
            const track = { stopped: false, stop() { this.stopped = true; }, addEventListener() {} };
            tracks.push(track);
            return { getTracks: () => [track], getAudioTracks: () => [track] };
        }
        const context = {
            document: { getElementById(name) { if (!elements.has(name)) elements.set(name, element()); return elements.get(name); } },
            window: { addEventListener: (name, handler) => handlers.set(name, handler) },
            location: { search: `?role=${role}` }, URLSearchParams,
            BroadcastChannel: Channel, AudioContext, Float32Array,
            crypto: { randomUUID: () => `sender-${channels.length}` },
            navigator: { mediaDevices: { getUserMedia: async () => {
                if (denied) throw new Error("Permission denied");
                if (pendingPermission) return new Promise(resolve => { permissionResolve = () => resolve(mic()); });
                return mic();
            } } },
            performance: { now: () => time },
            setInterval: callback => { timers.set(++id, callback); return id; },
            clearInterval: id => timers.delete(id),
            requestAnimationFrame: callback => { frames.set(++id, callback); return id; },
            cancelAnimationFrame: id => frames.delete(id),
            console: { error: (...args) => errors.push(args) },
        };
        runInNewContext(code, context);
        return {
            elements, handlers,
            click: name => elements.get(name).handlers.get("click")(),
            channel: channels.at(-1),
        };
    }
    return {
        page, graphics, tracks, errors, timers,
        setRms: value => { rms = value; },
        deny: () => { denied = true; },
        deferPermission: () => { pendingPermission = true; },
        resolvePermission: () => permissionResolve(),
        tick() { time += 50; for (const callback of [...timers.values()]) callback(); },
        frame(elapsed = 50) {
            time += elapsed;
            const callbacks = [...frames.values()];
            frames.clear();
            for (const callback of callbacks) callback(time);
        },
    };
}

test("microphone samples in sender drive viewer radius, color and impulse rings through the channel", async () => {
    const h = harness();
    const viewer = h.page("viewer");
    const sender = h.page("sender");
    await sender.click("start");
    h.tick();
    h.frame();
    const before = h.graphics.radius;
    const tint = [...h.graphics.tint];
    h.setRms(0.08);
    h.tick();
    h.frame();
    assert.ok(h.graphics.radius > before);
    assert.notDeepEqual(h.graphics.tint, tint);
    assert.ok(h.graphics.ages[0] >= 0);
    assert.match(viewer.elements.get("status").textContent, /Impulse: 1/);
    h.tick(); h.tick();
    assert.match(viewer.elements.get("status").textContent, /Impulse: 1/);
    assert.equal(h.errors.length, 0);
    sender.handlers.get("pagehide")();
});

test("Stop releases microphone tracks and sends zero; stale data also decays", async () => {
    const h = harness();
    const viewer = h.page("viewer");
    const sender = h.page("sender");
    await sender.click("start");
    h.setRms(0.1);
    h.tick(); h.frame();
    const before = h.graphics.radius;
    h.frame(1100);
    assert.ok(h.graphics.radius < before);
    assert.match(viewer.elements.get("status").textContent, /Keine aktuellen/);
    sender.click("stop");
    assert.ok(h.tracks.every(track => track.stopped));
    assert.equal(h.timers.size, 0);
    assert.equal(sender.elements.get("level").value, 0);
});

test("denied permission is visible and permits retry", async () => {
    const h = harness();
    const sender = h.page("sender");
    h.deny();
    await sender.click("start");
    assert.match(sender.elements.get("status").textContent, /Permission denied/);
    assert.equal(sender.elements.get("start").disabled, false);
    assert.equal(h.timers.size, 0);
    assert.equal(h.errors.length, 1);
});

test("Stop while permission is pending releases a late stream without starting analysis", async () => {
    const h = harness();
    const sender = h.page("sender");
    h.deferPermission();
    const starting = sender.click("start");
    await new Promise(resolve => setImmediate(resolve));
    sender.click("stop");
    h.resolvePermission();
    await starting;
    assert.ok(h.tracks.every(track => track.stopped));
    assert.equal(h.timers.size, 0);
    assert.equal(sender.elements.get("start").disabled, false);
});

test("viewer test is explicitly local and malformed messages surface errors", () => {
    const h = harness();
    const viewer = h.page("viewer");
    viewer.click("test");
    h.frame();
    assert.ok(h.graphics.radius > 0.06);
    assert.match(viewer.elements.get("status").textContent, /kein Mikrofon/);
    viewer.channel.onmessage({ data: { level: NaN, pulseId: 1 } });
    assert.match(viewer.elements.get("status").textContent, /Ungueltige/);
    assert.equal(h.errors.length, 1);
});
