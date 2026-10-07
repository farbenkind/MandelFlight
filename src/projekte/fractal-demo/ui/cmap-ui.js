function el(tag, className, attrs = {}) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    Object.assign(e, attrs);
    return e;
}

function buildKnob(k) {
    const wrapper = el("div", "knob-wrapper");
    const knob = el("div", "knob");
    knob.dataset.param = k.id;
    knob.dataset.init = k.init;
    knob.append(el("span", "knob-punch-arc"), el("span", "knob-punch-needle"));
    const toggle = el("button", "mod-toggle");
    toggle.dataset.param = k.id;
    wrapper.append(knob, toggle, el("div", "knob-label", { textContent: k.label }));
    return wrapper;
}

// Erzeugt die Panels aller Sektionen; muss vor initKnobs() laufen.
export function buildCmapUI(root, sections) {
    for (const section of sections) {
        const row = el("div", "cmap-row");
        row.id = section.id;
        const channels = el("div");
        channels.id = section.containerId;
        for (const panel of section.panels) {
            const p = el("div", `channel-panel channel-${panel.color}`);
            panel.knobs.forEach(k => p.appendChild(buildKnob(k)));
            channels.appendChild(p);
        }
        row.appendChild(channels);
        root.appendChild(row);
    }
}
