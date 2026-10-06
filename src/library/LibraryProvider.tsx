import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Book, LibraryBackend, Progress, Shelf, SignedUrl, Track } from './types'
import { coverArtworkUrl } from './artwork'

export const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const
export type SleepChoice = 'off' | 15 | 30 | 60 | 'track'
export type SleepState = { kind: 'off' } | { kind: 'time'; endsAt: number; minutes: number } | { kind: 'track' }
export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'
export type CatalogState = { status: 'loading' | 'ready' | 'error'; shelves: Shelf[]; error: string | null }
export type Located = { track: Track; book: Book; shelf: Shelf; index: number }

type LibraryContextValue = {
  backendKind: LibraryBackend['kind'] | null
  catalog: CatalogState
  reload: () => void
  progress: Record<string, Progress>
  locate: (trackId: string) => Located | null
  lastPlayed: Located | null
  current: Located | null
  status: PlayerStatus
  buffering: boolean
  position: number
  duration: number
  rate: number
  error: string | null
  syncIssue: boolean
  sleep: SleepState
  now: number
  sheetOpen: boolean
  setSheetOpen: (open: boolean) => void
  playTrack: (trackId: string, opts?: { fromStart?: boolean; at?: number }) => void
  toggle: () => void
  seekTo: (seconds: number) => void
  skip: (delta: number) => void
  next: () => void
  prev: () => void
  setRate: (rate: number) => void
  setSleep: (choice: SleepChoice) => void
  close: () => void
  prepareBook: (book: Book) => void
}

const LibraryContext = createContext<LibraryContextValue | null>(null)

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext)
  if (!ctx) throw new Error('useLibrary must be used inside <LibraryProvider>')
  return ctx
}

export function useOptionalLibrary(): LibraryContextValue | null {
  return useContext(LibraryContext)
}

const RATE_KEY = 'satoru_library_rate'
const DISMISS_KEY = 'satoru_library_dismissed'
const cacheKey = (kind: string) => `satoru_library_progress_${kind}`
const SAVE_EVERY_MS = 5000
const RESIGN_MARGIN_MS = 10 * 60 * 1000
const FADE_MS = 6000

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or blocked: the database copy still exists */
  }
}

