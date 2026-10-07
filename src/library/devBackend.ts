// DEV ONLY. Loaded through a dynamic import guarded by import.meta.env.DEV,
// so production builds never include it. Pairs with the `library-dev` Vite
// plugin in vite.config.ts, which serves the catalog, the local source MP3s
// and the local book files (with Range support and a fake expiry) on the dev
// server only.
import { asCloth, type Bookmark, type DocKind, type LibraryBackend, type Progress, type ReadingProgress, type Shelf } from './types'

type DevTrack = { title: string; subtitle: string | null; position: number; audioPath: string; durationSeconds: number | null }
type DevFile = {
  kind: DocKind
  title: string
  position: number
  storagePath: string
  sizeBytes: number | null
  charCount: number | null
  pageCount: number | null
  estMinutes: number | null
}
type DevBook = {
  slug: string
  title: string
  subtitle?: string
  author?: string
  coverLabel?: string
  cloth?: string
  position: number
  tracks: DevTrack[]
  files?: DevFile[]
}
type DevShelf = { slug: string; title: string; description?: string; position: number; books: DevBook[] }

const PROGRESS_KEY = 'satoru_library_dev_progress'
const READING_KEY = 'satoru_library_dev_reading'
const BOOKMARKS_KEY = 'satoru_library_dev_bookmarks'

function readMap<T>(key: string): Record<string, T> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}')
  } catch {
    return {}
  }
}

export function createDevBackend(ttlSeconds: number): LibraryBackend {
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
          files: (b.files ?? []).map((f) => ({
            id: `file:${f.storagePath}`,
            bookId: `book:${b.slug}`,
            kind: f.kind,
            title: f.title,
            storagePath: f.storagePath,
            sizeBytes: f.sizeBytes,
            charCount: f.charCount,
            pageCount: f.pageCount,
            estMinutes: f.estMinutes,
            position: f.position,
          })),
        })),
      }))
    },
    async loadProgress() {
      return Object.values(readMap<Progress>(PROGRESS_KEY))
    },
    async saveProgress(p) {
      const all = readMap<Progress>(PROGRESS_KEY)
      all[p.trackId] = p
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(all))
    },
    async signUrls(paths) {
      const expiresAt = Date.now() + ttlSeconds * 1000
      return Object.fromEntries(
        paths.map((p) => [p, { url: `/__library-dev/audio?path=${encodeURIComponent(p)}&exp=${expiresAt}`, expiresAt }]),
      )
    },

    // ---------- reading ----------
    async loadReadingProgress() {
      return Object.values(readMap<ReadingProgress>(READING_KEY))
    },
    async saveReadingProgress(p) {
      const all = readMap<ReadingProgress>(READING_KEY)
      all[p.fileId] = p
      localStorage.setItem(READING_KEY, JSON.stringify(all))
    },
    async signDocUrl(path) {
      // `&libraryDocFail` simulates a storage outage for the error state.
      if (new URLSearchParams(location.search).has('libraryDocFail')) throw new Error('dev: simulated signing failure')
      return `/__library-dev/doc?path=${encodeURIComponent(path)}&exp=${Date.now() + 10 * 60 * 1000}`
    },
    async listBookmarks(fileId) {
      return Object.values(readMap<Bookmark>(BOOKMARKS_KEY))
        .filter((b) => b.fileId === fileId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    },
    async addBookmark(b) {
      const all = readMap<Bookmark>(BOOKMARKS_KEY)
      const bm: Bookmark = { ...b, id: `bm:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString() }
      all[bm.id] = bm
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(all))
      return bm
    },
    async deleteBookmark(id) {
      const all = readMap<Bookmark>(BOOKMARKS_KEY)
      delete all[id]
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(all))
    },
  }
}
