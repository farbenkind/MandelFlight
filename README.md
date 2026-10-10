# MandelFlight

## Jam Prototype (local MVP)

Open `/src/projekte/fractal-demo/jam/index.html` and choose Sender, then open
the viewer link in another window on the same origin and browser profile.
Start the microphone and clap or speak: RMS volume controls one WebGL2 circle,
simple amplitude-rise impulses change its color and create up to three rings.
The viewer test button tests only graphics, not microphone/network delivery.
Stop releases microphone tracks; stale sender data fades to zero after one second.

This independent three-file prototype uses Web Audio and BroadcastChannel,
not the fractal engine, WASM audio analysis, accounts or preset system.
Only `{senderId, level, pulseId}` measurements are shared, at 20 Hz; no audio is
played, recorded or transmitted. Use exactly one sender. This is not musical
beat detection. Microphone access needs permission and HTTPS or localhost.
WebGL2 is required for the viewer.

No communication between different devices/profiles, WebSocket relay, rooms,
multiuser mixing, synchronization, streaming, persistence, optimization or
future engine architecture is included.

## Experimental mobile rendering

WebGPU/WebGL2-capable Android/iOS and coarse-pointer touch devices start with a
360-pixel long edge, preserving the displayed aspect ratio and ignoring
device pixel ratio. Resolution adapts through 240/360/480/640/800/1024 pixels:
three completed workloads over 40 ms lower quality; 90 under 12 ms raise it.
Changes have a five-second cooldown. Measurements use GPU queue completion
wall time (including queued work), not hardware timestamp queries; long stalls
over one second and hidden-tab samples are excluded.

Mobile compute and presentation target at most 30 updates per second, with only
one fractal compute workload awaiting GPU completion. Intermediate updates are
coalesced to the newest palette/view, while audio/modulation retain their existing
timing. Hidden mobile tabs stop requesting new renders and catch up to the latest
state on return. Texture resources are recreated on quality/viewport changes; iterations,
color operators and preset data remain unchanged. Thumbnails wait for a fresh
render. Device-specific resolution is not saved into presets or copied to fullscreen.
WebGPU desktop keeps its existing 1920x1080 render resolution and update behavior.

This is experimental, not a guarantee for any phone/tablet, including T80.
Missing WebGPU/adapter support cannot be fixed by reducing resolution; WebGL2
is now attempted as a fallback. Explicit startup errors and the PC/laptop
recommendation remain when neither backend works. No pinch-zoom UI or responsive
editor redesign is included.

### WebGL2 compatibility backend

WebGPU is preferred. Missing API/adapter, device acquisition or graphics-context
initialization failures are logged and trigger a fresh WebGL2 canvas. No WebGL1
or CPU fractal fallback is provided. GLSL ES 3.00 fragment shaders generate the
1024-entry RGBA8 palette and render the Mandelbrot image into an RGBA8 framebuffer.
Palette uniforms use the shared parameter schema; xCmap warps/LUTs, generator
PhaseShift, HueShift, both versioned Pastel looks and Contrast retain their semantics.
The palette/curve previews use the generated palette pixels with 2D canvases.
Presets, audio, modulation, navigation and fullscreen state are backend-independent.

WebGL2 uses GPU fences and the shared scheduler for one pending GPU workload,
coalescing and up to 30 Hz, including desktop fallback. Mobile additionally uses
adaptive resolution. Iterations are not silently capped. Context loss and
shader/link errors are surfaced explicitly; recovery requires reload. Floating-point
shader calculations can differ between APIs/drivers, especially at deep zoom.
Supporting WebGL2 does not guarantee adequate performance on any specific T80.

MandelFlight is an interactive workspace for experimenting with fractals, color,
audio-reactive visuals, shaders, and mathematical transformations. The first
prototype is the fractal demo from the `farbenkind/my-website` repository.

## Run locally

The editor's **Audio-Reaktion pausieren (Space)** button freezes automatic
modulation at its current values while manual colormap editing remains active.
Click again or press Space to resume. Microphone analysis continues; this is
not a microphone mute. Space is ignored in form controls and open dialogs.
The pause is runtime-only, not stored in presets.

