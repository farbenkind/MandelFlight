export function updateKnobVisual(element, state, { rotate = true } = {}) {
    if (rotate) {
        const angle = state.liveValue * 270 - 135;
        element.style.transform = `rotate(${angle}deg)`;
        element.style.setProperty("--needle-angle", `${angle}deg`);
    }

    const punchDelta = state.cmValue - state.liveValue;
    element.classList.toggle("punch-up", punchDelta > 0);
    element.classList.toggle("punch-down", punchDelta < 0);
    element.style.setProperty("--punch-offset", `${punchDelta * 270}deg`);
    element.style.setProperty("--punch-sweep", `${Math.abs(punchDelta * 270)}deg`);

    const wrapper = element.parentElement;
    wrapper.querySelector(".knob-value").textContent = state.cmValue.toFixed(3);
    wrapper.querySelector(".mod-toggle").classList.toggle("active", state.modEnabled);
}
