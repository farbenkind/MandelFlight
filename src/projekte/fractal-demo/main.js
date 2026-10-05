import { createFractalRenderer } from "./fractal-renderer.js";
import { startAudioInput } from "./audio-input.js";
import { createColormapGpu } from "./colormap/colormap-gpu.js";
import { pi, debug, fmod, symExp, log, clamp } from "./util.js";
import { ModMode, BaseMode, ModTransfrom, sliderMod, KnobState, knobs, serializeKnobs, deserializeKnobs } from "./knob-state.js";
import { cmapSections, packCMParams as packParams } from "./colormap/params.js";
import { buildCmapUI } from "./ui/cmap-ui.js";
import { createXlutUI } from "./ui/xlut-ui.js";
import { initKnobs } from "./ui/knob-ui.js";
import { createPresets } from "./presets.js";
import { makeEnv, makeConst, makeOsc1, makeLinearTransform, makePowerTransform, makeSourceFromName } from "./modulation.js";




/////////////


/////////////////  Webgui Settup
const canvas = document.querySelector("canvas");
const adapter = await navigator.gpu.requestAdapter();
const device = await adapter.requestDevice();

const context = canvas.getContext("webgpu");
const format = navigator.gpu.getPreferredCanvasFormat();


context.configure({
    device,
    format,
    alphaMode: "opaque"
});


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////


//            FRACTAL


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////


///////// /// FractalParams - uniforms
const fractalRenderer = createFractalRenderer({ canvas, context, device, format });
const { cmSize, colormapTexture: CMAP_Texture } = fractalRenderer;


//////////////////////////////////////////////////////////////////
// FractalShader
//////////////////////////////////////////////////////////////////

// Fractal rendering, GPU resources, and canvas navigation live in fractal-renderer.js.






















//////////////////////////////////////////////////////////////////////////////////////////////////////////////////


//            C O L O R M A P   -   E D I T O R 


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var editor = false;
var editorAudioReact = true;





const packCMParams = () => packParams(knobs);

buildCmapUI(document.getElementById("cmKnobs"), cmapSections);
initKnobs();

const colormapGpu = createColormapGpu({
    device,
    format,
    colormapTexture: CMAP_Texture,
    cmSize,
    previewCanvas: document.getElementById("cmCanvas"),
    curveCanvas: document.getElementById("curveCanvas"),
    paramCount: packCMParams().length,
});

const xlutUI = createXlutUI({
    root: document.getElementById("xlutBar"),
    cmSize,
    setLut: colormapGpu.setLut,
    onChange: () => colormapGpu.update(packCMParams()),
});


















/////////////////////////////////////////////////////////////////////////////////////
//
//          M O D U L A T I O N   -   M A T R I X 
//
/////////////////////////////////////////////////////////////////////////////////////

/////////////////////////////////////////////////////////////////////////////
//
//               M O D U L A T I O N   -   M A I N L O O P 
//
/////////////////////////////////////////////////////////////////////////////

/*
import init, { ModCore } from "./modcore.js";

let core;
await init();
core = new ModCore();

core.init_params(knobs);

const fastEnv = makeEnv({ attack: .9, decay: .5 });
const slowEnv = makeEnv({ attack: .3, decay: 0.9 });
*/

