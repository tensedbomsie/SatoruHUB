export type ClothId = 'ink' | 'moss' | 'clay' | 'dusk' | 'ochre' | 'plum'

export const CLOTHS: ClothId[] = ['ink', 'moss', 'clay', 'dusk', 'ochre', 'plum']

export type Track = {
  id: string
  bookId: string
  title: string
  subtitle: string | null
  position: number
  audioPath: string
  durationSeconds: number | null
}

export type Book = {
  id: string
  slug: string
  shelfId: string
  title: string
  subtitle: string | null
  author: string | null
  coverLabel: string | null
  cloth: ClothId
  position: number
  tracks: Track[]
}

export type Shelf = {
  id: string
  slug: string
  title: string
  description: string | null
  position: number
  books: Book[]
}

export type Progress = {
  trackId: string
  positionSeconds: number
  completed: boolean
  updatedAt: string
}

export type SignedUrl = { url: string; expiresAt: number }

export interface LibraryBackend {
  readonly kind: 'supabase' | 'dev'
  loadCatalog(): Promise<Shelf[]>
  loadProgress(): Promise<Progress[]>
  saveProgress(p: Progress): Promise<void>
  /** Returns a short-lived URL per storage path. Missing keys mean signing failed for that path. */
  signUrls(paths: string[]): Promise<Record<string, SignedUrl>>
}

export function asCloth(v: string | null | undefined, fallbackIndex = 0): ClothId {
  return (CLOTHS as string[]).includes(v ?? '') ? (v as ClothId) : CLOTHS[fallbackIndex % CLOTHS.length]
}
