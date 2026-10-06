import { supabase } from '../lib/supabase'
import { asCloth, type LibraryBackend, type Progress, type Shelf, type SignedUrl } from './types'

const BUCKET = 'library-audio'
// 3 hours. The player re-signs on its own before expiry or when playback errors.
export const SIGNED_URL_TTL_SECONDS = 3 * 60 * 60

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

const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position

export function createSupabaseBackend(ownerId: string): LibraryBackend {
  return {
    kind: 'supabase',

    async loadCatalog(): Promise<Shelf[]> {
      const { data, error } = await supabase
        .from('library_shelves')
        .select(
          'id, slug, title, description, position, library_books(id, slug, title, subtitle, author, cover_label, cloth, position, library_tracks(id, title, subtitle, position, audio_path, duration_seconds))',
        )
        .order('position')
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
  }
}
