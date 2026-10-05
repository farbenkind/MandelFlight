import { knobs, ModMode, BaseMode, ModTransfrom, sliderMod } from "../knob-state.js";
import { makeLinearTransform, makePowerTransform, makeSourceFromName } from "../modulation.js";
import { symExp } from "../util.js";

document.getElementById("modClose").addEventListener("click", () => {
    document.getElementById("modOverlay").classList.add("hidden");
});

function createSourceSelector(mod, paramName) {
    const wrap = document.createElement("div");
    const sel = document.createElement("select");

    for (const name of ["bassEnv", "midEnv", "treEnv", "osc1", "osc2", "const", "bassBeat", "midBeat", "treBeat"]) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        if (mod.sourceObj.name === name) opt.selected = true;
        sel.appendChild(opt);
    }

    sel.onchange = () => {
        mod.sourceObj = makeSourceFromName(sel.value);
        renderModUI(paramName);
    };

    wrap.appendChild(sel);
    return wrap;
}
function createTransformSelector(mod, paramName) {
    const wrap = document.createElement("div");
    const sel = document.createElement("select");

    for (const val of ["linear", "power"]) {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = val;
        if (mod.transformObj.type === val) opt.selected = true;
        sel.appendChild(opt);
    }

    sel.onchange = () => {
        switch (sel.value) {
            case ModTransfrom.LINEAR:
                mod.transformObj = makeLinearTransform({ slope: 1, bias: 0 });
                break;
            case ModTransfrom.POWER:
                mod.transformObj = makePowerTransform({ exponent: 1 })
                break;
        }
        renderModUI(paramName);
    };

    wrap.appendChild(sel);
    return wrap;
}
function createModeSelector(mod, paramName) {
    const wrap = document.createElement("div");
    const sel = document.createElement("select");

    for (const [key, val] of Object.entries(ModMode)) {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = val;
        if (mod.mode === val) opt.selected = true;
        sel.appendChild(opt);
    }

    sel.onchange = () => {
        mod.mode = sel.value;
        renderModUI(paramName);
    };

    wrap.appendChild(sel);
    return wrap;
}
function createParamKnobs(params) {
    const wrap = document.createElement("div");
    wrap.className = "param-knobs";
    wrap.style.gap = "0px"
    for (const key in params) {
        const p = params[key];

        const label = document.createElement("label");
        label.textContent = key;

        const inp = document.createElement("input");
        inp.type = "range";
        inp.min = 0;
        inp.max = 1;
        inp.step = 0.005;
        inp.style.width = "100%";

        // inverse exponentielle Formel
        const exp = p.exp ? symExp(p.max) : 1;
        const range = (p.max - p.min) || 1;
        const norm = Math.max(0, Math.min(1, (p.value - p.min) / range));
        inp.value = Math.pow(norm, 1 / exp);

        // --- Tooltip über dem Slider ---
        const tooltip = document.createElement("div");
        tooltip.className = "slider-tooltip";
        tooltip.style.position = "absolute";
        tooltip.style.top = "0px";
        tooltip.style.padding = "2px 6px";
        tooltip.style.background = "#222";
        tooltip.style.color = "#fff";
        tooltip.style.fontSize = "11px";
        tooltip.style.borderRadius = "4px";
        tooltip.style.pointerEvents = "none";
        tooltip.style.transform = "translate(-50%, -120%)";
        tooltip.style.display = "none"; // erst unsichtbar

        // Tooltip in DOM einfügen
        const sliderWrap = document.createElement("div");
        sliderWrap.style.position = "relative";
        sliderWrap.appendChild(inp);
        sliderWrap.appendChild(tooltip);

        // --- Tooltip Position + Wert aktualisieren ---
        function updateTooltip() {
            const ui = parseFloat(inp.value);
            const val = p.min + Math.pow(ui, exp) * range;

            tooltip.textContent = val.toFixed(3);

            // Position berechnen
            const rect = inp.getBoundingClientRect();
            const percent = ui; // 0–1
            const x = percent * rect.width;

            tooltip.style.left = x + "px";
        }

        // --- Events ---
        inp.oninput = () => {

            const ui = parseFloat(inp.value);
            /*
            console.log("ui", ui);
            console.log("exp", exp);
            console.log("p.value", p.value);
            */
            p.value = p.min + Math.pow(ui, exp) * range;

            tooltip.style.display = "block";
            updateTooltip();
        };

        inp.onmouseenter = () => {
            tooltip.style.display = "block";
            updateTooltip();
        };

        inp.onmouseleave = () => {
            tooltip.style.display = "none";
        };

        wrap.appendChild(label);
        wrap.appendChild(sliderWrap);
    }

    return wrap;
}
function createDualSlider(param) {

    const p = param.range;

    const wrap = document.createElement("div");
    const label = document.createElement("label");
    label.textContent = param.name;


    const slider = document.createElement("div");
    slider.className = "dual-slider";

    const track = document.createElement("div");
    track.className = "track";

    const range = document.createElement("div");
    range.className = "range";

    const thumbMin = document.createElement("div");
    thumbMin.className = "thumb min";

    const thumbMax = document.createElement("div");
    thumbMax.className = "thumb max";

    slider.appendChild(track);
    slider.appendChild(range);
    slider.appendChild(thumbMin);
    slider.appendChild(thumbMax);

    function update() {
        const w = slider.clientWidth;
        const xMin = p.minVal * w;
        const xMax = p.maxVal * w;

        thumbMin.style.left = xMin + "px";
        thumbMax.style.left = xMax + "px";

        range.style.left = xMin + "px";
        range.style.width = (xMax - xMin) + "px";
    }

    function dragThumb(thumb, isMin) {
        function onMove(e) {
            const rect = slider.getBoundingClientRect();
            let x = e.clientX - rect.left;
            x = Math.max(0, Math.min(x, rect.width));
            const v = x / rect.width;

            if (isMin) {
                p.minVal = Math.min(v, p.maxVal - 5e-2);
            } else {
                p.maxVal = Math.max(v, p.minVal + 5e-2);
            }

            update();
        }

        function onUp() {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        }

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    }

    thumbMin.addEventListener("mousedown", () => dragThumb(thumbMin, true));
    thumbMax.addEventListener("mousedown", () => dragThumb(thumbMax, false));

    const ro = new ResizeObserver(() => update());
    ro.observe(slider);
    wrap.appendChild(label);
    wrap.appendChild(slider);
    return wrap;
}
function createAmountKnob(mod) {
    const wrap = document.createElement("div");
    wrap.className = "param-knobs";

    const label = document.createElement("label");
    label.textContent = "Amount";

    const inp = document.createElement("input");
    inp.type = "range";
    inp.min = 0;
    inp.max = 1;
    inp.step = 0.01;
    inp.value = mod.amount;

    inp.oninput = () => {
        mod.amount = parseFloat(inp.value);
    };

    wrap.appendChild(label);
    wrap.appendChild(inp);

    return wrap;
}
function button(text) {
    const btn = document.createElement("button)");
    btn.textContent = text;
    btn.classList.add("button");
    return btn;
}
function renderModUI(paramName) {
    function createModSlotUI(mod, paramName) {
        const div = document.createElement("div");
        div.className = "mod-slot";
        div.style.background = "#555";

        const heading = document.createElement("div");
        const label = document.createElement("label");
        label.textContent = paramName;
        label.style.fontSize = "20px";
        heading.appendChild(label);
        label.style.alignContent = "center";
        div.appendChild(heading);
        heading.style.display = "flex";
        heading.style.justifyContent = "center";
        div.style.gap = "10px";
        // Quelle
        div.appendChild(createSourceSelector(mod, paramName));
        // Source-Parameter
        div.appendChild(createParamKnobs(mod.sourceObj.params));


        // Transform
        div.appendChild(createTransformSelector(mod, paramName));
        // Transform-Parameter
        div.appendChild(createParamKnobs(mod.transformObj.params));

        // Amount
        div.appendChild(createAmountKnob(mod));


        // Mode
        div.appendChild(createModeSelector(mod, paramName));

        return div;
    }
    function createModSlotAddDel(mod, paramName) {
        const div = document.createElement("div");
        div.classList.add("centerdiv");


        const delButton = button("del");
        delButton.addEventListener("click", () => {
            delButton.style.transform = "scale(.95)";
            const index = mods.findIndex(item => item === mod);
            index !== -1 && mods.splice(index, 1);
            mods.length > 0 && renderModUI(paramName);
            mods.length == 0 && document.getElementById("modOverlay").classList.add("hidden");
            mods.length == 0 && document.querySelector(`[data-param="${paramName}"].mod-toggle`)?.classList.remove("active");
        })
        div.append(delButton);
        const addButton = button("add");
        addButton.addEventListener("click", () => {
            console.log("addButton", "");

            addButton.style.transform = "scale(.95)";
            mods.push(makeDefaultModSlot());
            renderModUI(paramName);

        })

        div.append(addButton);
        return div;
    }
    function createBaseModeOptions(knob) {
        const div = document.createElement("div");
        div.innerHTML = "";
        div.style.background = "#456"
        div.style.padding = "20px 20px";
        div.style.borderRadius = "10px"
        const sel = document.createElement("select");

        const base = knob.modulationBase;

        for (const val of Object.values(BaseMode)) {
            const opt = document.createElement("option");
            opt.value = val;
            opt.textContent = val;
            if (knob.mode === val) opt.selected = true;
            sel.appendChild(opt);
        }

        sel.onchange = () => {
            knob.mode = sel.value;
        };

        div.appendChild(sel);

        div.appendChild(createDualSlider({
            name: "range",
            range: {
                min: 0,
                max: 1,
                get minVal() { return knob.min },
                set minVal(v) { knob.min = v },
                get maxVal() { return knob.max },
                set maxVal(v) { knob.max = v },
            }
        }));


        div.appendChild(createParamKnobs({
            smooth: {
                min: -.95,
                max: 0.95,
                exp: false,
                get value() { return knob.smooth },
                set value(v) { knob.smooth = v }
            }
        }));

        return div;
    }
    const container = document.getElementById("modUIContainer");
    container.innerHTML = "";
    const modsDiv = document.createElement("div");
    modsDiv.innerHTML = "";
    modsDiv.classList.add("modsDiv");
    const mods = knobs[paramName].mods;
    console.log("slotanzahl", mods.length);

    for (const mod of mods) {
        modsDiv.appendChild(createModSlotUI(mod, paramName));
        modsDiv.appendChild(createModSlotAddDel(mod, paramName));
    }
    container.append(modsDiv);
    container.appendChild(createBaseModeOptions(knobs[paramName]));
    //container.appendChild()

}
function makeDefaultModSlot() {
    return {
        sourceObj: makeSourceFromName("const"),
        transformObj: makeLinearTransform({ type: "linear", value: 0.0 }),
        mode: ModMode.BASE,
        amount: 1
    };
}
export function openModOverlay(knobName) {
    const overlay = document.getElementById("modOverlay");
    overlay.classList.remove("hidden");
    overlay.dataset.knob = knobName;
    const knob = knobs[knobName];
    const mods = knob.mods;

    // 2) Wenn keine Mods existieren → einen erzeugen
    if (mods.length === 0) {
        mods.push(makeDefaultModSlot());
    }
    knob.modEnabled = true;
    document.querySelector(`[data-param="${knobName}"].mod-toggle`)?.classList.add("active");

    // 3) UI rendern
    renderModUI(knobName);
}