function updateCMEditor() {
    for (const param in knobs) {

        const knob = knobs[param];

        knob.modEnabled && log("", param);

        let punchSum = 0.0;
        let baseSum = 0.0;
        let baseMod = false;

        for (const mod of knob.mods) {
            const srcVal = mod.sourceObj.update();
            const tVal = mod.transformObj.apply(srcVal);
            const value = tVal * mod.amount;

            switch (mod.mode) {
                case ModMode.BASE:
                    baseSum += value * .1;
                    baseMod = true;
                    break
                case ModMode.PUNCH:
                    punchSum += value;
                    break;
            }
            knob.modEnabled && log("", mod.sourceObj.name);

        }

        /*
        if (!slideMods) knob.slideValue = 0;
        if (!bounceMods) knob.bounceValue = 0;
*/

        if (knob.modEnabled) {
            log("#####", "");
            let liveVal = knob.liveValue;

            if (baseMod) {
                const baseMin = knob.min;
                const baseMax = knob.max;
                const baseRange = baseMax - baseMin;

                const small = baseRange * 1e-6;  // baserange ist nach unten durch die UI(min < max) begrenzt
                const smoothFkt = (x, m) => { return 1 + (knob.smooth) * Math.cos((x - baseMin) * m * pi / (baseMax - baseMin)); };

                switch (knob.mode) {

                    case BaseMode.SLIDE:
                        const smoothS = (liveVal) => smoothFkt(liveVal, 1);
                        liveVal = baseMin + fmod((liveVal - baseMin) + baseSum * smoothS(liveVal), baseRange);
                        break;

                    case BaseMode.BOUNCE:
                        const smoothB = (liveVal) => smoothFkt(liveVal, 2);
                        liveVal = liveVal + baseSum * smoothB(liveVal) * knob.bounceDir;

                        if (liveVal > baseMax) {
                            liveVal = baseMax * (1 - small);
                            knob.bounceDir = -1;
                        }
                        else if (liveVal < baseMin) {
                            liveVal = baseMin * (1 + small);
                            knob.bounceDir = 1;
                        }
                        break;
                }

                knob.liveValue = liveVal;

                // Punch zyklisch im BaseRange
                knob.cmValue = baseMin + fmod((liveVal - baseMin) + punchSum * knob.bounceDir, baseRange);
            }

            else {
                // Punch-only: clamp
                knob.cmValue = clamp(knob.liveValue + punchSum, 0, 1);
            }

            if (!knob.knobPressed) {
                const v = liveVal;
                const knob = document.querySelector(`.knob[data-param="${param}"]`);
                const angle = v * 270 - 135;      // -135° bis +135°
                knob.style.transform = `rotate(${angle}deg)`;
                knob.style.setProperty("--needle-angle", angle + "deg");

            }
        }
    }

    // 6. GPU-Pipeline aktualisieren
    colormapGpu.update(packCMParams());
    fractalRenderer.runCompute();

}




startAudioInput(({ bass, mid, tre }) => {
    window.bassBeat = bass;
    window.midBeat = mid;
    window.treBeat = tre;
    log("bassBeat", bass);
    updateCMEditor();
    debug.on = false;
}).catch((error) => {
    console.error("Audio input could not be started:", error);
});


///////////////////////////////////////////////////////////
//
//          PRESETS
//
///////////////////////////////////////////////////////////

const presets = createPresets({ fractalRenderer, packCMParams, xlutUI });














/*
setInterval(() => {
    if (editor && !editorAudioReact) return;
    updateAudio();
    //applyModulation();
    //updatePalette();
    updateCMEditor();
}, 25); // 40 Hz
*/

function frame() {
    fractalRenderer.render();        // smooth 60–144 Hz
    requestAnimationFrame(frame);
}
function saveView() {
    localStorage.setItem("fractalView", JSON.stringify(fractalRenderer.getView()));
}
function loadView() {
    const view = JSON.parse(localStorage.getItem("fractalView"));
    if (!view) return;

    fractalRenderer.setView({ ...view, maxIter: 1000 });
}

const editorOverlay = document.getElementById("cmOverlay");
const editorCSS = document.getElementById("editorCSS");

const keypressed = {
    'a': false,
}

window.addEventListener("keyup", ev => {

    keypressed[ev.key] = false;
});



window.addEventListener("keydown", ev => {
    if (presets.isOpen()) return;
    if (ev.key === "s") presets.openSave();
    if (ev.key === "l") presets.openLoad();
    if (ev.key === "e") {
        editorOverlay.classList.toggle("hidden");
    }
    if (ev.key === " ") {
        editor ^= 1;
        editorAudioReact ^= 1;
    }
    if (ev.key === "d") {
        debug.on = true;
    }
    if (ev.key === "Escape") {
        document.getElementById("modOverlay").classList.add("hidden");
    }
});

/*
document.querySelectorAll("button").forEach(b => {
    b.classList.add("button");
});
*/

console.log("knobs:", knobs);
console.log("cmParams initial:", packCMParams());

colormapGpu.update(packCMParams());
fractalRenderer.runCompute();      // Fraktal einmal initial berechnen
fractalRenderer.render();          // und anzeigen

loadView();
//overlay.classList.toggle("hidden");
//document.querySelector('.mod-toggle[data-param="pow-b"]').click();
//document.querySelector('.mod-toggle[data-param="phaseShift"]').click();
//openModOverlay("phaseShift");
frame();
