# MandelFlight

MandelFlight is an interactive workspace for experimenting with fractals, color,
audio-reactive visuals, shaders, and mathematical transformations. The first
prototype is the fractal demo from the `farbenkind/my-website` repository.

## Run locally

Install [Node.js](https://nodejs.org/) and npm, then run:

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite. The demo is available at the root URL and at
`/projekte/fractal-demo`.

On Windows, `npm run dev` also builds ModCore once on startup and watches
`src/projekte/fractal-demo/modcore/src/*.rs` (including subdirectories),
`Cargo.toml` and `Cargo.lock`. Requires Rust and `wasm-pack` on PATH.
After a successful build, `modcore.js` and `modcore_bg.wasm` are copied from
`modcore/pkg` into the demo and Vite reloads connected browsers.
Compiler errors appear in the terminal; failed builds do not trigger a reload.
Watch builds skip the additional `wasm-opt` step but retain Cargo release
optimizations. A Windows mutex serializes build and copy steps across dev
servers and manual builds. Run only one dev server to avoid duplicate work.
For a one-off WASM build, run `npm run wasm:build`.

Audio analysis uses the actual AudioContext sample rate. Bass-onset beat
tracking uses threshold hysteresis and a 200 ms refractory period; rejected
short triggers do not reset the beat clock. The first valid interval sets BPM
directly, up to eight accepted intervals are averaged and smoothed to reduce
FFT-block timing jitter, and pauses over two seconds restart
interval measurement. This is a bass-onset estimator, not a full musical
tempo tracker: off-beat bass notes can still affect the estimate.
`BeatData.confidence` (0-1) measures interval regularity, evidence (up to eight
intervals) and freshness, not the probability of correct musical tempo.
JS exposes it as `window.beatConfidence`; it does not gate modulation.
The registry sources `beatPhase`, `beatSaw`, `beatTri`, `beatPulse` (50% duty)
and `beatSin` use only `window.beatPhase`. All are unipolar (0-1); Saw starts
at 0, Tri/Sin peak at phase 0.5, Pulse is high for the first half-cycle.
They have no independent oscillator state or frequency parameters.

## Project structure

- `src/projekte/fractal-demo/` contains the interactive demo and its Rust/WASM
  renderer source.
- `src/projekte/fractal-demo/fullscreen.html` runs the same fractal renderer
  without editor controls; use the editor's Fullscreen button to open the
  current view and colormap state in a new tab.
- `LICENSE` contains the GNU GPL v3 license accompanying the source project.
- `src/projekte/function-plotter/` is the function-chain plotter (local only).
- `functions/api/presets/` is the preset API (Cloudflare Pages Function + KV).

## Server-side presets (Cloudflare Pages)

Modulation controls are declared in each source/transform's `params`:
`ui: "slider"` uses `min`, `max`, optional `exp` and a normalized UI `step`;
`ui: "select"` uses `options` (values or `{label, value}` objects);
`ui: "checkbox"` uses a boolean `value`. All controls edit `param.value`.
Add implemented factories to `sourceRegistry`/`transformRegistry` in
`modulation.js`; the overlay lists them without source-specific branches.
Presets store parameter values only and can still read legacy parameter
objects. Definitions always come from the current factory. Unsupported sources
or invalid preset values produce errors rather than a substitute signal.
Source input parameters use `sourceInputParam("bassBeat")`: a select with
`reference: "source"` and live registry options. Processor `update(context)`
reads an input through `context.input(this, "source")`. `makeEnv` accepts a
source name (or its legacy callback); existing Env presets default to their
original band when no source parameter is stored.
Each modulation tick uses one `createSourceContext()`. It evaluates each
instance once, retains input instances across ticks, and reports cyclic or
unknown references. Input names refer to registry factories, not existing
modulation slots; each processor owns its input instances. Nested input
configuration and a graph editor are not part of this step.

The miscCmap HueShift knob rotates the final PrimCmap RGB color in HSV space
on the GPU, preserving HSV saturation and value (not perceptual luminance).
Its 0-1 range represents a full turn: 0 and 1 are neutral, 0.5 is 180 degrees.
The existing knob modulation and preset storage also apply to HueShift.

Live: https://mandelflight.pages.dev (Pages project mandelflight, KV binding PRESETS is set in `wrangler.toml`).

Local development with hot reload: `npm run dev` (Vite prints the local URL).
Deploy the current build to Pages: `npm run deploy`.
This builds first, then uploads `dist` to the `mandelflight` Pages project on branch `main`.
The write password is the Pages secret `PRESET_WRITE_KEY` (`npx wrangler pages secret put PRESET_WRITE_KEY --project-name mandelflight`).

Reading is public; PUT/DELETE need the header `x-api-key: <PRESET_WRITE_KEY>`.
Test locally with `npm run cf:dev` (serves on http://127.0.0.1:8788).
