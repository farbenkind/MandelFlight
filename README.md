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

Live: https://mandelflight.pages.dev (Pages project mandelflight, KV binding PRESETS is set in `wrangler.toml`).

Deploy: `npm run build` then `npx wrangler pages deploy dist --project-name mandelflight --branch main`.
The write password is the Pages secret `PRESET_WRITE_KEY` (`npx wrangler pages secret put PRESET_WRITE_KEY --project-name mandelflight`).

Reading is public; PUT/DELETE need the header `x-api-key: <PRESET_WRITE_KEY>`.
Test locally with `npm run cf:dev` (serves on http://127.0.0.1:8788).
