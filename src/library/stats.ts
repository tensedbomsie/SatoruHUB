import type { Book, DocFile, Progress, ReadingProgress, Track } from './types'

export type BookMode = 'audio' | 'read' | 'both' | 'empty'

export function bookMode(book: Book): BookMode {
  const a = book.tracks.length > 0
  const r = book.files.length > 0
  return a && r ? 'both' : a ? 'audio' : r ? 'read' : 'empty'
}

/** Reading counts as finished from 99.5%: the last page rarely scrolls to a perfect 100. */
export const READ_DONE_PCT = 99.5

export function fileState(file: DocFile, rp: Record<string, ReadingProgress>): TrackState {
  const p = rp[file.id]
  if (!p || p.percent < 0.5) return 'new'
  return p.percent >= READ_DONE_PCT ? 'done' : 'progress'
}

/** Minutes left for a file from the sync-time length estimate, or null when unknown. */
export function fileMinutesLeft(file: DocFile, rp: Record<string, ReadingProgress>): number | null {
  if (!file.estMinutes) return null
  const pct = rp[file.id]?.percent ?? 0
  return Math.max(0, Math.round(file.estMinutes * (1 - pct / 100)))
}

export type BookReading = {
  count: number
  state: TrackState
  /** the file to open next: the most recently read unfinished one, else the first unfinished */
  nextFile: DocFile | null
  /** progress of nextFile (or of the book's single file), 0..100 */
  percent: number
}

export function bookReading(book: Book, rp: Record<string, ReadingProgress>): BookReading {
  const files = book.files
  if (files.length === 0) return { count: 0, state: 'new', nextFile: null, percent: 0 }
  let recent: DocFile | null = null
  let recentAt = ''
  let done = 0
  let started = 0
  for (const f of files) {
    const s = fileState(f, rp)
    if (s === 'done') done++
    if (s !== 'new') started++
    const p = rp[f.id]
    if (p && s !== 'done' && p.updatedAt > recentAt) {
      recent = f
      recentAt = p.updatedAt
    }
  }
  const nextFile = recent ?? files.find((f) => fileState(f, rp) !== 'done') ?? null
  const state: TrackState = done === files.length ? 'done' : started > 0 ? 'progress' : 'new'
  const percent = state === 'done' ? 100 : nextFile ? rp[nextFile.id]?.percent ?? 0 : 0
  return { count: files.length, state, nextFile, percent }
}

export type TrackState = 'new' | 'progress' | 'done'

export function trackState(track: Track, progress: Record<string, Progress>): TrackState {
  const p = progress[track.id]
  if (!p) return 'new'
  if (p.completed) return 'done'
  return p.positionSeconds > 3 ? 'progress' : 'new'
}

export type BookStats = {
  totalSeconds: number
  done: number
  started: number
  count: number
  state: TrackState
  /** first track that is not finished, in order */
  nextUp: Track | null
}

export function bookStats(book: Book, progress: Record<string, Progress>): BookStats {
  let totalSeconds = 0
  let done = 0
  let started = 0
  let nextUp: Track | null = null
  for (const t of book.tracks) {
    totalSeconds += t.durationSeconds ?? 0
    const s = trackState(t, progress)
    if (s === 'done') done++
    if (s !== 'new') started++
    if (!nextUp && s !== 'done') nextUp = t
  }
  const count = book.tracks.length
  const state: TrackState = count > 0 && done === count ? 'done' : started > 0 ? 'progress' : 'new'
  return { totalSeconds, done, started, count, state, nextUp }
}
