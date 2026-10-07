import { supabase } from '../lib/supabase'
import {
  asCloth,
  type Bookmark,
  type DocFile,
  type DocKind,
  type LibraryBackend,
  type Locator,
  type NewBookmark,
  type Progress,
  type ReadingProgress,
  type Shelf,
  type SignedUrl,
} from './types'

const BUCKET = 'library-audio'
const DOCS_BUCKET = 'library-docs'
// 3 hours. The player re-signs on its own before expiry or when playback errors.
export const SIGNED_URL_TTL_SECONDS = 3 * 60 * 60
// Book files are fetched once, straight after signing, so the link can be short.
const DOC_URL_TTL_SECONDS = 10 * 60

type TrackRow = {
  id: string
  title: string
  subtitle: string | null
  position: number
  audio_path: string
  duration_seconds: number | string | null
}
type BookRow = {
  id: string
  slug: string
  title: string
  subtitle: string | null
  author: string | null
  cover_label: string | null
  cloth: string | null
  position: number
  library_tracks: TrackRow[] | null
}
type ShelfRow = {
  id: string
  slug: string
  title: string
  description: string | null
  position: number
  library_books: BookRow[] | null
}
type FileRow = {
  id: string
  book_id: string
  kind: string
  title: string
  storage_path: string
  size_bytes: number | string | null
  char_count: number | null
  page_count: number | null
  est_minutes: number | null
  position: number
}
type BookmarkRow = {
  id: string
  file_id: string
  kind: string
  locator: Locator | null
  label: string | null
  excerpt: string | null
  percent: number | string | null
  created_at: string
}

const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position
const numOrNull = (v: number | string | null | undefined) => (v == null ? null : Number(v))

function toBookmark(r: BookmarkRow): Bookmark {
  return {
    id: r.id,
    fileId: r.file_id,
    kind: r.kind === 'highlight' ? 'highlight' : 'bookmark',
    locator: r.locator ?? {},
    label: r.label,
    excerpt: r.excerpt,
    percent: numOrNull(r.percent),
    createdAt: r.created_at,
  }
}

// The reading tables arrived after the audio ones. If they are missing (an
// older database, or a failed query) the audio shelf must still open, so file
// loading never throws: it reports nothing and logs once.
async function loadFiles(): Promise<Map<string, DocFile[]>> {
  const out = new Map<string, DocFile[]>()
  const { data, error } = await supabase
    .from('library_files')
    .select('id, book_id, kind, title, storage_path, size_bytes, char_count, page_count, est_minutes, position')
    .order('position')
  if (error) {
    console.warn('[library] reading files unavailable:', error.message)
    return out
  }
  for (const r of (data ?? []) as FileRow[]) {
    const kind: DocKind = r.kind === 'pdf' || r.kind === 'html' ? r.kind : 'epub'
    const f: DocFile = {
      id: r.id,
      bookId: r.book_id,
      kind,
      title: r.title,
      storagePath: r.storage_path,
      sizeBytes: numOrNull(r.size_bytes),
      charCount: r.char_count,
      pageCount: r.page_count,
      estMinutes: r.est_minutes,
      position: r.position,
    }
    const list = out.get(r.book_id)
    if (list) list.push(f)
    else out.set(r.book_id, [f])
  }
  return out
}

