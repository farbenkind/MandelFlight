import { beatDivisions } from "./beat-divisions.js";

const divisions = [...beatDivisions, { value: "1/1", label: "1/1 (1 Bar)", beats: 4 }];

function normalCdf(x) {
    const z = x / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * Math.abs(z));
    const erf = 1 - (((((1.061405429 * t - 1.453152027) * t)
        + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
    return (1 + Math.sign(z) * erf) / 2;
}

function normalQuantile(probability) {
    const sigma = 0.15;
    const lowCdf = normalCdf(-0.5 / sigma);
    const target = lowCdf + probability * (1 - 2 * lowCdf);
    let low = 0, high = 1;
    for (let i = 0; i < 32; i++) {
        const mid = (low + high) / 2;
        if (normalCdf((mid - 0.5) / sigma) < target) low = mid;
        else high = mid;
    }
    return (low + high) / 2;
}

function sample(context, distribution, center, skew) {
    const uniform = context.random();
    // Interpolating quantiles gives continuous shapes without switching distribution modes.
    const shaped = distribution < 0
        ? uniform + (-distribution) * (normalQuantile(uniform) - uniform)
        : uniform + distribution * (Math.sin(uniform * Math.PI / 2) ** 2 - uniform);
    const centered = shaped <= 0.5
        ? shaped * 2 * center
        : center + (shaped - 0.5) * 2 * (1 - center);
    const odds = Math.exp(skew * 3);
    return Math.max(0, Math.min(1, centered / (centered + (1 - centered) / odds)));
}

export function makeRandomSource() {
    return {
        name: "random",
        type: "random",
        currentValue: null,
        lastTriggerPosition: null,
        lastBeatPosition: null,
        timing: null,
        params: {
            distribution: { label: "Distribution", ui: "slider", min: -1, max: 1, exp: false, value: 0 },
            center: { label: "Center", ui: "slider", min: 0, max: 1, exp: false, value: 0.5 },
            skew: { label: "Skew", ui: "slider", min: -1, max: 1, exp: false, value: 0 },
            division: {
                label: "Division", ui: "select", value: "1/4",
                options: divisions.map(({ value, label }) => ({ value, label })),
            },
            phase: { label: "Phase", ui: "slider", min: 0, max: 1, exp: false, value: 0 },
        },
        update(context) {
            const { distribution, center, skew, division, phase } = this.params;
            for (const param of [distribution, center, skew, phase]) {
                if (!Number.isFinite(param.value) || param.value < param.min || param.value > param.max) {
                    throw new Error(`Invalid Random parameter: ${param.label}`);
                }
            }
            const duration = divisions.find(entry => entry.value === division.value)?.beats;
            if (!duration) throw new Error(`Unknown Random division: ${division.value}`);
            const position = context.signal("beatPosition");
            const boundary = (Math.floor(position / duration - phase.value) + phase.value) * duration;
            const timing = `${division.value}:${phase.value}`;
            const initialize = this.currentValue === null;
            const resync = this.timing !== timing || position < this.lastBeatPosition;
            if (initialize || (!resync && boundary > this.lastTriggerPosition)) {
                this.currentValue = sample(context, distribution.value, center.value, skew.value);
            }
            this.lastTriggerPosition = boundary;
            this.lastBeatPosition = position;
            this.timing = timing;
            return this.currentValue;
        },
    };
}
