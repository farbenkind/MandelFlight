import { knobs, KnobState } from "../knob-state.js";
import { openModOverlay } from "./mod-overlay.js";
import { updateKnobVisual } from "./knob-visual.js";

export function initKnobs({ onChange } = {}) {
    document.querySelectorAll(".knob").forEach(knob => {
        const param = knob.dataset.param;
        const initValue = parseFloat(knob.dataset.init) || 0.0;

        knobs[param] = new KnobState(initValue);

        const updateVisual = () => updateKnobVisual(knob, knobs[param]);
        const wrapper = knob.parentElement;
        let pointerId = null;
        let previousY = 0;

        updateVisual();

        knob.addEventListener("dblclick", () => {
            openModOverlay(param);
        })

        knob.addEventListener("pointerdown", (ev) => {
            if (!ev.isPrimary || ev.button !== 0 || pointerId !== null) return;
            ev.preventDefault();
            pointerId = ev.pointerId;
            previousY = ev.clientY;
            knob.setPointerCapture(pointerId);
            knobs[param].knobPressed = true;
            wrapper.classList.add("dragging");
        });

        const endDrag = () => {
            const capturedId = pointerId;
            pointerId = null;
            knobs[param].knobPressed = false;
            wrapper.classList.remove("dragging");
            if (capturedId !== null && knob.hasPointerCapture(capturedId)) {
                knob.releasePointerCapture(capturedId);
            }
        };
        knob.addEventListener("pointerup", endDrag);
        knob.addEventListener("pointercancel", endDrag);
        knob.addEventListener("lostpointercapture", endDrag);
        window.addEventListener("blur", endDrag);

        knob.addEventListener("pointermove", (ev) => {
            if (ev.pointerId !== pointerId) return;

            let v = knobs[param].liveValue;
            v += (ev.clientY - previousY) * -0.005;
            previousY = ev.clientY;
            v = Math.max(0, Math.min(1, v));

            knobs[param].liveValue = v;
            knobs[param].cmValue = v;

            updateVisual();
            onChange?.();
        });
    });

    document.querySelectorAll(".mod-toggle").forEach(btn => {
        const param = btn.dataset.param;
    
        btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            knobs[param].modEnabled = !knobs[param].modEnabled;
            btn.classList.toggle("active", knobs[param].modEnabled);
            onChange?.();
        });
    });
}
