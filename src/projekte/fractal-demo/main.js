import { createFractalRenderer } from "./fractal-renderer.js";
import { startAudioInput } from "./audio-input.js";
import { createColormapGpu } from "./colormap/colormap-gpu.js";
import { pi, debug, fmod, symExp, log, clamp } from "./util.js";
import { ModMode, BaseMode, ModTransfrom, sliderMod, KnobState, knobs, serializeKnobs, deserializeKnobs } from "./knob-state.js";
import { cmapSections, cmapParams, packCMParams as packParams } from "./colormap/params.js";
import { buildCmapUI } from "./ui/cmap-ui.js";
import { updateKnobVisual } from "./ui/knob-visual.js";
import { createXlutUI } from "./ui/xlut-ui.js";
import { makeDraggable } from "./util.js";
import { makeEnv, makeConst, makeOsc1, makeLinearTransform, makePowerTransform, makeSourceFromName, createSourceContext } from "./modulation.js";

const isEditor = Boolean(document.getElementById("cmKnobs"));
const launchToken = new URLSearchParams(window.location.hash.slice(1)).get("state");
const launchStateKey = launchToken ? `fractalFullscreenState:${launchToken}` : null;
const fullscreenChannels = new Set();
let fullscreenChannel = null;
let launchState = null;
if (launchStateKey) {
    const serializedState = localStorage.getItem(launchStateKey);
    if (serializedState) launchState = JSON.parse(serializedState);
    localStorage.removeItem(launchStateKey);
    history.replaceState(null, "", window.location.pathname + window.location.search);
}



/////////////


/////////////////  Webgui Settup
const canvas = document.getElementById("fractalCanvas");
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
const fractalRenderer = createFractalRenderer({ canvas, context, device, format, onViewChange: broadcastView });
const { cmSize, colormapTexture: CMAP_Texture } = fractalRenderer;
if (launchState?.fractalParams) fractalRenderer.setView(launchState.fractalParams);


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

function getSharedState() {
    return {
        fractalParams: fractalRenderer.getView(),
        knobs: serializeKnobs(knobs),
        xlut: xlutUI.getChains(),
    };
}

function broadcastSharedState() {
    if (!isEditor) return;
    const { fractalParams, ...state } = getSharedState();
    const message = { type: "state", state };
    for (const channel of fullscreenChannels) channel.postMessage(message);
}

function broadcastView(view) {
    const message = { type: "view", fractalParams: view };
    if (isEditor) {
        for (const channel of fullscreenChannels) channel.postMessage(message);
    } else {
        fullscreenChannel?.postMessage(message);
    }
}

if (isEditor) {
    buildCmapUI(document.getElementById("cmKnobs"), cmapSections);
    const { initKnobs } = await import("./ui/knob-ui.js");
    initKnobs({ onChange: refreshCMEditor });
} else {
    for (const param of cmapParams) knobs[param.id] = new KnobState(param.init);
}
if (launchState?.knobs) Object.assign(knobs, deserializeKnobs(launchState.knobs, cmapParams));

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
    onChange: refreshCMEditor,
});
if (launchState?.xlut) xlutUI.setChains(launchState.xlut, false);

function initModWindow() {

    makeDraggable(
        document.getElementById("modUIContainer"),
        document.getElementById("modHeader")
    );
}
if (isEditor) initModWindow();





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

function refreshCMEditor() {
    if (isEditor) {
        document.querySelectorAll(".knob").forEach(element => {
            const state = knobs[element.dataset.param];
            updateKnobVisual(element, state, { rotate: !state.knobPressed });
        });
    }
    colormapGpu.update(packCMParams());
    fractalRenderer.runCompute();
    broadcastSharedState();
}

