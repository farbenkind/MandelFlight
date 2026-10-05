import { knobs, KnobState } from "../knob-state.js";
import { openModOverlay } from "./mod-overlay.js";

export function initKnobs() {
    document.querySelectorAll(".knob").forEach(knob => {
        const param = knob.dataset.param;
        const initValue = parseFloat(knob.dataset.init) || 0.0;

        knobs[param] = new KnobState(initValue);

        const updateVisual = () => {
            const v = knobs[param].liveValue;
            const angle = v * 270 - 135;
            knob.style.transform = `rotate(${angle}deg)`;
            knob.style.setProperty("--needle-angle", angle + "deg");
        };

        updateVisual();

        knob.addEventListener("dblclick", () => {
            openModOverlay(param);
        })

        knob.addEventListener("pointerdown", () => {
            knobs[param].knobPressed = true;
        });

        window.addEventListener("pointerup", () => {
            knobs[param].knobPressed = false;
        });

        window.addEventListener("pointermove", (ev) => {
            if (!knobs[param].knobPressed) return;

            let v = knobs[param].liveValue;
            v += ev.movementY * -0.005;
            v = Math.max(0, Math.min(1, v));

            knobs[param].liveValue = v;
            knobs[param].cmValue = v;

            updateVisual();
        });
    });

    document.querySelectorAll(".mod-toggle").forEach(btn => {
        const param = btn.dataset.param;
    
        btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            knobs[param].modEnabled = !knobs[param].modEnabled;
            btn.classList.toggle("active", knobs[param].modEnabled);
        });
    });
}
