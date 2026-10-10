export const MODULATION_DELTA_TIME = 1 / 40;

export function legacyModulationSignals() {
    const host = globalThis.window ?? {};
    return {
        bassBeat: host.bassBeat, midBeat: host.midBeat, treBeat: host.treBeat,
        bpm: host.bpm, beatPhase: host.beatPhase, beatPosition: host.beatPosition,
        beatConfidence: host.beatConfidence,
    };
}

export function createModulationRuntime() {
    let time = 0;
    return {
        next(signals) {
            time += MODULATION_DELTA_TIME;
            return { deltaTime: MODULATION_DELTA_TIME, time, signals: { ...signals } };
        },
    };
}
