import { test } from "node:test";
import assert from "node:assert/strict";
import { createMobileQuality, createMobileComputeScheduler, isMobileRendering, mobileRenderSize } from "./mobile-rendering.js";

test("mobile detection covers Android, iOS and coarse touch devices without changing desktop", () => {
    for (const userAgent of ["Android T80", "iPhone", "iPad"]) {
        assert.equal(isMobileRendering({ navigator: { userAgent } }), true);
    }
    assert.equal(isMobileRendering({ navigator: { userAgentData: { mobile: true } } }), true);
    assert.equal(isMobileRendering({
        navigator: { userAgent: "Macintosh", maxTouchPoints: 5 }, matchMedia: () => ({ matches: true }),
    }), true);
    assert.equal(isMobileRendering({ navigator: { userAgent: "Windows", maxTouchPoints: 0 } }), false);
});

test("mobile starts at 360 pixels on the long edge with correct aspect, pixel reduction and limits", () => {
    const quality = createMobileQuality();
    assert.equal(quality.getLongEdge(), 360);
    assert.deepEqual(mobileRenderSize(390, 844, 360), { width: 166, height: 360 });
    assert.deepEqual(mobileRenderSize(844, 390, 360), { width: 360, height: 166 });
    assert.deepEqual(mobileRenderSize(1920, 1080, 360), { width: 360, height: 203 });
    assert.ok(166 * 360 < 1920 * 1080 / 30);
    assert.deepEqual(mobileRenderSize(100, 100, 360), { width: 100, height: 100 });
    assert.deepEqual(mobileRenderSize(2000, 1000, 1024, 512), { width: 512, height: 256 });
    assert.throws(() => mobileRenderSize(0, 10, 360), /Rendergroesse/);
});

test("quality lowers after sustained slow work, rises cautiously and never exceeds bounds", () => {
    const quality = createMobileQuality();
    let time = 0;
    const sample = duration => { time += duration + 34; return quality.sample(duration, time); };
    sample(50); sample(50);
    assert.equal(sample(50), true);
    assert.equal(quality.getLongEdge(), 240);
    for (let i = 0; i < 200; i++) sample(100);
    assert.equal(quality.getLongEdge(), 240);
    for (let i = 0; i < 89; i++) assert.equal(sample(5), false);
    assert.equal(sample(5), true);
    assert.equal(quality.getLongEdge(), 360);
    for (let i = 0; i < 5; i++) sample(50);
    assert.equal(quality.getLongEdge(), 360);
    for (let i = 0; i < 1000; i++) sample(5);
    assert.equal(quality.getLongEdge(), 1024);
    sample(50); sample(50); sample(2000);
    assert.equal(sample(50), false);
    assert.equal(quality.getLongEdge(), 1024);
    assert.throws(() => quality.sample(NaN, time), /Renderzeit/);
});

function harness() {
    let time = 0;
    const timers = new Map();
    let id = 0;
    let complete, reject;
    let computes = 0;
    const samples = [], errors = [], before = [];
    const scheduler = createMobileComputeScheduler({
        compute: () => { computes++; },
        waitForGpu: () => new Promise((resolve, fail) => { complete = resolve; reject = fail; }),
        onSample: (elapsed, time) => samples.push({ elapsed, time }),
        onError: error => errors.push(error),
        now: () => time,
        schedule: (callback, delay) => { timers.set(++id, { callback, delay }); return id; },
        cancel: handle => timers.delete(handle),
    });
    const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
    return {
        scheduler, samples, errors, before, timers,
        get computes() { return computes; },
        async tick() {
            const [id, timer] = timers.entries().next().value;
            timers.delete(id);
            time += timer.delay;
            timer.callback();
            await settle();
        },
        async finish(duration = 5) { time += duration; complete(); await settle(); },
        async fail(error) { reject(error); await settle(); },
        settle,
    };
}

test("scheduler coalesces latest colormap work, submits once at a time and limits compute rate", async () => {
    const h = harness();
    h.scheduler.request(() => h.before.push("old"));
    h.scheduler.request(() => h.before.push("latest"));
    await h.tick();
    assert.equal(h.computes, 1);
    assert.deepEqual(h.before, ["latest"]);
    for (let i = 0; i < 50; i++) h.scheduler.request(() => h.before.push(i));
    h.scheduler.request(); // navigation must not erase the pending palette update
    assert.equal(h.computes, 1);
    assert.equal(h.timers.size, 0);
    await h.finish(10);
    assert.equal(h.samples[0].elapsed, 10);
    const timer = [...h.timers.values()][0];
    assert.ok(timer.delay >= 23 && timer.delay < 24);
    await h.tick();
    assert.equal(h.computes, 2);
    assert.deepEqual(h.before, ["latest", 49]);
    await h.finish();
    assert.equal(h.timers.size, 0);
});

test("thumbnail flush waits for the latest pending work without waiting for an endless audio stream", async () => {
    const h = harness();
    h.scheduler.request();
    await h.tick();
    h.scheduler.request(() => h.before.push("snapshot"));
    const flushed = h.scheduler.flush();
    await h.finish();
    assert.equal(h.computes, 2);
    h.scheduler.request();
    await h.finish();
    await flushed;
    assert.equal(h.computes, 2);
    assert.deepEqual(h.before, ["snapshot"]);
});

test("GPU failures are surfaced once, stop scheduling, and reject thumbnail flush", async () => {
    const h = harness();
    h.scheduler.request();
    await h.tick();
    h.scheduler.request();
    const error = new Error("GPU unavailable");
    await h.fail(error);
    assert.deepEqual(h.errors, [error]);
    assert.equal(h.timers.size, 0);
    h.scheduler.request();
    assert.equal(h.timers.size, 0);
    await assert.rejects(h.scheduler.flush(), /GPU unavailable/);
});

test("device loss cancels queued work and is reported only once", async () => {
    const h = harness();
    h.scheduler.request();
    const error = new Error("Device lost");
    h.scheduler.fail(error);
    h.scheduler.fail(error);
    assert.equal(h.timers.size, 0);
    assert.deepEqual(h.errors, [error]);
    await assert.rejects(h.scheduler.flush(), /Device lost/);
});
