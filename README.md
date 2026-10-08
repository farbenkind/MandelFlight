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
and `beatSin` follow the global BeatClock. All are unipolar (0-1); Saw starts
at 0, Tri/Sin peak at phase 0.5, Pulse is high for the first half-cycle.
They have no independent oscillator state or frequency parameters.
`beatPhase` remains the raw single-beat phase. The four projections declare a
discrete `division` select, defaulting to `1/4` (also for old presets).
In 4/4, 4 Bars/2 Bars/1 Bar use 16/8/4 beats (stored as `4B`/`2B`/`1B`).
Note divisions range from `1/2` to `1/32`; `D` multiplies their duration by
3/2, `T` by 2/3, including `1/2D` and `1/2T`.
Rust exports `BeatData.beat_position` as a double-precision, unwrapped beat
position (`window.beatPosition`). Accepted onsets advance its beat index;
missing onsets extrapolate at the current BPM, and subsequent onsets align
to the nearest beat. This is relative to the first detected onset, not a
detected musical downbeat. Sampling/select changes do not start a new clock.

## Project structure

- `src/projekte/fractal-demo/` contains the interactive demo and its Rust/WASM
  renderer source.
- `src/projekte/fractal-demo/fullscreen.html` runs the same fractal renderer
  without editor controls; use the editor's Fullscreen button to open the
  current view and colormap state in a new tab. Editor-only mod-panel dragging
  is initialized only in the editor, not in the fullscreen runtime.
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

Colormap knobs always show their parameter name below the dial. Hovering over
the dial or dragging it shows the current GPU parameter value (including
modulation) above it, rounded to three decimals.

xCmap Relax is the first control in each XR/XG/XB/ALL column, before PrePow.
It maps the domain with `y = 0.5 + (1 - 2 * relax) * (x - 0.5)`:
0 preserves x, 0.5 collapses it to the midpoint, and 1 mirrors it to 1-x.
Channel and ALL values add and are clamped to 0-1. Subsequent warps and the
LUT still apply: at 0.5 the color is constant, but non-neutral downstream
settings can change which PrimCmap color that midpoint produces.
Relax supports the existing modulation, presets and fullscreen synchronization.
Loading older presets/snapshots defaults missing schema parameters to their
initial values, including Relax=0.

xCmap Shift rolls the existing Relax-selected section without moving its bounds.
It rotates the input position before Relax: `y = relaxDomain(fract(x + shift), relax)`,
then applies the unchanged PrePow/wave/Shape2/LUT chain. Relax=0.25 keeps the
interval [0.25, 0.75]; Relax=0.5 stays at the midpoint for every Shift value.
Mirrored sections (Relax>0.5) retain their orientation. The Shift knob remains
last in each UI column; channel and ALL shifts add. Zero and whole turns are
neutral (including the endpoint x=1); negative shifts wrap as well.
Shift works with WaveMix=0. Existing presets retain their values, but Shift
now rolls the selected section instead of offsetting the final output or
changing only the cosine wave's internal phase.

Live: https://mandelflight.pages.dev (Pages project mandelflight, KV binding PRESETS is set in `wrangler.toml`).

Local development with hot reload: `npm run dev` (Vite prints the local URL).
Deploy the current build to Pages: `npm run deploy`.
This builds first, then uploads `dist` to the `mandelflight` Pages project on branch `main`.
The write password is the Pages secret `PRESET_WRITE_KEY` (`npx wrangler pages secret put PRESET_WRITE_KEY --project-name mandelflight`).

Reading is public; PUT/DELETE need the header `x-api-key: <PRESET_WRITE_KEY>`.
Test locally with `npm run cf:dev` (serves on http://127.0.0.1:8788).
