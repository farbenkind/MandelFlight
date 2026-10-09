import { BaseMode, ModMode } from "./knob-state.js";
import { createSourceContext } from "./modulation.js";
import { clamp, fmod, log as debugLog, pi } from "./util.js";

export function applyModulations(knobs, {
    sourceContext = createSourceContext(),
    log = debugLog,
} = {}) {
    for (const param in knobs) {
        const knob = knobs[param];
        if (knob.modEnabled) log("", param);

        let punchSum = 0;
        let baseSum = 0;
        let baseMod = false;

        for (const mod of knob.mods) {
            const sourceValue = sourceContext.evaluate(mod.sourceObj);
            const value = mod.transformObj.apply(sourceValue) * mod.amount;

            switch (mod.mode) {
                case ModMode.BASE:
                    baseSum += value * 0.1;
                    baseMod = true;
                    break;
                case ModMode.PUNCH:
                    punchSum += value;
                    break;
            }
            if (knob.modEnabled) log("", mod.sourceObj.name);
        }

        if (!knob.modEnabled) continue;
        log("#####", "");

        let liveValue = knob.liveValue;
        if (baseMod) {
            const baseMin = knob.min;
            const baseMax = knob.max;
            const baseRange = baseMax - baseMin;
            const small = baseRange * 1e-6;
            const smooth = (value, multiplier) =>
                1 + knob.smooth * Math.cos((value - baseMin) * multiplier * pi / baseRange);

            switch (knob.mode) {
                case BaseMode.SLIDE:
                    liveValue = baseMin + fmod(
                        (liveValue - baseMin) + baseSum * smooth(liveValue, 1),
                        baseRange,
                    );
                    break;
                case BaseMode.BOUNCE:
                    liveValue += baseSum * smooth(liveValue, 2) * knob.bounceDir;
                    if (liveValue > baseMax) {
                        liveValue = baseMax * (1 - small);
                        knob.bounceDir = -1;
                    } else if (liveValue < baseMin) {
                        liveValue = baseMin * (1 + small);
                        knob.bounceDir = 1;
                    }
                    break;
            }

            knob.liveValue = liveValue;
            knob.cmValue = baseMin + fmod(
                (liveValue - baseMin) + punchSum * knob.bounceDir,
                baseRange,
            );
        } else {
            knob.cmValue = clamp(knob.liveValue + punchSum, 0, 1);
        }
    }
}
