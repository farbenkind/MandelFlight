import { resolve } from 'node:path'

// Spiegelt die Rewrite-Regel aus netlify.toml für dev/preview
function rewrite(req, _res, next) {
  const m = /^\/projekte\/([\w-]+)\/?(\?.*)?$/.exec(req.url)
  if (m) req.url = `/src/projekte/${m[1]}/index.html`
  next()
}

const projectRewrite = {
  name: 'project-rewrite',
  configureServer(server) { server.middlewares.use(rewrite) },
  configurePreviewServer(server) { server.middlewares.use(rewrite) }
}

export default {
  appType: 'mpa',
  plugins: [projectRewrite],
  build: {
    // JS-Dateien (z. B. der AudioWorklet pcm-processor.js) nie als data:-URL einbetten
    assetsInlineLimit: (file) => (file.endsWith('.js') ? false : undefined),
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        'fractal-demo': resolve(import.meta.dirname,         'src/projekte/fractal-demo/index.html'),
                'function-plotter': resolve(import.meta.dirname, 'src/projekte/function-plotter/index.html')
              }
    }
  }
}
