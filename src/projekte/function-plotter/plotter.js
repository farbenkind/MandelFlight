import { functions } from "./functions.js";

const SAMPLES = 512;
const PAD = 36;

const canvas = document.getElementById("plot");
const ctx = canvas.getContext("2d");
const select = document.getElementById("fnSelect");
const knobEl = document.getElementById("knob");
const knobLabel = document.getElementById("knobLabel");
const readout = document.getElementById("readout");

const clamp = v => Math.min(1, Math.max(0, v));

let fn = functions[0];
let k = fn.init;
let hoverX = null;

functions.forEach((f, i) => {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = f.label;
    select.appendChild(o);
});

// Einheitsquadrat (0,0)-(1,1) -> Pixel; y zeigt nach oben
const size = () => canvas.width - 2 * PAD;
const px = x => PAD + x * size();
const py = y => canvas.height - PAD - y * size();

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

    // Diagonale als Referenz
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "#456";
    ctx.beginPath();
    ctx.moveTo(px(0), py(0)); ctx.lineTo(px(1), py(1));
    ctx.stroke();
    ctx.setLineDash([]);

    // Werte ausserhalb von 0..1 werden am Quadrat abgeschnitten
    ctx.save();
    ctx.beginPath();
    ctx.rect(px(0), py(1), size(), size());
    ctx.clip();
    ctx.strokeStyle = "#ff5a5a";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= SAMPLES; i++) {
        const x = i / SAMPLES;
        const X = px(x), Y = py(fn.f(x, k));
        i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    }
    ctx.stroke();
    ctx.restore();

    if (hoverX !== null) {
        const y = fn.f(hoverX, k);
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(px(hoverX), py(clamp(y)), 4, 0, Math.PI * 2);
        ctx.fill();
        readout.textContent = `x = ${hoverX.toFixed(3)}   f(x) = ${y.toFixed(3)}   k = ${k.toFixed(3)}`;
    } else {
        readout.textContent = `k = ${k.toFixed(3)}`;
    }
}

function setKnob(v) {
    k = clamp(v);
    knobEl.style.transform = `rotate(${k * 270 - 135}deg)`;
    draw();
}

function setFunction(i) {
    fn = functions[i];
    knobLabel.textContent = fn.knobLabel;
    setKnob(fn.init);
}

let dragging = false;
knobEl.addEventListener("pointerdown", ev => { dragging = true; knobEl.setPointerCapture(ev.pointerId); });
knobEl.addEventListener("pointerup", () => { dragging = false; });
knobEl.addEventListener("pointermove", ev => { if (dragging) setKnob(k + ev.movementY * -0.005); });
knobEl.addEventListener("dblclick", () => setKnob(fn.init));
knobEl.addEventListener("wheel", ev => { ev.preventDefault(); setKnob(k - Math.sign(ev.deltaY) * 0.01); }, { passive: false });

canvas.addEventListener("pointermove", ev => {
    const r = canvas.getBoundingClientRect();
    const cx = (ev.clientX - r.left) * (canvas.width / r.width);
    hoverX = clamp((cx - PAD) / size());
    draw();
});
canvas.addEventListener("pointerleave", () => { hoverX = null; draw(); });

select.addEventListener("change", () => setFunction(+select.value));

setFunction(0);
