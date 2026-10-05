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

## Project structure

- `src/projekte/fractal-demo/` contains the interactive demo and its Rust/WASM
  renderer source.
- `LICENSE` contains the GNU GPL v3 license accompanying the source project.
- `src/projekte/function-plotter/` is the function-chain plotter (local only).
- `functions/api/presets/` is the preset API (Cloudflare Pages Function + KV).

## Server-side presets (Cloudflare Pages)

1. Cloudflare dashboard: create a Workers KV namespace.
2. Pages project (connect this repo): build command `npm run build`, output directory `dist`.
3. Pages -> Settings -> Bindings: add a KV binding named `PRESETS`.
4. Pages -> Settings -> Variables and Secrets: add the secret `PRESET_WRITE_KEY` (your write password).

Reading is public; PUT/DELETE need the header `x-api-key: <PRESET_WRITE_KEY>`.
Test locally with `npm run cf:dev` (serves on http://127.0.0.1:8788).