Modulation ticks receive an explicit signal snapshot, `deltaTime` (seconds),
active modulation `time` and injectable random provider through SourceContext.
The live host retains the existing fixed 40 Hz step; paused callbacks do not
advance modulation time or replay missed ticks. Beat signals are passed by
the audio host, not read from browser globals by source implementations.
A compatibility adapter supports older direct source calls. Existing
oscillator speed is intentionally preserved (frequency * deltaTime * 2/3);
envelope and base/punch update behavior are unchanged. Runtime state remains
outside serialized source parameters. The context refactor itself did not
add sources; Random and Glider were added separately below.

### Random modulation source

**Random** is a regular Source, usable directly on targets or as a processor
input. It outputs [0, 1] sample-and-hold values using only the tick context's
beat position and random provider.

- **Distribution** [-1, 1]: continuous quantile interpolation from a truncated
  narrow normal distribution at -1 through uniform at 0 to narrow U-shaped
  edge lobes at +1. The former bounded normal (mean 0.5, sigma 0.15) is
  compressed around 0.5 by 1/9, reducing its variance exactly to 1/81.
  At +1 each half of the former arcsine distribution is compressed toward
  its respective edge by 1/9; each lobe's variance becomes 1/81, while the
  overall variance increases. Center=0.5 and Skew=0 are the calibration baseline.
  Existing nonzero Distribution presets intentionally become more concentrated;
  uniform output and trigger timing remain unchanged.
  At neutral Center/Skew, the central 95% interval of the new normal spans
  about 17.6 degrees on a 270-degree knob before Amount/Transform, not a
  guaranteed 10-degree interval.
- **Center** [0, 1]: moves the neutral distribution's midpoint with continuous
  piecewise scaling of its lower/upper halves; 0.5 is neutral.
- **Skew** [-1, 1]: an odds warp biases toward lower/higher values;
  0 is neutral. Center and Skew edits affect the next drawn sample.
- **Division**: all existing beat divisions, including dotted/triplet values;
  `1/1` is an additional spelling of `1B` (four beats).
- **Phase** [0, 1]: positive offset in division units; 0.5 triggers offbeat,
  and 1 has the same grid as 0.

The first evaluation draws immediately. Later evaluations draw only when
crossing a boundary, including the exact boundary. A skipped span draws once,
not once per missed boundary. A backward beatclock reset holds the current
value and resynchronizes. Changing Division/Phase reanchors without drawing.
Random owns its held value and trigger state; presets serialize only the five
parameters and restart runtime state on load. Pausing prevents evaluations;
resume uses the current beat position with no replay.

### Glider processor (v1)

**Glider** is a regular Processor with one **Input** source selector (default:
Random) and one **Speed** slider [0, 1] (default: 0.5). Select Glider as the
modulation signal, then choose Random or BeatSaw in Input.
Inputs use the existing source-reference architecture and their default
configuration; this version does not add nested source-parameter editors.

The first input initializes the internal output. Later changes, including
switching Input, smoothly approach the new input without overshoot:
`output += (input - output) * (1 - exp(-rate * deltaTime))`.
The rate is `0.001 * 100000^Speed` per second: Speed 0 is nearly frozen
(time constant 1000 seconds), 0.5 is medium (about 3.16 seconds), and 1 is
fast (0.01 seconds). It uses only context deltaTime, with no private clock.
Subdivision of elapsed time preserves the response for held inputs.
Pause holds the output and resume advances only the next normal tick.
Presets retain Input and Speed, not output or upstream runtime state.
No prediction, extrapolation, interpolation modes or additional controls.

MandelFlight currently targets PCs/laptops with WebGPU-capable graphics and a
current browser (Chrome or Edge with hardware acceleration recommended).
Phones and tablets are not officially supported; compatible devices may run
the app, but performance, battery use and touch UX are not guaranteed. A
coarse-pointer device sees a desktop recommendation. Failed startup (including
missing WebGPU, no adapter or device creation failure) displays an explicit
error and PC/laptop recommendation instead of leaving inert editor controls.
No WebGL fallback is implemented.

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

