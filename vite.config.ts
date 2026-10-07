import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execFileSync } from 'node:child_process'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Dev server only (`apply: 'serve'`): lets the Library be exercised without a
// login by serving scripts/library/catalog.json and the local source audio
// under /__library-dev/. Never part of a production build. Signed-URL expiry
// is imitated with an `exp` query param so the re-sign path can be tested.
type DevCatalog = {
  shelves: {
    slug: string
    books: {
      slug: string
      tracks: { audioPath: string; sourceFile: string }[]
      files: { storagePath: string; sourceFile: string; kind: string }[]
    }[]
  }[]
}

function libraryDevPlugin(): Plugin {
  let sources = new Map<string, string>()
  let docs = new Map<string, { file: string; kind: string }>()
  const runSync = (catalog?: string) => {
    const script = fileURLToPath(new URL('./scripts/library/sync.ts', import.meta.url))
    const args = [script, '--json', ...(catalog ? ['--catalog', catalog] : [])]
    return JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 1 << 24 })) as DevCatalog
  }
  // The real catalog plus scripts/library/catalog.demo.json (dev-only sample
  // books and sample files merged into existing books by slug), so the
  // reader can be exercised without touching Supabase.
  const loadCatalog = () => {
    const json = runSync()
    const demoPath = fileURLToPath(new URL('./scripts/library/catalog.demo.json', import.meta.url))
    if (existsSync(demoPath)) {
      const demo = runSync(demoPath)
      for (const ds of demo.shelves) {
        const shelf = json.shelves.find((s) => s.slug === ds.slug)
        if (!shelf) {
          json.shelves.push(ds)
          continue
        }
        for (const db of ds.books) {
          const book = shelf.books.find((b) => b.slug === db.slug)
          if (book) book.files = [...(book.files ?? []), ...db.files]
          else shelf.books.push(db)
        }
      }
    }
    sources = new Map()
    docs = new Map()
    for (const s of json.shelves)
      for (const b of s.books) {
        for (const t of b.tracks) sources.set(t.audioPath, t.sourceFile)
        for (const f of b.files ?? []) docs.set(f.storagePath, { file: f.sourceFile, kind: f.kind })
      }
    return JSON.stringify(json)
  }
  const DOC_TYPES: Record<string, string> = { epub: 'application/epub+zip', pdf: 'application/pdf', html: 'text/html; charset=utf-8' }
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
          if (url.pathname === '/doc') {
            if (docs.size === 0) loadCatalog()
            const doc = docs.get(url.searchParams.get('path') ?? '')
            const exp = Number(url.searchParams.get('exp'))
            if (!doc || !existsSync(doc.file)) {
              res.statusCode = 404
              res.end('Object not found')
              return
            }
            if (!exp || Date.now() > exp) {
              res.statusCode = 400
              res.end('signed url expired')
              return
            }
            res.setHeader('Content-Type', DOC_TYPES[doc.kind] ?? 'application/octet-stream')
            res.setHeader('Content-Length', String(statSync(doc.file).size))
            res.setHeader('Cache-Control', 'no-store')
            createReadStream(doc.file).pipe(res)
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

// foliate-js (the EPUB engine) can also open PDFs through its own vendored
// pdf.js copy (~3 MB). The Library reads PDFs with pdfjs-dist directly, so
// that path is replaced with a stub and the duplicate never reaches the build.
function foliatePdfStub(): Plugin {
  const STUB = '\0foliate-pdf-stub'
  return {
    name: 'foliate-pdf-stub',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './pdf.js' && importer && /[\\/]foliate-js[\\/]view\.js$/.test(importer)) return STUB
      return null
    },
    load(id) {
      if (id === STUB) return 'export const makePDF = () => { throw new Error("PDF opens in the pdfjs-dist reader") }'
      return null
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
  // foliate-js ships plain ES modules with relative dynamic imports; serving it
  // unbundled in dev keeps those imports (and the PDF stub above) intact.
  optimizeDeps: { exclude: ['foliate-js'] },
  build: {
    rolldownOptions: {
      output: {
        // Reader code (EPUB/PDF engines, the pdf.js worker) lives under
        // assets/reader/ so the service worker can leave it out of the install
        // precache and fetch it only when a book is first opened.
        chunkFileNames: (chunk) =>
          chunk.moduleIds.some((id) => /[\\/](library[\\/]reader|foliate-js|pdfjs-dist)[\\/]|foliate-pdf-stub/.test(id))
            ? 'assets/reader/[name]-[hash].js'
            : 'assets/[name]-[hash].js',
        // The pdf.js worker ships as .mjs; serving it as .js keeps the MIME type
        // right on every host (GitHub Pages, the Tauri asset protocol).
        assetFileNames: (asset) => {
          const names = asset.names ?? []
          if (names.some((n) => /pdf\.worker/.test(n))) return 'assets/reader/[name]-[hash].js'
          if (names.some((n) => /ReaderView/.test(n))) return 'assets/reader/[name]-[hash][extname]'
          return 'assets/[name]-[hash][extname]'
        },
      },
    },
  },
  plugins: [
    react(),
    libraryDevPlugin(),
    foliatePdfStub(),
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
        // The reader (~650 KB of EPUB/PDF engines plus the 1.3 MB pdf.js
        // worker) is not part of the install precache: it is fetched the first
        // time a book is opened, then served from its own cache. File names
        // carry content hashes, so a cached copy can never be stale. Book files
        // themselves come from Supabase (another origin) and are never cached.
        globIgnores: ['**/assets/reader/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/assets/reader/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'library-reader-code',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
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
