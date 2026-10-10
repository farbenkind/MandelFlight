import { createFractalRenderer } from "./fractal-renderer.js";
import { initializeGraphics } from "./gpu-startup.js";
import { startAudioInput } from "./audio-input.js";
import { createAudioReactControl, handleAudioReactShortcut } from "./audio-react-control.js";
import { createColormapGpu } from "./colormap/colormap-gpu.js";
import { debug, makeDraggable } from "./util.js";
import { KnobState, knobs, serializeKnobs, deserializeKnobs } from "./knob-state.js";
import { cmapSections, cmapParams, packCMParams as packParams } from "./colormap/params.js";
import { buildCmapUI } from "./ui/cmap-ui.js";
import { updateKnobVisual } from "./ui/knob-visual.js";
import { createXlutUI } from "./ui/xlut-ui.js";
import { applyModulations } from "./modulation-engine.js";
import { createSourceContext } from "./modulation.js";
import { createModulationRuntime } from "./modulation-runtime.js";
import { createCommunitySession } from "./community-session.js";
import { signIn as communitySignIn, signOut as communitySignOut } from "./community-auth.js";
import { getLandingPreset, setLandingPreset } from "./landing-preset-store.js";
import { readVisualizationPreset } from "./preset-format.js";
import { capturePresetThumbnail } from "./preset-thumbnail.js";
import { supabase } from "./supabase-client.js";

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
const { device, context, format } = await initializeGraphics(canvas);


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

const modulationRuntime = createModulationRuntime();

function updateCMEditor(signals) {
    applyModulations(knobs, { sourceContext: createSourceContext(modulationRuntime.next(signals)) });
    refreshCMEditor();
}

const audioReact = isEditor
    ? createAudioReactControl(document.getElementById("audioReactBtn"), updateCMEditor)
    : null;



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
        audioReact.update({
            bassBeat: bass, midBeat: mid, treBeat: tre, bpm,
            beatPhase: beat_phase, beatPosition: beat_position, beatConfidence: confidence,
        });
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

const communitySession = isEditor
    ? createCommunitySession({
        client: supabase,
        onError: error => console.error("Community-Session:", error),
    })
    : null;

const presets = isEditor
    ? (await import("./presets.js")).createPresets({
        fractalRenderer, packCMParams, xlutUI,
        captureThumbnail: () => {
            refreshCMEditor();
            fractalRenderer.render();
            return capturePresetThumbnail(canvas);
        },
        communitySession,
        onSignIn: () => communitySignIn("github"),
        onSignOut: communitySignOut,
        onSetLandingPreset: presetData => setLandingPreset(presetData, supabase),
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
        getSession: () => communitySession.getSession(),
    });
}














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
    if (handleAudioReactShortcut(ev, audioReact,
        presets.isOpen() || !document.getElementById("modOverlay").classList.contains("hidden")
        || !document.getElementById("problemPopup").classList.contains("hidden"))) return;
    if (presets.isOpen()) return;
    if (ev.target.closest("input, select, textarea, button") || ev.target.isContentEditable) return;
    if (ev.key === "s") presets.openSave();
    if (ev.key === "l") presets.openLoad();
    if (ev.key === "e") {
        editorOverlay.classList.toggle("hidden");
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

async function loadLandingPreset() {
    if (!supabase) return false;
    try {
        const preset = await getLandingPreset(supabase);
        if (!preset) return false;
        const data = readVisualizationPreset(preset);
        fractalRenderer.setView(data.view);
        Object.assign(knobs, deserializeKnobs(data.knobs, cmapParams));
        xlutUI.setChains(data.xlut, false);
        return true;
    } catch (error) {
        console.error("Willkommensvisual konnte nicht geladen werden:", error);
        return false;
    }
}

if (!launchState?.fractalParams) {
    loadView();
    const landingPresetLoaded = await loadLandingPreset();
    if (isEditor && !landingPresetLoaded) await presets.loadDefault();
}
refreshCMEditor();
fractalRenderer.render();
//overlay.classList.toggle("hidden");
//document.querySelector('.mod-toggle[data-param="pow-b"]').click();
//document.querySelector('.mod-toggle[data-param="phaseShift"]').click();
//openModOverlay("phaseShift");
frame();
