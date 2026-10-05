// JS-Ports der WGSL-Hilfsfunktionen aus fractal-demo/colormap/cmap-compute.wgsl.
// Jede Funktion bildet x in [0,1] mit einem Knob k in [0,1] auf einen Wert ab.
// Neue Funktionen: einfach einen Eintrag in `functions` ergaenzen.

const pi2 = Math.PI * 2;
const clamp01 = v => Math.min(1, Math.max(0, v));
const logb = (x, base) => Math.log(x) / Math.log(base);

// Exponent laeuft exponentiell von 1/mult (knob=0) ueber 1 (knob=0.5) bis mult (knob=1)
function spk(base, knob, mult) {
    return Math.pow(base, Math.pow(mult, (knob - 0.5) * 2));
}
function powerWave(t, shape) {
    const c = 0.5 + 0.5 * Math.cos(t);
    if (shape > 0.5) return Math.pow(c, 1 + (shape - 0.5) * 50);
    return 1 - Math.pow(1 - c, 1 + (0.5 - shape) * 50);
}

function shapeWave(t, shape) {
    const s = Math.max(0.001, shape * 20);
    return 0.5 + 0.5 * Math.tanh(Math.cos(t) * s);
}

export const functions = [
    {
        id: "sympow",
        label: "sympow (Shape-Knob)",
        knobLabel: "Shape",
        init: 0.5,
        f: (x, k) => spk(clamp01(x), k, 100),
    },
    {
        id: "powerWave",
        label: "powerWave (1 Periode)",
        knobLabel: "Shape",
        init: 0.5,
        f: (x, k) => powerWave(x * pi2, k),
    },
    {
        id: "shapeWave",
        label: "shapeWave (1 Periode)",
        knobLabel: "Shape",
        init: 0.5,
        f: (x, k) => shapeWave(x * pi2, k),
    },
    {
        id: "mixWave",
        label: "mix(x, cos-Welle, k)",
        knobLabel: "Mix",
        init: 0.5,
        f: (x, k) => {
            const wave = 0.5 + 0.5 * Math.cos(x * 2 * pi2);
            return x + (wave - x) * k;
        },
    },
    {
        id: "identity",
        label: "x (Identitaet)",
        knobLabel: "-",
        init: 0.5,
        f: x => x,
    },
];

// Berechnet eine gespeicherte Kette ([{fn, k}]) als Tabelle mit n Werten fuer x = i/n.
// Wird von der Demo als xCmap-LUT genutzt.
export function bakeChain(stages, n) {
    const chain = stages.map(s => ({ fn: functions.find(f => f.id === s.fn), k: s.k })).filter(s => s.fn);
    const lut = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        let v = i / n;
        for (const s of chain) v = Math.min(1, Math.max(0, s.fn.f(Math.min(1, Math.max(0, v)), s.k)));
        lut[i] = v;
    }
    return lut;
}