Audio analysis uses the actual AudioContext sample rate. Beat updates are
driven by AudioWorklet sample messages at 40 Hz, not by a main-thread
interval that browsers may throttle to roughly 1 Hz in a background editor tab.
The audio context must remain running; this does not bypass browser suspension
or guarantee real-time scheduling under heavy load.
Bass-onset beat tracking uses threshold hysteresis and a 200 ms refractory period; rejected
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
  Mouse-wheel zoom and primary-pointer drag use the same navigation in both
  views. Navigation synchronizes bidirectionally with the originating editor
  and its other fullscreen tabs; presets also synchronize the view.
  Color/audio updates refresh both the palette and the computed fractal image
  without overwriting the current navigation. Hide the
  editor overlay with E to navigate its canvas, then show it again to edit.
  The editor overlay is visible by default when opening the demo.
  Fullscreen without an originating editor remains independently navigable.
- `LICENSE` contains the GNU GPL v3 license accompanying the source project.
- `src/projekte/function-plotter/` is the function-chain plotter (local only).
- `supabase/migrations/` contains the Community preset database and access policies.
- `functions/api/turnstile.js` verifies optional Cloudflare Turnstile challenges.

## Community presets (Supabase)

The Presets browser separates **Featured**, **Community**, **Meine Presets**
(account-owned presets in the active A/B workspace) and **Auf diesem Geraet**
(browser-local presets, independent of login). Public presets can be browsed and loaded without an account.
Google/GitHub OAuth users can save private presets, publish/unpublish their
own work, like community presets, and save one private copy of another user's
preset. A Featured badge is metadata on the original community record; the
author and community counters are retained. Featured presets default to the
curated order; other lists default to newest, and can be sorted by name, likes,
views, or saves. Search matches name, description, and author.

New full-visual payloads use `schemaVersion: 1`, `kind: "visual"` and separate
`geometry`, `color`, and `post` objects. The UI only saves and loads complete
Visual presets. Existing version-1 and version-2 formats remain readable, and
old browser-local presets can be imported into the signed-in account.

Eligible admins use one GitHub identity with three explicitly selected workspaces:
**User / A** (default, no admin actions), **Admin / A** (same personal presets
plus administration), and **Test user / B** (separate private test presets for
that admin, no admin actions). B cannot be published or featured. Likes, copies
and view deduplication distinguish A/B; interactions with public community
presets still affect their real counters. Storage and write limits remain
shared per authenticated account. B is not impersonation of another account.
Apply `supabase/migrations/202610090004_workspaces.sql` before deploying the
workspace UI. RLS and privileged RPCs check the request workspace and admin
eligibility; changing the UI alone cannot access B or grant admin privileges.
Changing identity or workspace clears editing targets and account-bound UI
state, but retains the current visualization. New sessions start in User / A.
**Von MandelFlight abmelden** ends the app session in this browser, not the
GitHub website session. GitHub may therefore sign the same account back in
without prompting. To use another identity, switch accounts on github.com
first, then sign in to MandelFlight. The auth panel explains this distinction;
the app does not attempt to log the user out of GitHub.
**Auf diesem Geraet speichern** is available without login and while signed in.
**In meinem Konto speichern** requires a ready authenticated workspace.
The form displays the explicit destination; it never silently substitutes one
for the other. Local presets support loading, explicit updating/renaming,
deleting, search and name/newest sorting, and an explicit private copy to the
active account. Existing local v1/v2 visuals remain readable. Duplicate local
names require choosing another name or explicitly updating the existing card;
storage failures are displayed without claiming success.
Local storage is specific to the browser profile and origin, not a cloud backup.
The S shortcut opens the device-save form, regardless of login state.
Saving or updating captures a real JPEG thumbnail of the visualization canvas
(no UI), with the displayed aspect ratio and a maximum edge of 320 pixels.
The snapshot is optional presentation metadata in `preset_data.thumbnail`,
independent of the visual-state codec. Account lists select only this JSON
field rather than fetching the full visual payload. Private copies retain the
image, using the same access rules as the preset; no storage bucket or schema
migration is required. Thumbnails count towards existing preset-size quotas.
Old presets retain their existing preview until explicitly saved again.
The old shared Cloudflare KV cards and automatic list requests have been removed
from the UI. Already imported account copies and KV originals are retained;
the legacy API remains read-only for recovery.

