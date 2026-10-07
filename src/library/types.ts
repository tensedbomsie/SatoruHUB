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

export type DocKind = 'epub' | 'pdf' | 'html'

/** A readable file attached to a book (EPUB, PDF or a self-made HTML sheet). */
export type DocFile = {
  id: string
  bookId: string
  kind: DocKind
  title: string
  storagePath: string
  sizeBytes: number | null
  /** reading-length hints from the sync script, null when unknown */
  charCount: number | null
  pageCount: number | null
  estMinutes: number | null
  position: number
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
  files: DocFile[]
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

/**
 * Where the reader is inside a file. Engine specific:
 *   EPUB  { cfi }                 CFI of the first visible text
 *   PDF   { page, offset }        1-based page, 0..1 scroll offset inside it
 *   HTML  { fraction }            0..1 of the document's scroll height
 * Every locator may also carry `fraction` (0..1 of the whole file) so a
 * fallback jump is always possible.
 */
export type Locator = {
  cfi?: string
  page?: number
  offset?: number
  pages?: number
  fraction?: number
}

export type ReadingProgress = {
  fileId: string
  locator: Locator
  /** 0..100 */
  percent: number
  updatedAt: string
}

export type Bookmark = {
  id: string
  fileId: string
  kind: 'bookmark' | 'highlight'
  locator: Locator
  label: string | null
  excerpt: string | null
  percent: number | null
  createdAt: string
}

export type NewBookmark = Omit<Bookmark, 'id' | 'createdAt'>

export interface LibraryBackend {
  readonly kind: 'supabase' | 'dev'
  loadCatalog(): Promise<Shelf[]>
  loadProgress(): Promise<Progress[]>
  saveProgress(p: Progress): Promise<void>
  /** Returns a short-lived URL per storage path. Missing keys mean signing failed for that path. */
  signUrls(paths: string[]): Promise<Record<string, SignedUrl>>

  // ---- reading ----
  loadReadingProgress(): Promise<ReadingProgress[]>
  saveReadingProgress(p: ReadingProgress): Promise<void>
  /** One short-lived URL for a file in the private docs bucket. */
  signDocUrl(path: string): Promise<string>
  listBookmarks(fileId: string): Promise<Bookmark[]>
  addBookmark(b: NewBookmark): Promise<Bookmark>
  deleteBookmark(id: string): Promise<void>
}

export function asCloth(v: string | null | undefined, fallbackIndex = 0): ClothId {
  return (CLOTHS as string[]).includes(v ?? '') ? (v as ClothId) : CLOTHS[fallbackIndex % CLOTHS.length]
}