export function createSupabaseBackend(ownerId: string): LibraryBackend {
  return {
    kind: 'supabase',

    async loadCatalog(): Promise<Shelf[]> {
      const [{ data, error }, files] = await Promise.all([
        supabase
          .from('library_shelves')
          .select(
            'id, slug, title, description, position, library_books(id, slug, title, subtitle, author, cover_label, cloth, position, library_tracks(id, title, subtitle, position, audio_path, duration_seconds))',
          )
          .order('position'),
        loadFiles(),
      ])
      if (error) throw new Error(error.message)
      return ((data ?? []) as ShelfRow[]).map((s) => ({
        id: s.id,
        slug: s.slug,
        title: s.title,
        description: s.description,
        position: s.position,
        books: (s.library_books ?? []).sort(byPosition).map((b, bi) => ({
          id: b.id,
          slug: b.slug,
          shelfId: s.id,
          title: b.title,
          subtitle: b.subtitle,
          author: b.author,
          coverLabel: b.cover_label,
          cloth: asCloth(b.cloth, bi),
          position: b.position,
          tracks: (b.library_tracks ?? []).sort(byPosition).map((t) => ({
            id: t.id,
            bookId: b.id,
            title: t.title,
            subtitle: t.subtitle,
            position: t.position,
            audioPath: t.audio_path,
            durationSeconds: t.duration_seconds == null ? null : Number(t.duration_seconds),
          })),
          files: (files.get(b.id) ?? []).sort(byPosition),
        })),
      }))
    },

    async loadProgress(): Promise<Progress[]> {
      const { data, error } = await supabase
        .from('library_progress')
        .select('track_id, position_seconds, completed, updated_at')
      if (error) throw new Error(error.message)
      return (data ?? []).map((r) => ({
        trackId: r.track_id as string,
        positionSeconds: Number(r.position_seconds),
        completed: !!r.completed,
        updatedAt: r.updated_at as string,
      }))
    },

    async saveProgress(p: Progress) {
      const { error } = await supabase.from('library_progress').upsert(
        {
          owner: ownerId,
          track_id: p.trackId,
          position_seconds: Math.max(0, Math.round(p.positionSeconds * 100) / 100),
          completed: p.completed,
          updated_at: p.updatedAt,
        },
        { onConflict: 'owner,track_id' },
      )
      if (error) throw new Error(error.message)
    },

    async signUrls(paths: string[]) {
      const out: Record<string, SignedUrl> = {}
      if (paths.length === 0) return out
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
      if (error) throw new Error(error.message)
      const expiresAt = Date.now() + SIGNED_URL_TTL_SECONDS * 1000
      for (const row of data ?? []) {
        if (row.path && row.signedUrl && !row.error) out[row.path] = { url: row.signedUrl, expiresAt }
      }
      return out
    },

    // ---------- reading ----------
    async loadReadingProgress(): Promise<ReadingProgress[]> {
      const { data, error } = await supabase
        .from('library_reading_progress')
        .select('file_id, locator, percent, updated_at')
      if (error) {
        console.warn('[library] reading progress unavailable:', error.message)
        return []
      }
      return (data ?? []).map((r) => ({
        fileId: r.file_id as string,
        locator: (r.locator ?? {}) as Locator,
        percent: Number(r.percent),
        updatedAt: r.updated_at as string,
      }))
    },

    async saveReadingProgress(p: ReadingProgress) {
      const { error } = await supabase.from('library_reading_progress').upsert(
        {
          owner: ownerId,
          file_id: p.fileId,
          locator: p.locator,
          percent: Math.min(100, Math.max(0, Math.round(p.percent * 1000) / 1000)),
          updated_at: p.updatedAt,
        },
        { onConflict: 'owner,file_id' },
      )
      if (error) throw new Error(error.message)
    },

    async signDocUrl(path: string) {
      const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(path, DOC_URL_TTL_SECONDS)
      if (error || !data?.signedUrl) throw new Error(error?.message ?? 'sign failed')
      return data.signedUrl
    },

    async listBookmarks(fileId: string) {
      const { data, error } = await supabase
        .from('library_bookmarks')
        .select('id, file_id, kind, locator, label, excerpt, percent, created_at')
        .eq('file_id', fileId)
        .order('created_at')
      if (error) throw new Error(error.message)
      return ((data ?? []) as BookmarkRow[]).map(toBookmark)
    },

    async addBookmark(b: NewBookmark) {
      const { data, error } = await supabase
        .from('library_bookmarks')
        .insert({
          owner: ownerId,
          file_id: b.fileId,
          kind: b.kind,
          locator: b.locator,
          label: b.label,
          excerpt: b.excerpt,
          percent: b.percent == null ? null : Math.min(100, Math.max(0, b.percent)),
        })
        .select('id, file_id, kind, locator, label, excerpt, percent, created_at')
        .single()
      if (error) throw new Error(error.message)
      return toBookmark(data as BookmarkRow)
    },

    async deleteBookmark(id: string) {
      const { error } = await supabase.from('library_bookmarks').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
  }
}
