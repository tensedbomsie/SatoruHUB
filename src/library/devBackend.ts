// DEV ONLY. Loaded through a dynamic import guarded by import.meta.env.DEV,
// so production builds never include it. Pairs with the `library-dev` Vite
// plugin in vite.config.ts, which serves the catalog and the local source MP3s
// (with Range support and a fake expiry) on the dev server only.
import { asCloth, type LibraryBackend, type Progress, type Shelf } from './types'

type DevTrack = { title: string; subtitle: string | null; position: number; audioPath: string; durationSeconds: number | null }
type DevBook = {
  slug: string
  title: string
  subtitle?: string
  author?: string
  coverLabel?: string
  cloth?: string
  position: number
  tracks: DevTrack[]
}
type DevShelf = { slug: string; title: string; description?: string; position: number; books: DevBook[] }

const PROGRESS_KEY = 'satoru_library_dev_progress'

export function createDevBackend(ttlSeconds: number): LibraryBackend {
  const readAll = (): Record<string, Progress> => {
    try {
      return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}')
    } catch {
      return {}
    }
  }
  return {
    kind: 'dev',
    async loadCatalog(): Promise<Shelf[]> {
      const res = await fetch('/__library-dev/catalog')
      if (!res.ok) throw new Error(`dev catalog ${res.status}`)
      const json = (await res.json()) as { shelves: DevShelf[] }
      if (new URLSearchParams(location.search).has('libraryEmpty')) return []
      return json.shelves.map((s) => ({
        id: `shelf:${s.slug}`,
        slug: s.slug,
        title: s.title,
        description: s.description ?? null,
        position: s.position,
        books: s.books.map((b, bi) => ({
          id: `book:${b.slug}`,
          slug: b.slug,
          shelfId: `shelf:${s.slug}`,
          title: b.title,
          subtitle: b.subtitle ?? null,
          author: b.author ?? null,
          coverLabel: b.coverLabel ?? null,
          cloth: asCloth(b.cloth, bi),
          position: b.position,
          tracks: b.tracks.map((t) => ({
            id: `track:${t.audioPath}`,
            bookId: `book:${b.slug}`,
            title: t.title,
            subtitle: t.subtitle,
            position: t.position,
            audioPath: t.audioPath,
            durationSeconds: t.durationSeconds,
          })),
        })),
      }))
    },
    async loadProgress() {
      return Object.values(readAll())
    },
    async saveProgress(p) {
      const all = readAll()
      all[p.trackId] = p
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(all))
    },
    async signUrls(paths) {
      const expiresAt = Date.now() + ttlSeconds * 1000
      return Object.fromEntries(
        paths.map((p) => [p, { url: `/__library-dev/audio?path=${encodeURIComponent(p)}&exp=${expiresAt}`, expiresAt }]),
      )
    },
  }
}
