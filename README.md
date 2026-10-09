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

The Presets browser uses three categories: **Featured**, **Community**, and
**My Presets**. Public presets can be browsed and loaded without an account.
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
- Problem reports include title, description, category, app version, browser,
  operating system, client timestamp, and the currently loaded preset ID when
  available. Browser and OS values are limited in size.

### First deployment setup

1. Create a Supabase project. In its SQL Editor, run
   `supabase/migrations/202610090001_community_presets.sql`.
2. Enable Google and GitHub in Supabase Authentication > Sign In / Providers.
   Add each provider's OAuth client ID/secret there (not in this repository).
   Configure the provider callback shown by Supabase, then set the Supabase
   Site URL to `https://mandelflight.pages.dev` and add the production and local
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
5. Sign in once with Martin's account. In Supabase SQL Editor, promote that
   account for curation with:
   `update public.profiles set is_admin = true where id = (select id from auth.users where email = 'YOUR_EMAIL');`
   Admins can mark/unmark public presets as Featured in the browser. Keep the
   account email private and run this only in the Supabase dashboard.
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

The miscCmap Pastel knob softens the final color after HueShift, preserving
HSV hue. For strength p in 0-1, saturation becomes `S * (1 - 0.8*p)`
and brightness becomes `V + (1-V) * 0.25*p`. At 0 the original RGB is
returned unchanged; at 0.5 saturation is 60% of its original value and
brightness moves 12.5% toward white; at 1 saturation is 20% and brightness
moves 25% toward white. Black therefore lifts to dark gray, while white stays
white. This is a global color look, not a spatial watercolor effect.
Palette and RGB curves share the same result. Modulation, fullscreen and
presets use the standard schema; older presets default Pastel to 0.

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

Live: https://mandelflight.pages.dev (Cloudflare Pages project `mandelflight`).

Local development with hot reload: `npm run dev` (Vite prints the local URL).
Deploy the current build to Pages: `npm run deploy`.
This builds first, then uploads `dist` to the `mandelflight` Pages project on branch `main`.

Test locally with `npm run cf:dev` (serves on http://127.0.0.1:8788).
