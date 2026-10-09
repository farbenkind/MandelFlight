import { test } from "node:test";
import assert from "node:assert/strict";
import { attachFractalNavigation } from "./fractal-navigation.js";

test("shared navigation zooms safely and captures/cancels primary-pointer drags", () => {
    const previousWindow = globalThis.window;
    const handlers = new Map();
    const classes = new Set();
    let captured = null;
    let blur;
    globalThis.window = { addEventListener: (name, handler) => { if (name === "blur") blur = handler; } };
    const canvas = {
        addEventListener: (name, handler, options) => {
            handlers.set(name, handler);
            if (name === "wheel") assert.equal(options.passive, false);
        },
        getBoundingClientRect: () => ({ width: 800, height: 400 }),
        setPointerCapture: id => { captured = id; },
        hasPointerCapture: id => captured === id,
        releasePointerCapture: () => { captured = null; },
        classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
    };
    const params = new Float32Array([-0.5, 0, 3, 1000, 2]);
    let changes = 0;
    const send = (name, data = {}) => handlers.get(name)({
        preventDefault() {}, pointerId: 1, isPrimary: true, button: 0,
        clientX: 100, clientY: 100, ...data,
    });
    try {
        attachFractalNavigation(canvas, params, () => changes++);
        for (const deltaMode of [0, 1, 2]) {
            const before = params[2];
            send("wheel", { deltaY: -100000, deltaMode });
            assert.ok(params[2] > 0 && params[2] < before);
        }
        send("pointerdown", { button: 2 });
        assert.equal(captured, null);
        send("pointerdown");
        assert.equal(captured, 1);
        assert.ok(classes.has("navigating"));
        const zoom = params[2];
        send("pointermove", { pointerId: 2, clientX: 200 });
        assert.equal(params[0], -0.5);
        send("pointermove", { clientX: 200, clientY: 140 });
        assert.ok(Math.abs(params[0] - (-0.5 - 0.25 * zoom)) < 1e-7);
        assert.ok(Math.abs(params[1] - 0.1 * zoom) < 1e-7);
        assert.equal(changes, 4);
        for (const end of ["pointerup", "pointercancel", "lostpointercapture"]) {
            send("pointerdown");
            send(end);
            assert.equal(captured, null);
            assert.ok(!classes.has("navigating"));
        }
        send("pointerdown");
        blur();
        assert.equal(captured, null);
        const before = changes;
        send("pointermove", { clientX: 500 });
        assert.equal(changes, before);
    } finally {
        globalThis.window = previousWindow;
    }
});