function updateCMEditor() {
    const sourceContext = createSourceContext();
    for (const param in knobs) {

        const knob = knobs[param];

        knob.modEnabled && log("", param);

        let punchSum = 0.0;
        let baseSum = 0.0;
        let baseMod = false;

        for (const mod of knob.mods) {
            const srcVal = sourceContext.evaluate(mod.sourceObj);
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
        }
    }

    // 6. GPU-Pipeline aktualisieren
    refreshCMEditor();

}




if (isEditor) {
    startAudioInput(({ bass, mid, tre, bpm, beat_phase, beat_position, confidence }) => {
        window.bassBeat = bass;
        window.midBeat = mid;
        window.treBeat = tre;
        window.bpm = bpm;
        window.beatPhase = beat_phase;
        window.beatPosition = beat_position;
        window.beatConfidence = confidence;
        console.log(
            bpm.toFixed(1),
            beat_phase.toFixed(2)
        );
        updateCMEditor();
        debug.on = false;
    }).catch((error) => {
        console.error("Audio input could not be started:", error);
    });
}


///////////////////////////////////////////////////////////
//
//          PRESETS
//
///////////////////////////////////////////////////////////

const presets = isEditor
    ? (await import("./presets.js")).createPresets({
        fractalRenderer, packCMParams, xlutUI,
        onChange: () => {
            broadcastView(fractalRenderer.getView());
            refreshCMEditor();
        },
    })
    : null;

if (isEditor) {
    const { createProblemReport } = await import("./problem-report.js");
    createProblemReport({
        getCurrentPresetId: () => presets.getCurrentPresetId(),
        getSession: () => presets.getSession(),
    });
}













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

if (!isEditor && launchToken) {
    const channel = new BroadcastChannel(`mandelflight-fullscreen:${launchToken}`);
    fullscreenChannel = channel;
    channel.addEventListener("message", (event) => {
        if (event.data?.type === "view") {
            fractalRenderer.setView(event.data.fractalParams);
            return;
        }
        if (event.data?.type !== "state") return;
        const state = event.data.state;
        if (state.fractalParams) fractalRenderer.setView(state.fractalParams);
        Object.assign(knobs, deserializeKnobs(state.knobs, cmapParams));
        xlutUI.setChains(state.xlut, false);
    });
    channel.postMessage({ type: "ready" });
    window.addEventListener("pagehide", () => channel.postMessage({ type: "closed" }), { once: true });
}

const editorOverlay = document.getElementById("cmOverlay");
const editorCSS = document.getElementById("editorCSS");

document.getElementById("fullscreenBtn")?.addEventListener("click", () => {
    const token = crypto.randomUUID();
    const channel = new BroadcastChannel(`mandelflight-fullscreen:${token}`);
    channel.addEventListener("message", (event) => {
        if (event.data?.type === "view") {
            fractalRenderer.setView(event.data.fractalParams);
            broadcastView(fractalRenderer.getView());
        }
        if (event.data?.type === "ready") channel.postMessage({ type: "state", state: getSharedState() });
        if (event.data?.type === "closed") {
            channel.close();
            fullscreenChannels.delete(channel);
        }
    });
    fullscreenChannels.add(channel);
    localStorage.setItem(`fractalFullscreenState:${token}`, JSON.stringify(getSharedState()));
    window.open(`/src/projekte/fractal-demo/fullscreen.html#state=${token}`, "_blank");
});

const keypressed = {
    'a': false,
}

window.addEventListener("keyup", ev => {

    keypressed[ev.key] = false;
});



window.addEventListener("keydown", ev => {
    if (!isEditor) return;
    if (presets.isOpen()) return;
    if (ev.target.closest("input, select, textarea, button") || ev.target.isContentEditable) return;
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

refreshCMEditor();
fractalRenderer.render();          // und anzeigen

if (!launchState?.fractalParams) loadView();
if (isEditor && !launchState) await presets.loadDefault();
//overlay.classList.toggle("hidden");
//document.querySelector('.mod-toggle[data-param="pow-b"]').click();
//document.querySelector('.mod-toggle[data-param="phaseShift"]').click();
//openModOverlay("phaseShift");
frame();