Database-enforced safeguards in the migration:

- Maximum 50 presets and 5 MB of preset JSON per account; 200 KB per preset.
- Maximum 300 MB aggregate preset JSON, 30 preset writes and 60 Likes per hour,
  and five problem reports per day per account. Problem-report text is capped at
  25 MB aggregate.
- One Like per user/preset. Authenticated views are deduplicated to one per user
  per UTC day (deduplication rows are retained for 30 days); Saves create at
  most one private copy per user/source preset.
- Supabase Row Level Security keeps private presets and problem reports private.
  Counters and Featured metadata cannot be set directly by a client.
- The global welcome visualization is publicly readable, but can only be
  changed through an admin-checked database function.
- Problem reports include title, description, category, app version, browser,
  operating system, client timestamp, and the currently loaded preset ID when
  available. Browser and OS values are limited in size.

### First deployment setup

1. Create a Supabase project. In its SQL Editor, run
   `supabase/migrations/202610090001_community_presets.sql`.
   To enable the global welcome visualization, also run
   `supabase/migrations/202610090003_landing_preset.sql`.
   For the three-workspace login flow, also run
   `supabase/migrations/202610090004_workspaces.sql`.
2. Enable the OAuth providers you intend to offer in Supabase Authentication >
   Sign In / Providers. Add each provider's OAuth client ID/secret there (not in
   this repository). GitHub is the currently displayed community login option.
   Configure the provider callback shown by Supabase, then set the Supabase
   Site URL to `https://mandelflight.farbenkind.org` and add the production and local
   app URLs to the redirect allow-list.
3. Copy `.env.example` to `.env.local` and fill in the Supabase Project URL and
   public anon/publishable key. The key is intentionally used by the browser;
   **never** put a Supabase service-role key in a `VITE_` variable or the repo.
