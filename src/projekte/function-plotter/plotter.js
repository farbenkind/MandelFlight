import { functions } from "./functions.js";

const SAMPLES = 512;
const PAD = 36;
const COLORS = ["#ffd24a", "#6aff8a", "#b48aff", "#ff8ad8", "#8ae6ff"];

const canvas = document.getElementById("plot");
const ctx = canvas.getContext("2d");
const stagesEl = document.getElementById("stages");
const readout = document.getElementById("readout");
const showSteps = document.getElementById("showSteps");

const clamp = v => Math.min(1, Math.max(0, v));

// Kette: x -> stage[0] -> stage[1] -> ...; zwischen den Stufen wird auf 0..1 geklemmt (wie xwarp im Shader)
const stages = [];
let hoverX = null;

const size = () => canvas.width - 2 * PAD;
const px = x => PAD + x * size();
const py = y => canvas.height - PAD - y * size();

// Liefert die Werte nach jeder Stufe
function evalChain(x) {
    const out = [];
    let v = x;
    for (const s of stages) {
        v = s.fn.f(clamp(v), s.k);
        out.push(v);
    }
    return out;
}

function strokeCurve(pick, color, width, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i <= SAMPLES; i++) {
        const x = i / SAMPLES;
        const X = px(x), Y = py(pick(evalChain(x)));
        i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#233";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#789";
    ctx.font = "12px sans-serif";
    for (let i = 0; i <= 4; i++) {
        const v = i / 4;
        ctx.beginPath();
        ctx.moveTo(px(v), py(0)); ctx.lineTo(px(v), py(1));
        ctx.moveTo(px(0), py(v)); ctx.lineTo(px(1), py(v));
        ctx.stroke();
        ctx.fillText(v, px(v) - 6, py(0) + 16);
        ctx.fillText(v, px(0) - 28, py(v) + 4);
    }

    ctx.strokeStyle = "#0abaff";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px(0), py(1), size(), size());

    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "#456";
    ctx.beginPath();
    ctx.moveTo(px(0), py(0)); ctx.lineTo(px(1), py(1));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.save();
    ctx.beginPath();
    ctx.rect(px(0), py(1), size(), size());
    ctx.clip();

    if (showSteps.checked) {
        for (let i = 0; i < stages.length - 1; i++) {
            strokeCurve(v => v[i], COLORS[i % COLORS.length], 1.5, 0.55);
        }
    }
    if (stages.length) strokeCurve(v => v[v.length - 1], "#ff5a5a", 2.5);
    ctx.restore();

    if (hoverX !== null && stages.length) {
        const vals = evalChain(hoverX);
        const y = vals[vals.length - 1];
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(px(hoverX), py(clamp(y)), 4, 0, Math.PI * 2);
        ctx.fill();
        readout.textContent = `x = ${hoverX.toFixed(3)}  ->  ` + vals.map(v => v.toFixed(3)).join("  ->  ");
    } else {
        readout.textContent = "";
    }
}

function makeKnob(stage) {
    const wrap = document.createElement("div");
    wrap.className = "knob-wrap";
    const knob = document.createElement("div");
    knob.className = "knob";
    const val = document.createElement("div");
    val.className = "knob-val";
    wrap.append(knob, val);

    const update = () => {
        knob.style.transform = `rotate(${stage.k * 270 - 135}deg)`;
        val.textContent = `${stage.fn.knobLabel} ${stage.k.toFixed(2)}`;
    };
    const set = v => { stage.k = clamp(v); update(); draw(); };

    let dragging = false;
    knob.addEventListener("pointerdown", ev => { dragging = true; knob.setPointerCapture(ev.pointerId); });
    knob.addEventListener("pointerup", () => { dragging = false; });
    knob.addEventListener("pointermove", ev => { if (dragging) set(stage.k + ev.movementY * -0.005); });
    knob.addEventListener("dblclick", () => set(stage.fn.init));
    knob.addEventListener("wheel", ev => { ev.preventDefault(); set(stage.k - Math.sign(ev.deltaY) * 0.01); }, { passive: false });

    update();
    return { wrap, update };
}

function renderStages() {
    stagesEl.innerHTML = "";
    stages.forEach((stage, i) => {
        const row = document.createElement("div");
        row.className = "stage";
        row.style.borderColor = i === stages.length - 1 ? "#ff5a5a" : COLORS[i % COLORS.length];

        const title = document.createElement("div");
        title.className = "stage-title";
        title.textContent = `Stufe ${i + 1}`;

        const select = document.createElement("select");
        functions.forEach((f, idx) => {
            const o = document.createElement("option");
            o.value = idx;
            o.textContent = f.label;
            select.appendChild(o);
        });
        select.value = functions.indexOf(stage.fn);

        const knob = makeKnob(stage);
        select.addEventListener("change", () => {
            stage.fn = functions[+select.value];
            stage.k = stage.fn.init;
            knob.update();
            draw();
        });

        const del = document.createElement("button");
        del.textContent = "x";
        del.title = "Stufe entfernen";
        del.addEventListener("click", () => { stages.splice(i, 1); renderStages(); draw(); });

        row.append(title, select, knob.wrap, del);
        stagesEl.appendChild(row);
    });
}

function addStage(fn = functions[0]) {
    stages.push({ fn, k: fn.init });
    renderStages();
    draw();
}

document.getElementById("addStage").addEventListener("click", () => addStage(functions[0]));
showSteps.addEventListener("change", draw);

canvas.addEventListener("pointermove", ev => {
    const r = canvas.getBoundingClientRect();
    hoverX = clamp(((ev.clientX - r.left) * (canvas.width / r.width) - PAD) / size());
    draw();
});
canvas.addEventListener("pointerleave", () => { hoverX = null; draw(); });

addStage(functions[0]);
