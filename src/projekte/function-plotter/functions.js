// JS-Ports der WGSL-Hilfsfunktionen aus fractal-demo/colormap/cmap-compute.wgsl.
// Jede Funktion bildet x in [0,1] mit einem Knob k in [0,1] auf einen Wert ab.
// Neue Funktionen: einfach einen Eintrag in `functions` ergaenzen.

const pi2 = Math.PI * 2;
const clamp01 = v => Math.min(1, Math.max(0, v));
const logb = (x, base) => Math.log(x) / Math.log(base);

function sympowknob(base, knob, mult) {
    let e = Math.pow(knob, logb(mult, 2)) * mult;
    if (e < 1) {
        e = Math.pow(knob, logb(mult / 100, 2)) * mult / 100;
        return 1 - Math.pow(1 - base, 1 / e);
    }
    return Math.pow(base, e);
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
        f: (x, k) => sympowknob(clamp01(x), Math.max(k, 0.001), 100),
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