4. GitHub Actions builds and deploys production on every push to `main`.
   In [GitHub Actions secrets](https://github.com/farbenkind/MandelFlight/settings/secrets/actions),
   add these repository secrets:
   - `VITE_SUPABASE_URL`: the Supabase project URL.
   - `VITE_SUPABASE_ANON_KEY`: the public anon/publishable key (never a
     service-role key).
   - `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with Account > Cloudflare
     Pages > Edit permission, scoped to the MandelFlight Cloudflare account.
   - `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.
   The workflow tests, builds with the two Vite variables, then deploys `dist`
   to the `mandelflight` Pages project. Create the API token from Cloudflare
   Profile > API Tokens > Create Token > Custom Token. In Cloudflare Pages,
   open project `mandelflight` > Settings > Build > Branch control and disable
   automatic Git deployments so pushes do not trigger a second build that
   lacks the Vite secrets. Add all four GitHub secrets and disable automatic
   Cloudflare Git deployments before pushing the workflow to `main`.
   After a push, open the [MandelFlight deploy status page](https://mandelflight.pages.dev/deploy-status.html)
   to check the latest commit, tests/build, Cloudflare deploy, and live app response.
5. Sign in once with Martin's account. In Supabase SQL Editor, promote that
   account for curation with:
   `update public.profiles set is_admin = true where id = (select id from auth.users where email = 'YOUR_EMAIL');`
   Only accounts with `profiles.is_admin = true` can mark/unmark public
   Featured presets or change the global welcome visualization. The email stays
   private; run the promotion SQL only in the Supabase dashboard.
6. To preserve the old shared KV library, set `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, and `LEGACY_PRESET_OWNER_ID` in a private
   PowerShell session, then run `npm run presets:import-legacy`. The script
   converts old version-1/version-2 records, imports them as public Community
   presets, skips same-owner/name duplicates, and never writes the service key
   into the repository or browser bundle. Prompt for the key rather than
   typing it into a command:
   `$env:SUPABASE_SERVICE_ROLE_KEY = [System.Net.NetworkCredential]::new("", (Read-Host "Service role key" -AsSecureString)).Password`
   Curate Featured from the new UI.

Cloudflare Turnstile is optional. To require a challenge for problem reports,
create a Turnstile widget for `mandelflight.pages.dev`, set its public site key
as `VITE_TURNSTILE_SITE_KEY` at build time, and set the secret
`TURNSTILE_SECRET_KEY` in Cloudflare Pages Functions. The server verifies the
single-use token and checks the hostname. The database quotas/rate limits remain
active independently. For local Pages Function testing, use an ignored
`.dev.vars` file for the Turnstile secret and run `npm run cf:dev`.

Supabase's free quotas and Cloudflare Workers/Pages limits can change; check
the providers' current plans before public launch. The old shared-password KV
preset endpoint in `functions/api/presets/` is read-only and is no longer used
by the browser UI; PUT/DELETE return HTTP 410.

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

The miscCmap color chain is generator PhaseShift -> HueShift -> Pastel ->
Contrast. PhaseShift keeps its existing wave-phase behavior and UI position;
it is not an offset into the finished palette. Gamma is not implemented.

Color pipeline version 2 restores the original dreamy HSV Pastel:
`S' = S * (1 - 0.8*p)`, `V' = mix(V, 1, 0.25*p)`. Pastel 0 returns the original
RGB unchanged; stronger settings lift even palette black towards gray.
Contrast then preserves HSV H/S and maps V with
`a = 2^(2*c - 1)`, `V' = V^a / (V^a + (1-V)^a)`.
Contrast 0.5 returns RGB unchanged, 0 reduces and 1 increases midtone contrast
without hard clipping. Endpoints remain fixed; lifted black approaches but
does not become exact black. HSV V is not perceptual luminance.

Presets explicitly store `colorPipelineVersion` separately from their data
schema version. Missing versions use pipeline 1: the previous endpoint-preserving
Pastel lift `V + p * 0.5 * V * (1-V)`. Missing Contrast defaults to 0.5.
Load/save, local-to-account copies, landing visuals and fullscreen snapshots
retain the pipeline version. Unknown versions fail explicitly. New editor
state uses version 2; loading old presets never upgrades their look silently.
Pipeline versioning is internal; the editor has no style label or upgrade button.
Unversioned presets cannot distinguish algorithms from earlier app releases;
version 1 preserves the behavior immediately preceding this change.

Palette and RGB curves share the final result before 8-bit texture storage.
Modulation, fullscreen and presets use the standard knob schema. The separately
rendered black fractal interior is unaffected by palette color operators.

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

Live: https://mandelflight.farbenkind.org (Cloudflare Pages project `mandelflight`).
The previous address https://mandelflight.pages.dev remains accessible without
a redirect during the transition.

The custom domain points to the existing Pages project through a CNAME
`mandelflight` -> `mandelflight.pages.dev`. The `PRESETS` KV binding is retained.
Supabase's Site URL is the custom domain; the redirect allow-list retains both
origins and their `/**` paths for the root and nested editor entry points.
Supabase account presets and KV data stay in their existing services;
browser-local data and login sessions do not transfer between domains. Import
local presets on the old origin before redirecting it. Sign in again on the new
domain to access account-owned presets.

Local development with hot reload: `npm run dev` (Vite prints the local URL).
Deploy the current build to Pages: `npm run deploy`.
This builds first, then uploads `dist` to the `mandelflight` Pages project on branch `main`.
To deploy and then open the deploy status in VS Code's integrated browser, run
`Terminal > Run Task > Deploy + open status in VS Code`. The status page appears
after the deploy task succeeds.

Test locally with `npm run cf:dev` (serves on http://127.0.0.1:8788).

Architecture review and phased refactoring plan:
[docs/architecture-cleanup.md](docs/architecture-cleanup.md).
