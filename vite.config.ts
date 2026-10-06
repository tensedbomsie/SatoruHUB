import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execFileSync } from 'node:child_process'
import { createReadStream, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Dev server only (`apply: 'serve'`): lets the Library be exercised without a
// login by serving scripts/library/catalog.json and the local source audio
// under /__library-dev/. Never part of a production build. Signed-URL expiry
// is imitated with an `exp` query param so the re-sign path can be tested.
function libraryDevPlugin(): Plugin {
  let sources = new Map<string, string>()
  const loadCatalog = () => {
    const script = fileURLToPath(new URL('./scripts/library/sync.ts', import.meta.url))
    const out = execFileSync(process.execPath, [script, '--json'], { encoding: 'utf8', maxBuffer: 1 << 24 })
    const json = JSON.parse(out) as { shelves: { books: { tracks: { audioPath: string; sourceFile: string }[] }[] }[] }
    sources = new Map()
    for (const s of json.shelves) for (const b of s.books) for (const t of b.tracks) sources.set(t.audioPath, t.sourceFile)
    return out
  }
  return {
    name: 'library-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__library-dev', (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        try {
          if (url.pathname === '/catalog') {
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(loadCatalog())
            return
          }
          if (url.pathname === '/audio') {
            if (sources.size === 0) loadCatalog()
            const file = sources.get(url.searchParams.get('path') ?? '')
            const exp = Number(url.searchParams.get('exp'))
            if (!file) {
              res.statusCode = 404
              res.end('not in catalog')
              return
            }
            if (!exp || Date.now() > exp) {
              res.statusCode = 403
              res.end('signed url expired')
              return
            }
            const size = statSync(file).size
            res.setHeader('Content-Type', 'audio/mpeg')
            res.setHeader('Accept-Ranges', 'bytes')
            res.setHeader('Cache-Control', 'no-store')
            const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
            if (range) {
              const start = range[1] ? Number(range[1]) : 0
              const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
              res.statusCode = 206
              res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
              res.setHeader('Content-Length', String(end - start + 1))
              createReadStream(file, { start, end }).pipe(res)
            } else {
              res.setHeader('Content-Length', String(size))
              createReadStream(file).pipe(res)
            }
            return
          }
          res.statusCode = 404
          res.end()
        } catch (err) {
          res.statusCode = 500
          res.end(String(err))
        }
      })
    },
  }
}

// Tauri sets TAURI_ENV_PLATFORM during `tauri build`/`tauri dev`. The packaged
// .exe already bundles every asset locally, so the PWA service worker adds no
// offline benefit there and only causes rebuilds to keep serving a stale
// cached UI until it's manually cleared — skip it for that build target.
const isTauri = !!process.env.TAURI_ENV_PLATFORM

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    libraryDevPlugin(),
    !isTauri && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        // hub.ppchan.com also serves every other app in the family at the
        // same origin (/FoodDiary/, /WorkoutTracker/, etc., embedded in the
        // wheel's iframe overlay) — without this, this SW's SPA fallback
        // hijacks navigation to those paths too and serves SatoruHUB's own
        // cached shell instead, which then 404s trying to load its own
        // asset paths relative to the wrong subpath.
        navigateFallbackDenylist: [
          /^\/(Storyboard|FoodDiary|WorkoutTracker|MovieHub|MoneyDiary|TechDictionary|BookingDemoLite|BookingSystemDemo|LeadDemos|NewsReader)\//,
        ],
      },
      manifest: {
        name: 'Satoru HUB',
        short_name: 'Satoru HUB',
        description: 'ทางเข้ารวมทุกเว็บส่วนตัว',
        start_url: '/SatoruHUB/',
        scope: '/SatoruHUB/',
        display: 'standalone',
        background_color: '#0a0b0f',
        theme_color: '#0a0b0f',
        icons: [
          { src: 'pwa-icon.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: 'pwa-icon.svg', sizes: '512x512', type: 'image/svg+xml' },
          { src: 'pwa-icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
