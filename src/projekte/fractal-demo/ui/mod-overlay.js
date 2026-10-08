import { knobs, ModMode, BaseMode } from "../knob-state.js";
import { sourceRegistry, transformRegistry, createSource, createTransform, makeLinearTransform } from "../modulation.js";
import { createParamControls } from "./param-controls.js";

document.getElementById("modClose").addEventListener("mousedown", event => event.stopPropagation());
document.getElementById("modClose").addEventListener("click", () => {
    document.getElementById("modOverlay").classList.add("hidden");
});

function button(text, onClick) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "button";
    element.textContent = text;
    element.addEventListener("click", onClick);
    return element;
}

function section(title, ...children) {
    const element = document.createElement("section");
    element.className = "mod-section";
    const heading = document.createElement("h3");
    heading.textContent = title;
    for (const child of children) {
        if (child.tagName === "SELECT") child.setAttribute("aria-label", title);
    }
    element.append(heading, ...children);
    return element;
}

function selector(entries, value, onChange) {
    const select = document.createElement("select");
    for (const [name, entry] of entries) {
        select.append(new Option(entry.label ?? name, name));
    }
    select.value = value;
    select.addEventListener("change", () => onChange(select.value));
    return select;
}

function createSourceSelector(mod, paramName) {
    const select = document.createElement("select");
    const groups = new Map();
    for (const [name, entry] of sourceRegistry) {
        const category = entry.category ?? "Source";
        if (!groups.has(category)) {
            const group = document.createElement("optgroup");
            group.label = category;
            groups.set(category, group);
            select.append(group);
        }
        groups.get(category).append(new Option(entry.label ?? name, name));
    }
    select.value = mod.sourceObj.name;
    select.addEventListener("change", () => {
        mod.sourceObj = createSource(select.value);
        renderModUI(paramName);
    });
    return select;
}

function createRangeControls(knob) {
    const wrap = document.createElement("div");
    wrap.className = "param-controls";
    const inputs = [];
    const outputs = [];
    for (const [index, title] of ["Range Min", "Range Max"].entries()) {
        const label = document.createElement("label");
        label.className = "param-control";
        const heading = document.createElement("span");
        heading.className = "param-control-heading";
        const text = document.createElement("span");
        text.textContent = title;
        const output = document.createElement("output");
        const input = document.createElement("input");
        input.type = "range";
        input.min = 0;
        input.max = 1;
        input.step = 0.005;
        input.addEventListener("input", () => {
            if (index === 0) knob.min = Math.max(0, Math.min(Number(input.value), knob.max - 0.05));
            else knob.max = Math.min(1, Math.max(Number(input.value), knob.min + 0.05));
            update();
        });
        inputs.push(input);
        outputs.push(output);
        heading.append(text, output);
        label.append(heading, input);
        wrap.append(label);
    }
    function update() {
        [knob.min, knob.max].forEach((value, index) => {
            inputs[index].value = value;
            outputs[index].textContent = value.toFixed(3);
        });
    }
    update();
    return wrap;
}

function renderModUI(paramName) {
    const knob = knobs[paramName];
    const content = document.getElementById("modContent");
    content.replaceChildren();

    knob.mods.forEach((mod, index) => {
        const card = document.createElement("article");
        card.className = "mod-slot";
        const header = document.createElement("div");
        header.className = "mod-slot-heading";
        const title = document.createElement("h2");
        title.textContent = `Modulation ${index + 1}`;
        const remove = button("Entfernen", () => {
            knob.mods.splice(knob.mods.indexOf(mod), 1);
            if (!knob.mods.length) {
                knob.modEnabled = false;
                document.querySelector(`.mod-toggle[data-param="${paramName}"]`)?.classList.remove("active");
            }
            renderModUI(paramName);
        });
        remove.classList.add("mod-remove");
        header.append(title, remove);
        card.append(
            header,
            section("Signal", createSourceSelector(mod, paramName), createParamControls(mod.sourceObj.params)),
            section("Transform", selector(transformRegistry, mod.transformObj.name, name => {
                mod.transformObj = createTransform(name, transformRegistry.get(name).initialParams);
                renderModUI(paramName);
            }), createParamControls(mod.transformObj.params)),
            section("Amount", createParamControls({
                amount: {
                    ui: "slider", label: "Amount", min: 0, max: 1, step: 0.01,
                    get value() { return mod.amount; },
                    set value(value) { mod.amount = value; },
                },
            })),
            section("Mode", selector(
                Object.values(ModMode).map(name => [name, { label: name }]),
                mod.mode, name => { mod.mode = name; }
            )),
        );
        content.append(card);
    });
    const add = button("+ Modulation", () => {
        knob.mods.push(makeDefaultModSlot());
        knob.modEnabled = true;
        document.querySelector(`.mod-toggle[data-param="${paramName}"]`)?.classList.add("active");
        renderModUI(paramName);
    });
    add.classList.add("mod-add");
    content.append(add);

    const base = document.getElementById("baseModeOptions");
    base.replaceChildren(section("Base-Einstellungen",
        selector(Object.values(BaseMode).map(name => [name, { label: name }]),
            knob.mode, name => { knob.mode = name; }),
        createRangeControls(knob),
        createParamControls({
            smooth: {
                ui: "slider", min: -0.95, max: 0.95, exp: false,
                get value() { return knob.smooth; },
                set value(value) { knob.smooth = value; },
            },
        }),
    ));

    document.getElementById("modTitle").textContent = paramName;
}

function makeDefaultModSlot() {
    return {
        sourceObj: createSource("const"),
        transformObj: makeLinearTransform({}),
        mode: ModMode.BASE,
        amount: 1,
    };
}

export function openModOverlay(knobName) {
    const overlay = document.getElementById("modOverlay");
    overlay.classList.remove("hidden");
    overlay.dataset.knob = knobName;
    const knob = knobs[knobName];
    if (!knob.mods.length) knob.mods.push(makeDefaultModSlot());
    knob.modEnabled = true;
    document.querySelector(`.mod-toggle[data-param="${knobName}"]`)?.classList.add("active");
    const pos = JSON.parse(localStorage.getItem("modOverlayPos"));
    if (pos) {
        const panel = document.getElementById("modUIContainer");
        panel.style.left = pos.left;
        panel.style.top = pos.top;
    }
    renderModUI(knobName);
}