function storedRate(): number {
  const v = Number(readJson<number>(RATE_KEY, 1))
  return (RATES as readonly number[]).includes(v) ? v : 1
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export function LibraryProvider({ backend, children }: { backend: LibraryBackend | null; children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading', shelves: [], error: null })
  const [progress, setProgress] = useState<Record<string, Progress>>({})
  const [current, setCurrent] = useState<Located | null>(null)
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [buffering, setBuffering] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [rate, setRateState] = useState(storedRate)
  const [error, setError] = useState<string | null>(null)
  const [syncIssue, setSyncIssue] = useState(false)
  const [sleep, setSleepState] = useState<SleepState>({ kind: 'off' })
  const [now, setNow] = useState(() => Date.now())
  const [sheetOpen, setSheetOpen] = useState(false)

  const progressRef = useRef(progress)
  const currentRef = useRef<Located | null>(null)
  const rateRef = useRef(rate)
  const sleepRef = useRef(sleep)
  const positionRef = useRef(0)
  // last real playback second of the loaded file; survives a src swap or error reset
  const lastGoodTimeRef = useRef(0)
  const urlCache = useRef(new Map<string, SignedUrl>())
  const loadedPathRef = useRef<string | null>(null)
  const pendingSeekRef = useRef<number | null>(null)
  const wantPlayRef = useRef(false)
  const retryRef = useRef(0)
  const lastSaveRef = useRef(0)
  const restoredRef = useRef(false)
  const fadeRef = useRef<number | null>(null)
  sleepRef.current = sleep

  // ---------- catalog + progress ----------
  const load = useCallback(async () => {
    if (!backend) return
    setCatalog((c) => ({ ...c, status: 'loading', error: null }))
    try {
      const [shelves, remote] = await Promise.all([backend.loadCatalog(), backend.loadProgress()])
      const local = readJson<Record<string, Progress>>(cacheKey(backend.kind), {})
      const merged: Record<string, Progress> = {}
      for (const p of remote) merged[p.trackId] = p
      const toPush: Progress[] = []
      for (const p of Object.values(local)) {
        const r = merged[p.trackId]
        // A local copy only wins when it is clearly newer, e.g. the tab closed
        // before the last save reached the database.
        if (!r || Date.parse(p.updatedAt) > Date.parse(r.updatedAt) + 1000) {
          merged[p.trackId] = p
          toPush.push(p)
        }
      }
      progressRef.current = merged
      setProgress(merged)
      writeJson(cacheKey(backend.kind), merged)
      setCatalog({ status: 'ready', shelves, error: null })
      for (const p of toPush) backend.saveProgress(p).catch(() => setSyncIssue(true))
    } catch (err) {
      setCatalog({ status: 'error', shelves: [], error: errorText(err) })
    }
  }, [backend])

  useEffect(() => {
    load()
  }, [load])

  const index = useMemo(() => {
    const map = new Map<string, Located>()
    for (const shelf of catalog.shelves)
      for (const book of shelf.books) book.tracks.forEach((track, i) => map.set(track.id, { track, book, shelf, index: i }))
    return map
  }, [catalog.shelves])
  const indexRef = useRef(index)
  indexRef.current = index

  const locate = useCallback((trackId: string) => indexRef.current.get(trackId) ?? null, [])

  const lastPlayed = useMemo<Located | null>(() => {
    let best: Progress | null = null
    for (const p of Object.values(progress)) {
      if (!index.has(p.trackId)) continue
      if (!best || p.updatedAt > best.updatedAt) best = p
    }
    if (!best) return null
    const loc = index.get(best.trackId)!
    if (!best.completed) return loc
    const following = loc.book.tracks.slice(loc.index + 1).find((t) => !progress[t.id]?.completed)
    return following ? index.get(following.id)! : loc
  }, [progress, index])

  // ---------- signed URLs ----------
  const ensureUrls = useCallback(
    async (paths: string[], force = false) => {
      if (!backend) return paths.map(() => undefined)
      const need = paths.filter((p) => {
        const c = urlCache.current.get(p)
        return force || !c || c.expiresAt - Date.now() < RESIGN_MARGIN_MS
      })
      if (need.length) {
        const signed = await backend.signUrls(need)
        for (const [k, v] of Object.entries(signed)) urlCache.current.set(k, v)
      }
      return paths.map((p) => urlCache.current.get(p))
    },
    [backend],
  )

  const freshUrl = useCallback((path: string) => {
    const c = urlCache.current.get(path)
    return c && c.expiresAt - Date.now() > 60_000 ? c.url : null
  }, [])

  // ---------- progress persistence ----------
  const persist = useCallback(
    (trackId: string, pos: number, completed?: boolean) => {
      if (!backend || !Number.isFinite(pos)) return
      const loc = indexRef.current.get(trackId)
      const dur = loc?.track.durationSeconds ?? audioRef.current?.duration ?? 0
      const done = completed ?? (dur > 0 && pos >= dur - 3)
      const p: Progress = { trackId, positionSeconds: Math.max(0, pos), completed: done, updatedAt: new Date().toISOString() }
      const nextMap = { ...progressRef.current, [trackId]: p }
      progressRef.current = nextMap
      setProgress(nextMap)
      writeJson(cacheKey(backend.kind), nextMap)
      lastSaveRef.current = Date.now()
      backend
        .saveProgress(p)
        .then(() => setSyncIssue(false))
        .catch(() => setSyncIssue(true))
    },
    [backend],
  )

  const persistCurrent = useCallback(() => {
    const a = audioRef.current
    const loc = currentRef.current
    if (!a || !loc || loadedPathRef.current !== loc.track.audioPath) return
    if (a.currentTime > 0 && !a.ended) persist(loc.track.id, a.currentTime)
  }, [persist])

  // ---------- media session ----------
  const updatePositionState = useCallback(() => {
    const a = audioRef.current
    const ms = navigator.mediaSession
    if (!a || !ms?.setPositionState || !Number.isFinite(a.duration) || a.duration <= 0) return
    try {
      ms.setPositionState({ duration: a.duration, playbackRate: a.playbackRate, position: Math.min(a.currentTime, a.duration) })
    } catch {
      /* some browsers reject transient states */
    }
  }, [])

  const setMetadata = useCallback((loc: Located | null) => {
    if (!('mediaSession' in navigator)) return
    if (!loc) {
      navigator.mediaSession.metadata = null
      return
    }
    const art = coverArtworkUrl(loc.book)
    navigator.mediaSession.metadata = new MediaMetadata({
      title: loc.track.title,
      artist: loc.book.title,
      album: loc.shelf.title,
      artwork: art ? [{ src: art, sizes: '512x512', type: 'image/png' }] : [],
    })
  }, [])

  // ---------- playback ----------
  const fail = useCallback((err: unknown) => {
    wantPlayRef.current = false
    setStatus('error')
    setBuffering(false)
    setError(errorText(err))
  }, [])

  const startAudio = useCallback(
    (loc: Located, url: string, start: number, autoplay: boolean) => {
      const a = audioRef.current
      if (!a) return
      pendingSeekRef.current = start > 0.5 ? start : null
      loadedPathRef.current = loc.track.audioPath
      // #t= lets the browser fetch from the right byte range straight away;
      // loadedmetadata below corrects it if the fragment was ignored.
      a.src = start > 0.5 ? `${url}#t=${start.toFixed(1)}` : url
      a.defaultPlaybackRate = rateRef.current
      a.playbackRate = rateRef.current
      positionRef.current = start
      lastGoodTimeRef.current = start
      setPosition(start)
      setDuration(loc.track.durationSeconds ?? 0)
      wantPlayRef.current = autoplay
      if (autoplay) {
        setStatus('loading')
        a.play().catch((err: DOMException) => {
          if (err.name === 'NotAllowedError') {
            wantPlayRef.current = false
            setStatus('paused')
          } else if (err.name !== 'AbortError') {
            // Network failures surface through the media `error` event, which
            // owns the re-sign retry. Nothing to do here.
          }
        })
      } else {
        setStatus('paused')
      }
    },
    [],
  )

  const playTrack = useCallback(
    (trackId: string, opts?: { fromStart?: boolean; at?: number }) => {
      const loc = indexRef.current.get(trackId)
      if (!loc || !audioRef.current) return
      if (currentRef.current && currentRef.current.track.id !== trackId) persistCurrent()
      if (fadeRef.current) {
        window.clearInterval(fadeRef.current)
        fadeRef.current = null
        audioRef.current.volume = 1
      }
      const p = progressRef.current[trackId]
      const start = opts?.fromStart
        ? 0
        : opts?.at ?? (p && !p.completed && p.positionSeconds > 3 ? Math.max(0, p.positionSeconds - 2) : 0)
      currentRef.current = loc
      setCurrent(loc)
      setError(null)
      retryRef.current = 0
      try {
        localStorage.removeItem(DISMISS_KEY)
      } catch {
        /* ignore */
      }
      setMetadata(loc)
      const url = freshUrl(loc.track.audioPath)
      if (url) {
        // Synchronous path keeps the tap's user activation, which iOS needs.
        startAudio(loc, url, start, true)
      } else {
        setStatus('loading')
        positionRef.current = start
        setPosition(start)
        ensureUrls([loc.track.audioPath], true)
          .then(([signed]) => {
            if (currentRef.current?.track.id !== trackId) return
            if (!signed) throw new Error('ขอลิงก์เสียงไม่สำเร็จ ไฟล์อาจยังไม่ได้อัปโหลด')
            startAudio(loc, signed.url, start, true)
          })
          .catch(fail)
      }
      ensureUrls(loc.book.tracks.map((t) => t.audioPath)).catch(() => {})
    },
    [ensureUrls, fail, freshUrl, persistCurrent, setMetadata, startAudio],
  )

  const toggle = useCallback(() => {
    const a = audioRef.current
    const loc = currentRef.current
    if (!a || !loc) return
    const loaded = loadedPathRef.current === loc.track.audioPath && !!a.getAttribute('src')
    if (!loaded || status === 'error') {
      playTrack(loc.track.id, { at: positionRef.current })
      return
    }
    if (a.ended) {
      // Stopped at the end (e.g. "sleep after this track"): play means carry on.
      const following = loc.book.tracks[loc.index + 1]
      playTrack(following ? following.id : loc.track.id, following ? undefined : { fromStart: true })
      return
    }
    if (a.paused) {
      if (!freshUrl(loc.track.audioPath)) {
        playTrack(loc.track.id, { at: a.currentTime })
        return
      }
      wantPlayRef.current = true
      a.play().catch(() => {})
    } else {
      wantPlayRef.current = false
      a.pause()
    }
  }, [freshUrl, playTrack, status])

  const seekTo = useCallback(
    (seconds: number) => {
      const a = audioRef.current
      const loc = currentRef.current
      if (!a || !loc) return
      const max = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : loc.track.durationSeconds ?? seconds
      const t = Math.min(Math.max(0, seconds), Math.max(0, max - 0.25))
      positionRef.current = t
      lastGoodTimeRef.current = t
      setPosition(t)
      if (loadedPathRef.current === loc.track.audioPath && a.getAttribute('src')) {
        a.currentTime = t
      } else {
        persist(loc.track.id, t)
      }
    },
    [persist],
  )

  const skip = useCallback((delta: number) => seekTo(positionRef.current + delta), [seekTo])

  const next = useCallback(() => {
    const loc = currentRef.current
    const following = loc?.book.tracks[loc.index + 1]
    if (following) playTrack(following.id)
  }, [playTrack])

  const prev = useCallback(() => {
    const loc = currentRef.current
    if (!loc) return
    if (positionRef.current > 5) {
      seekTo(0)
      return
    }
    const before = loc.book.tracks[loc.index - 1]
    if (before) playTrack(before.id, { fromStart: true })
    else seekTo(0)
  }, [playTrack, seekTo])

  const setRate = useCallback(
    (r: number) => {
      rateRef.current = r
      setRateState(r)
      writeJson(RATE_KEY, r)
      const a = audioRef.current
      if (a) {
        a.defaultPlaybackRate = r
        a.playbackRate = r
      }
      updatePositionState()
    },
    [updatePositionState],
  )

  const fadeAndPause = useCallback(() => {
    const a = audioRef.current
    if (!a || a.paused) return
    const startVol = a.volume || 1
    const steps = 30
    let step = 0
    if (fadeRef.current) window.clearInterval(fadeRef.current)
    fadeRef.current = window.setInterval(() => {
      step++
      a.volume = Math.max(0, startVol * (1 - step / steps))
      if (step >= steps) {
        if (fadeRef.current) window.clearInterval(fadeRef.current)
        fadeRef.current = null
        wantPlayRef.current = false
        a.pause()
        a.volume = startVol
      }
    }, FADE_MS / steps)
  }, [])

  const setSleep = useCallback((choice: SleepChoice) => {
    if (choice === 'off') setSleepState({ kind: 'off' })
    else if (choice === 'track') setSleepState({ kind: 'track' })
    else setSleepState({ kind: 'time', endsAt: Date.now() + choice * 60_000, minutes: choice })
    setNow(Date.now())
  }, [])

  useEffect(() => {
    if (sleep.kind !== 'time') return
    const id = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= sleep.endsAt) {
        window.clearInterval(id)
        setSleepState({ kind: 'off' })
        fadeAndPause()
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [sleep, fadeAndPause])

  const close = useCallback(() => {
    const a = audioRef.current
    persistCurrent()
    const loc = currentRef.current
    if (loc) writeJson(DISMISS_KEY, loc.track.id)
    wantPlayRef.current = false
    if (a) {
      a.pause()
      a.removeAttribute('src')
      a.load()
    }
    loadedPathRef.current = null
    currentRef.current = null
    setCurrent(null)
    setStatus('idle')
    setError(null)
    setSleepState({ kind: 'off' })
    setSheetOpen(false)
    setMetadata(null)
  }, [persistCurrent, setMetadata])

  const prepareBook = useCallback(
    (book: Book) => {
      ensureUrls(book.tracks.map((t) => t.audioPath)).catch(() => {})
    },
    [ensureUrls],
  )

  // Restore the last listened track (paused) once the catalog arrives, so
  // opening the Hub puts "continue" one tap away.
  useEffect(() => {
    if (restoredRef.current || catalog.status !== 'ready') return
    restoredRef.current = true
    if (currentRef.current || !lastPlayed) return
    if (readJson<string | null>(DISMISS_KEY, null) === lastPlayed.track.id) return
    const p = progressRef.current[lastPlayed.track.id]
    const at = p && !p.completed && p.positionSeconds > 3 ? Math.max(0, p.positionSeconds - 2) : 0
    currentRef.current = lastPlayed
    setCurrent(lastPlayed)
    positionRef.current = at
    setPosition(at)
    setDuration(lastPlayed.track.durationSeconds ?? 0)
    setStatus('idle')
    setMetadata(lastPlayed)
    ensureUrls(lastPlayed.book.tracks.map((t) => t.audioPath)).catch(() => {})
  }, [catalog.status, lastPlayed, ensureUrls, setMetadata])

  // ---------- audio element events ----------
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onLoadedMeta = () => {
      setDuration(a.duration)
      const want = pendingSeekRef.current
      if (want != null && Math.abs(a.currentTime - want) > 1.5) a.currentTime = want
      pendingSeekRef.current = null
      a.playbackRate = rateRef.current
      updatePositionState()
    }
    const onTime = () => {
      if (a.currentTime > 0) lastGoodTimeRef.current = a.currentTime
      else if (pendingSeekRef.current != null || a.error) return
      positionRef.current = a.currentTime
      setPosition(a.currentTime)
      if (!a.paused && Date.now() - lastSaveRef.current > SAVE_EVERY_MS) persistCurrent()
    }
    const onPlaying = () => {
      setStatus('playing')
      setBuffering(false)
      retryRef.current = 0
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
      updatePositionState()
    }
    const onPause = () => {
      if (a.ended) return
      setStatus((s) => (s === 'error' ? s : 'paused'))
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
      persistCurrent()
      updatePositionState()
    }
    const onWaiting = () => setBuffering(true)
    const onCanPlay = () => setBuffering(false)
    const onSeeked = () => {
      updatePositionState()
      if (a.paused) persistCurrent()
    }
    const onEnded = () => {
      const loc = currentRef.current
      if (!loc) return
      persist(loc.track.id, a.duration || loc.track.durationSeconds || 0, true)
      if (sleepRef.current.kind === 'track') {
        setSleepState({ kind: 'off' })
        wantPlayRef.current = false
        setStatus('paused')
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
        return
      }
      const following = loc.book.tracks[loc.index + 1]
      if (following) playTrack(following.id)
      else {
        wantPlayRef.current = false
        setStatus('paused')
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
      }
    }
    const onError = () => {
      const loc = currentRef.current
      if (!loc || !a.getAttribute('src')) return
      const code = a.error?.code
      if (retryRef.current < 2) {
        // Most often the signed URL expired mid-listen (or the network blinked):
        // sign a fresh one and continue from the same second.
        retryRef.current++
        const at = a.currentTime > 0 ? a.currentTime : Math.max(lastGoodTimeRef.current, pendingSeekRef.current ?? 0)
        const resume = wantPlayRef.current || !a.paused
        urlCache.current.delete(loc.track.audioPath)
        setBuffering(true)
        ensureUrls([loc.track.audioPath], true)
          .then(([signed]) => {
            if (currentRef.current?.track.id !== loc.track.id) return
            if (!signed) throw new Error('ขอลิงก์เสียงใหม่ไม่สำเร็จ')
            startAudio(loc, signed.url, at, resume)
          })
          .catch(fail)
        return
      }
      fail(
        new Error(
          code === 4 ? 'เปิดไฟล์เสียงนี้ไม่ได้ ไฟล์อาจหายจากคลังหรือรูปแบบไม่รองรับ' : 'โหลดเสียงไม่สำเร็จ เช็คอินเทอร์เน็ตแล้วกดลองใหม่',
        ),
      )
    }
    const onRate = () => updatePositionState()

    a.addEventListener('loadedmetadata', onLoadedMeta)
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('playing', onPlaying)
    a.addEventListener('pause', onPause)
    a.addEventListener('waiting', onWaiting)
    a.addEventListener('canplay', onCanPlay)
    a.addEventListener('seeked', onSeeked)
    a.addEventListener('ended', onEnded)
    a.addEventListener('error', onError)
    a.addEventListener('ratechange', onRate)
    return () => {
      a.removeEventListener('loadedmetadata', onLoadedMeta)
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('playing', onPlaying)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('waiting', onWaiting)
      a.removeEventListener('canplay', onCanPlay)
      a.removeEventListener('seeked', onSeeked)
      a.removeEventListener('ended', onEnded)
      a.removeEventListener('error', onError)
      a.removeEventListener('ratechange', onRate)
    }
  }, [ensureUrls, fail, persist, persistCurrent, playTrack, startAudio, updatePositionState])

  // Media Session action handlers: lock screen, notification shade, headset buttons.
  const actions = useRef({ toggle, skip, seekTo, next, prev, close })
  actions.current = { toggle, skip, seekTo, next, prev, close }
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler)
      } catch {
        /* action not supported on this platform */
      }
    }
    set('play', () => {
      const a = audioRef.current
      if (a?.paused) actions.current.toggle()
    })
    set('pause', () => {
      const a = audioRef.current
      if (a && !a.paused) actions.current.toggle()
    })
    set('stop', () => actions.current.close())
    set('seekbackward', (d) => actions.current.skip(-(d.seekOffset ?? 15)))
    set('seekforward', (d) => actions.current.skip(d.seekOffset ?? 30))
    set('seekto', (d) => {
      if (d.seekTime != null) actions.current.seekTo(d.seekTime)
    })
    set('previoustrack', () => actions.current.prev())
    set('nexttrack', () => actions.current.next())
    return () => {
      for (const a of ['play', 'pause', 'stop', 'seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack'] as MediaSessionAction[])
        set(a, null)
    }
  }, [])

  // Save when the tab hides or closes (phone lock, app switch, window close).
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') persistCurrent()
    }
    window.addEventListener('pagehide', persistCurrent)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', persistCurrent)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [persistCurrent])

  // Space toggles playback when focus is not in a control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && t.closest('input, textarea, select, button, a, [contenteditable="true"], iframe')) return
      if (!currentRef.current) return
      e.preventDefault()
      actions.current.toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Lets the rest of the Hub make room for the fixed player bar.
  useEffect(() => {
    document.documentElement.classList.toggle('lib-has-player', !!current)
    return () => document.documentElement.classList.remove('lib-has-player')
  }, [current])

  const value = useMemo<LibraryContextValue>(
    () => ({
      backendKind: backend?.kind ?? null,
      catalog,
      reload: load,
      progress,
      locate,
      lastPlayed,
      current,
      status,
      buffering,
      position,
      duration: duration || current?.track.durationSeconds || 0,
      rate,
      error,
      syncIssue,
      sleep,
      now,
      sheetOpen,
      setSheetOpen,
      playTrack,
      toggle,
      seekTo,
      skip,
      next,
      prev,
      setRate,
      setSleep,
      close,
      prepareBook,
    }),
    [backend, catalog, load, progress, locate, lastPlayed, current, status, buffering, position, duration, rate, error, syncIssue, sleep, now, sheetOpen, playTrack, toggle, seekTo, skip, next, prev, setRate, setSleep, close, prepareBook],
  )

  return (
    <LibraryContext.Provider value={value}>
      {children}
      {/* One element for the whole session: survives every view change. */}
      <audio ref={audioRef} preload="metadata" />
    </LibraryContext.Provider>
  )
}
