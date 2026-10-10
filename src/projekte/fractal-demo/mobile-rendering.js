export const MOBILE_RESOLUTION_STEPS = [240, 360, 480, 640, 800, 1024];

export function isMobileRendering(environment = globalThis) {
    const navigator = environment.navigator;
    if (navigator?.userAgentData?.mobile === true) return true;
    if (/Android|iPhone|iPad|iPod/i.test(navigator?.userAgent ?? "")) return true;
    return Boolean(environment.matchMedia?.("(pointer: coarse)").matches)
        && (navigator?.maxTouchPoints ?? 0) > 0;
}

export function mobileRenderSize(width, height, longEdge, limit = 8192) {
    if (![width, height, longEdge, limit].every(value => Number.isFinite(value) && value > 0)) {
        throw new Error("Ungueltige mobile Rendergroesse.");
    }
    const scale = Math.min(1, longEdge / Math.max(width, height), limit / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function createMobileQuality() {
    let index = 1;
    let slow = 0;
    let fast = 0;
    let lastChange = -Infinity;
    return {
        getLongEdge: () => MOBILE_RESOLUTION_STEPS[index],
        sample(milliseconds, time) {
            if (!Number.isFinite(milliseconds) || milliseconds < 0 || !Number.isFinite(time)) {
                throw new Error("Ungueltige Renderzeit.");
            }
            // Long stalls are not reliable performance samples (e.g. a suspended tab).
            if (milliseconds > 1000) { slow = fast = 0; return false; }
            slow = milliseconds > 40 ? slow + 1 : 0;
            fast = milliseconds < 12 ? fast + 1 : 0;
            const next = slow >= 3 ? Math.max(0, index - 1)
                : fast >= 90 ? Math.min(MOBILE_RESOLUTION_STEPS.length - 1, index + 1) : index;
            if (next === index || time - lastChange < 5000) return false;
            index = next;
            lastChange = time;
            slow = fast = 0;
            return true;
        },
    };
}

export function createMobileComputeScheduler({
    compute, waitForGpu, onSample, onError,
    now = () => performance.now(),
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancel = handle => clearTimeout(handle),
}) {
    let pending = false;
    let running = null;
    let timer = null;
    let beforeCompute = null;
    let lastStart = -Infinity;
    let failure = null;

    function fail(error) {
        if (failure) return;
        failure = error;
        pending = false;
        if (timer !== null) { cancel(timer); timer = null; }
        onError(error);
    }

    function start() {
        if (running || !pending || failure) return;
        pending = false;
        const before = beforeCompute;
        beforeCompute = null;
        lastStart = now();
        // Defer execution until running is assigned, including synchronous failures.
        running = Promise.resolve().then(async () => {
            before?.();
            compute();
            await waitForGpu();
            if (failure) return;
            onSample(now() - lastStart, now());
        }).catch(fail).finally(() => {
            running = null;
            arm();
        });
    }

    function arm() {
        if (!pending || running || timer !== null || failure) return;
        timer = schedule(() => { timer = null; start(); }, Math.max(0, 1000 / 30 - (now() - lastStart)));
    }

    return {
        request(before) {
            if (failure) return;
            pending = true;
            if (before) beforeCompute = before;
            arm();
        },
        isRunning: () => running !== null,
        hasFailed: () => failure !== null,
        fail,
        async flush() {
            if (running) await running;
            if (timer !== null) { cancel(timer); timer = null; }
            // Flush one latest update, not an unbounded stream of audio requests.
            if (pending) { start(); await running; }
            if (failure) throw failure;
        },
    };
}
