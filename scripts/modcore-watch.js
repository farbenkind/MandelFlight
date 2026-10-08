import { spawn } from 'node:child_process'
import { resolve, relative, isAbsolute } from 'node:path'

export function modcoreWatch() {
  const demo = resolve(import.meta.dirname, '..', 'src', 'projekte', 'fractal-demo')
  const source = resolve(demo, 'modcore', 'src')
  const manifests = ['Cargo.toml', 'Cargo.lock'].map(name => resolve(demo, 'modcore', name))
  const outputs = ['modcore.js', 'modcore_bg.wasm'].map(name => resolve(demo, name))
  let building = false

  return {
    name: 'modcore-watch',
    apply: 'serve',
    configureServer(server) {
      let timer
      let pending = false
      let stopped = false
      let child

      function build() {
        if (stopped) return
        if (building) {
          pending = true
          return
        }
        building = true
        server.config.logger.info('[modcore] Building Rust/WASM...')
        child = spawn('powershell.exe', [
          '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve(demo, 'build.ps1'),
          '-WatchBuild',
        ], { stdio: 'inherit' })
        child.on('error', error => {
          server.config.logger.error(`[modcore] Could not start build: ${error.message}`)
        })
        child.on('close', code => {
          building = false
          child = undefined
          if (stopped) return
          if (pending) {
            pending = false
            build()
          } else if (code === 0) {
            server.config.logger.info('[modcore] WASM updated. Reloading browser.')
            server.ws.send({ type: 'full-reload', path: '*' })
          } else {
            server.config.logger.error('[modcore] Build failed. Browser not reloaded; see compiler output above.')
          }
        })
      }

      function changed(file) {
        const path = resolve(file)
        const withinSource = relative(source, path)
        if (!manifests.includes(path) &&
            !(withinSource && !withinSource.startsWith('..') && !isAbsolute(withinSource) && path.endsWith('.rs'))) return
        clearTimeout(timer)
        timer = setTimeout(build, 300)
      }

      server.watcher.add([source, ...manifests])
      server.watcher.on('add', changed)
      server.watcher.on('change', changed)
      server.watcher.on('unlink', changed)
      server.httpServer?.once('close', () => {
        stopped = true
        clearTimeout(timer)
        server.watcher.off('add', changed)
        server.watcher.off('change', changed)
        server.watcher.off('unlink', changed)
        child?.kill()
      })
      build()
    },
    handleHotUpdate(context) {
      // Reload only after both generated files have been copied successfully.
      if (building && outputs.includes(resolve(context.file))) return []
    },
  }
}
