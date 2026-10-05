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
