import type { Book, Progress, Track } from './types'

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
