import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { fmtBytes, fmtMinutes, fmtPct } from '../format'
import {
  IconBookmark,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconHighlight,
  IconList,
  IconRetry,
  IconSearch,
  IconTextSize,
  IconTrash,
} from '../icons'
import { useLibrary } from '../LibraryProvider'
import type { Book, Bookmark, DocFile, Locator, ReadingProgress } from '../types'
import {
  DEFAULT_PREFS,
  ReaderError,
  type EngineCallbacks,
  type EngineInit,
  type EngineLocation,
  type ReaderEngine,
  type ReaderPrefs,
  type ReaderTheme,
  type SearchHit,
  type TocItem,
} from './engine'
import '../library.css'
import './reader.css'

// ---------- preferences (per device: what is comfortable on a phone differs from a desk) ----------
const PREFS_KEY = 'satoru_library_reader_prefs'

function loadPrefs(): ReaderPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<ReaderPrefs>
    const p = { ...DEFAULT_PREFS, ...raw }
    return {
      theme: (['dark', 'light', 'sepia'] as const).includes(p.theme) ? p.theme : 'dark',
      fontScale: Math.min(2, Math.max(0.8, Number(p.fontScale) || 1)),
      lineHeight: ([1.5, 1.8, 2.1] as const).includes(p.lineHeight) ? p.lineHeight : 1.8,
      flow: p.flow === 'scrolled' ? 'scrolled' : 'paginated',
      systemFont: p.systemFont !== false,
      pdfMode: p.pdfMode === 'page' ? 'page' : 'scroll',
      pdfZoom: Math.min(3, Math.max(0.6, Number(p.pdfZoom) || 1)),
      pdfDim: p.pdfDim !== false,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

function savePrefs(p: ReaderPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    /* private mode: prefs just last for this visit */
  }
}

type Phase =
  | { kind: 'download'; loaded: number; total: number | null }
  | { kind: 'opening' }
  | { kind: 'ready' }
  | { kind: 'error'; title: string; hint: string; detail: string }

type Panel = 'toc' | 'marks' | 'search'

const SAVE_DEBOUNCE_MS = 1500
// After a file opens, the engine settles on the restored position; those first
// relocations are not the reader moving and must not overwrite saved progress.
const SETTLE_MS = 1200

async function readWithProgress(res: Response, onProgress: (loaded: number, total: number | null) => void): Promise<ArrayBuffer> {
  const total = Number(res.headers.get('content-length')) || null
  if (!res.body) return res.arrayBuffer()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    onProgress(loaded, total)
  }
  const out = new Uint8Array(loaded)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out.buffer
}

/** The technical reason behind a friendly error, for the small print. */
function errorDetail(err: unknown): string {
  const cause = err instanceof ReaderError ? err.cause : err
  if (cause instanceof Error) return cause.message
  return cause ? String(cause) : ''
}

const KIND_LABEL: Record<DocFile['kind'], string> = { epub: 'EPUB', pdf: 'PDF', html: 'HTML' }

export default function ReaderView({ file, book, onClose }: { file: DocFile; book: Book; onClose: () => void }) {
  const lib = useLibrary()
  const { backend, saveReadingProgress } = lib
  const [prefs, setPrefsState] = useState(loadPrefs)
  const [phase, setPhase] = useState<Phase>({ kind: 'download', loaded: 0, total: file.sizeBytes })
  const [attempt, setAttempt] = useState(0)
  const [loc, setLoc] = useState<EngineLocation | null>(null)
  const [toc, setToc] = useState<TocItem[]>([])
  const [paged, setPaged] = useState(false)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [chromeHidden, setChromeHidden] = useState(false)
  const [marks, setMarks] = useState<Bookmark[]>([])
  const [marksError, setMarksError] = useState<string | null>(null)
  const [selection, setSelection] = useState('')
  const [scrub, setScrub] = useState<number | null>(null)

  const hostRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<ReaderEngine | null>(null)
  const locRef = useRef<EngineLocation | null>(null)
  const prefsRef = useRef(prefs)
  const pendingRef = useRef<ReadingProgress | null>(null)
  const saveTimer = useRef(0)
  const settleUntil = useRef(Number.POSITIVE_INFINITY)
  const movedRef = useRef(false)
  // Captured once: where to reopen. Later saves must not re-seek the engine.
  const initialRef = useRef<Locator | null>(lib.readingProgress[file.id]?.locator ?? null)
  const hadProgressRef = useRef(!!lib.readingProgress[file.id])
  const saveRef = useRef(saveReadingProgress)
  saveRef.current = saveReadingProgress

  // ---------- page chrome: full screen, Hub floaters out of the way ----------
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('lib-reading')
    return () => root.classList.remove('lib-reading')
  }, [])

  // ---------- progress persistence ----------
  const flush = useCallback(() => {
    window.clearTimeout(saveTimer.current)
    const p = pendingRef.current
    pendingRef.current = null
    if (p) saveRef.current(p)
  }, [])

  const queueSave = useCallback(
    (l: EngineLocation) => {
      pendingRef.current = { fileId: file.id, locator: l.locator, percent: Math.min(100, Math.max(0, l.percent)), updatedAt: new Date().toISOString() }
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS)
    },
    [file.id, flush],
  )

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [flush])

  // ---------- navigation helpers ----------
  const go = useCallback((fn: (e: ReaderEngine) => unknown) => {
    const e = engineRef.current
    if (!e) return
    movedRef.current = true
    void Promise.resolve(fn(e)).catch(() => {})
  }, [])

  const closeOverlays = useCallback(() => {
    setPanel(null)
    setSettingsOpen(false)
  }, [])

  const keyAction = useCallback(
    (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === 'Escape') {
        closeOverlays()
        return
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault?.()
        go((x) => x.next())
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault?.()
        go((x) => x.prev())
      }
    },
    [closeOverlays, go],
  )
  const keyRef = useRef(keyAction)
  keyRef.current = keyAction

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---------- open the file ----------
  const { id: fileId, kind: fileKind, storagePath, sizeBytes } = file
  useEffect(() => {
    if (!backend) return
    let cancelled = false
    const ctrl = new AbortController()
    settleUntil.current = Number.POSITIVE_INFINITY
    setPhase({ kind: 'download', loaded: 0, total: sizeBytes })

    const callbacks: EngineCallbacks = {
      onRelocate(l) {
        if (cancelled) return
        locRef.current = l
        setLoc(l)
        if (performance.now() < settleUntil.current && !movedRef.current) return
        queueSave(l)
      },
      onTap(zone) {
        const e = engineRef.current
        if (zone === 'center' || !e?.paged) {
          setChromeHidden((h) => !h)
          return
        }
        go((x) => (zone === 'left' ? x.prev() : x.next()))
      },
      onKey: (e) => keyRef.current(e),
      onSelection: (text) => setSelection(text),
      onHighlightTap: () => setPanel('marks'),
    }

    ;(async () => {
      let url: string
      try {
        url = await backend.signDocUrl(storagePath)
      } catch (err) {
        throw new ReaderError(
          'ขอลิงก์ไฟล์ไม่สำเร็จ',
          `เช็คอินเทอร์เน็ตแล้วกดลองใหม่ ถ้ายังไม่ได้ ไฟล์อาจยังไม่ได้อัปโหลดขึ้นคลัง ให้รัน npm run library:sync -- --only ${book.slug}`,
          err,
        )
      }
      let res: Response
      try {
        res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' })
      } catch (err) {
        throw new ReaderError('ดาวน์โหลดไฟล์ไม่สำเร็จ', 'เช็คอินเทอร์เน็ตแล้วกดลองใหม่', err)
      }
      if (!res.ok) {
        if (res.status === 404 || res.status === 400) {
          throw new ReaderError('ไม่พบไฟล์นี้ในคลัง', `ไฟล์อาจถูกลบหรือยังไม่ได้อัปโหลด รัน npm run library:sync -- --only ${book.slug} แล้วเปิดใหม่`)
        }
        throw new ReaderError('ดาวน์โหลดไฟล์ไม่สำเร็จ', `คลังไฟล์ตอบกลับ ${res.status} รอสักครู่แล้วกดลองใหม่`)
      }
      const data = await readWithProgress(res, (loaded, total) => {
        if (!cancelled) setPhase({ kind: 'download', loaded, total: total ?? sizeBytes })
      })
      if (cancelled) return
      if (data.byteLength === 0) throw new ReaderError('ไฟล์นี้ว่างเปล่า', 'ไฟล์ในคลังมีขนาด 0 ไบต์ ตรวจไฟล์ต้นฉบับแล้ว sync ใหม่')
      setPhase({ kind: 'opening' })

      let create: (init: EngineInit) => Promise<ReaderEngine>
      try {
        create =
          fileKind === 'epub'
            ? (await import('./epubEngine')).createEpubEngine
            : fileKind === 'pdf'
              ? (await import('./pdfEngine')).createPdfEngine
              : (await import('./htmlEngine')).createHtmlEngine
      } catch (err) {
        throw new ReaderError('โหลดตัวอ่านไม่สำเร็จ', 'ส่วนของตัวอ่านโหลดไม่ขึ้น อาจเพราะออฟไลน์หรือแอปเพิ่งอัปเดต ลองรีเฟรชหน้าแล้วเปิดใหม่', err)
      }
      const host = hostRef.current
      if (!host || cancelled) return
      host.replaceChildren()
      const engine = await create({ container: host, data, prefs: prefsRef.current, initial: initialRef.current, callbacks })
      if (cancelled) {
        engine.destroy()
        return
      }
      engineRef.current = engine
      settleUntil.current = performance.now() + SETTLE_MS
      setToc(engine.toc)
      setPaged(engine.paged)
      setPhase({ kind: 'ready' })
      // First open of this file: record it right away so "continue reading" knows it.
      if (!hadProgressRef.current) {
        window.setTimeout(() => {
          if (cancelled || !engineRef.current || !locRef.current) return
          queueSave(locRef.current)
          hadProgressRef.current = true
        }, SETTLE_MS)
      }
    })().catch((err) => {
      if (cancelled || ctrl.signal.aborted) return
      const e = err instanceof ReaderError ? err : new ReaderError('เปิดไฟล์นี้ไม่ได้', 'กดลองใหม่ ถ้ายังไม่ได้ให้ตรวจไฟล์ต้นฉบับแล้ว sync ใหม่', err)
      hostRef.current?.replaceChildren()
      setPhase({ kind: 'error', title: e.title, hint: e.hint, detail: errorDetail(err) })
    })

    return () => {
      cancelled = true
      ctrl.abort()
      flush()
      engineRef.current?.destroy()
      engineRef.current = null
    }
  }, [attempt, backend, book.slug, fileId, fileKind, storagePath, sizeBytes, flush, go, queueSave])

  // ---------- bookmarks + highlights ----------
  useEffect(() => {
    if (!backend) return
    let cancelled = false
    backend
      .listBookmarks(fileId)
      .then((list) => !cancelled && setMarks(list))
      .catch(() => !cancelled && setMarksError('โหลดที่คั่นไม่สำเร็จ ลองเปิดไฟล์ใหม่อีกครั้ง'))
    return () => {
      cancelled = true
    }
  }, [backend, fileId])

  useEffect(() => {
    if (phase.kind === 'ready') engineRef.current?.showHighlights?.(marks)
  }, [marks, phase.kind])

  const percent = scrub ?? loc?.percent ?? lib.readingProgress[fileId]?.percent ?? 0
  const minutesLeft = useMemo(() => {
    if (!loc) return null
    if (file.estMinutes) return Math.max(0, Math.round(file.estMinutes * (1 - loc.percent / 100)))
    return loc.minutesLeft
  }, [file.estMinutes, loc])

  const here = useMemo(() => {
    if (!loc) return null
    return (
      marks.find((m) => {
        if (m.kind !== 'bookmark') return false
        if (file.kind === 'pdf') return m.locator.page === loc.locator.page
        if (m.locator.cfi && loc.locator.cfi && m.locator.cfi === loc.locator.cfi) return true
        return m.percent != null && Math.abs(m.percent - loc.percent) < (file.kind === 'html' ? 0.6 : 0.15)
      }) ?? null
    )
  }, [file.kind, loc, marks])

  const toggleBookmark = async () => {
    if (!backend || !loc) return
    setMarksError(null)
    try {
      if (here) {
        await backend.deleteBookmark(here.id)
        setMarks((m) => m.filter((x) => x.id !== here.id))
      } else {
        const label = file.kind === 'pdf' && loc.page ? `หน้า ${loc.page.current}${loc.chapter ? ` · ${loc.chapter}` : ''}` : loc.chapter ?? `ตำแหน่ง ${fmtPct(loc.percent)}`
        const bm = await backend.addBookmark({ fileId, kind: 'bookmark', locator: loc.locator, label, excerpt: null, percent: loc.percent })
        setMarks((m) => [...m, bm])
      }
    } catch {
      setMarksError('บันทึกที่คั่นไม่สำเร็จ เช็คอินเทอร์เน็ตแล้วลองใหม่')
    }
  }

  const addHighlight = async () => {
    const e = engineRef.current
    if (!backend || !e?.highlightSelection) return
    const h = e.highlightSelection()
    setSelection('')
    if (!h) return
    try {
      const bm = await backend.addBookmark({ fileId, kind: 'highlight', locator: h.locator, label: loc?.chapter ?? null, excerpt: h.excerpt, percent: h.percent })
      setMarks((m) => [...m, bm])
    } catch {
      setMarksError('บันทึกไฮไลต์ไม่สำเร็จ เช็คอินเทอร์เน็ตแล้วลองใหม่')
    }
  }

  const removeMark = async (m: Bookmark) => {
    if (!backend) return
    try {
      await backend.deleteBookmark(m.id)
      setMarks((list) => list.filter((x) => x.id !== m.id))
    } catch {
      setMarksError('ลบไม่สำเร็จ ลองใหม่อีกครั้ง')
    }
  }

  const jumpTo = (l: Locator) =>
    go((e) => {
      if (l.cfi) return e.goTo(l.cfi)
      if (l.page) return e.goToFraction((l.page - 1 + (l.offset ?? 0)) / (l.pages ?? Math.max(l.page, 1)))
      return e.goToFraction(l.fraction ?? 0)
    })

  // ---------- prefs ----------
  const setPrefs = (patch: Partial<ReaderPrefs>) => {
    const next = { ...prefsRef.current, ...patch }
    prefsRef.current = next
    setPrefsState(next)
    savePrefs(next)
    const e = engineRef.current
    if (e) {
      e.applyPrefs(next)
      setPaged(e.paged)
    }
  }

  // ---------- render ----------
  const chapter = loc?.chapter
  const title = file.title || book.title
  const statusParts = [
    fmtPct(percent),
    loc?.page ? `หน้า ${loc.page.current}/${loc.page.total}` : null,
    minutesLeft != null && percent < 99.5 ? `เหลือราว ${fmtMinutes(minutesLeft)}` : percent >= 99.5 ? 'อ่านจบแล้ว' : null,
  ].filter(Boolean)

  return (
    <div
      className={`lib-sq lib-reader${chromeHidden ? ' is-immersive' : ''}`}
      data-rtheme={prefs.theme}
      role="region"
      aria-label={`อ่าน ${title}`}
    >
      <header className="lib-rd-top">
        <button className="lib-rd-back" onClick={onClose} aria-label={`ออกจากหน้าอ่าน กลับไปที่เล่ม ${book.title}`}>
          <IconChevronLeft size={22} />
          <span className="lib-rd-back-text">กลับ</span>
        </button>
        <div className="lib-rd-titles">
          <span className="lib-rd-title">{title}</span>
          <span className="lib-rd-chapter">{chapter ?? (file.title !== book.title ? book.title : KIND_LABEL[file.kind])}</span>
        </div>
        <div className="lib-rd-tools">
          {file.kind !== 'html' && (
            <ToolButton label="ค้นหาในเล่ม" active={panel === 'search'} onClick={() => setPanel(panel === 'search' ? null : 'search')} disabled={phase.kind !== 'ready'}>
              <IconSearch size={20} />
            </ToolButton>
          )}
          <ToolButton label="สารบัญ" active={panel === 'toc'} onClick={() => setPanel(panel === 'toc' ? null : 'toc')} disabled={phase.kind !== 'ready'}>
            <IconList size={20} />
          </ToolButton>
          <ToolButton
            label={here ? 'เอาที่คั่นตรงนี้ออก' : 'คั่นหน้านี้'}
            active={!!here}
            onClick={toggleBookmark}
            onContextMenu={() => setPanel('marks')}
            disabled={phase.kind !== 'ready' || !loc}
            pressed={!!here}
          >
            <IconBookmark size={20} filled={!!here} />
          </ToolButton>
          <ToolButton label="ตั้งค่าการอ่าน" active={settingsOpen} onClick={() => setSettingsOpen((o) => !o)} expanded={settingsOpen}>
            <IconTextSize size={20} />
          </ToolButton>
        </div>
      </header>

      <div className="lib-rd-stage">
        <div className="lib-rd-host" ref={hostRef} data-kind={file.kind} />
        {phase.kind !== 'ready' && (
          <div className="lib-rd-state">
            {phase.kind === 'download' && (
              <div className="lib-rd-card" role="status" aria-live="polite">
                <p className="lib-rd-card-title">กำลังโหลดไฟล์</p>
                <span className="lib-meter lib-rd-load" aria-hidden="true">
                  <span style={{ width: phase.total ? `${Math.min(100, (phase.loaded / phase.total) * 100)}%` : '35%' }} className={phase.total ? '' : 'is-indeterminate'} />
                </span>
                <p className="lib-rd-card-text lib-num">
                  {phase.total ? `${fmtBytes(phase.loaded) || '0 KB'} จาก ${fmtBytes(phase.total)}` : phase.loaded ? fmtBytes(phase.loaded) : 'กำลังขอลิงก์ไฟล์...'}
                </p>
              </div>
            )}
            {phase.kind === 'opening' && (
              <div className="lib-rd-card" role="status" aria-live="polite">
                <p className="lib-rd-card-title">กำลังจัดหน้า</p>
                <p className="lib-rd-card-text">{initialRef.current ? 'จะเปิดต่อจากตำแหน่งที่อ่านค้างไว้' : 'เปิดครั้งแรก เริ่มจากต้นเล่ม'}</p>
              </div>
            )}
            {phase.kind === 'error' && (
              <div className="lib-rd-card is-error" role="alert">
                <p className="lib-rd-card-title">{phase.title}</p>
                <p className="lib-rd-card-text">{phase.hint}</p>
                {phase.detail && <p className="lib-rd-card-detail">รายละเอียด: {phase.detail}</p>}
                <div className="lib-rd-card-actions">
                  <button className="lib-primary" onClick={() => setAttempt((a) => a + 1)}>
                    <IconRetry size={18} /> ลองใหม่
                  </button>
                  <button className="lib-btn" onClick={onClose}>
                    กลับไปหน้าเล่ม
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {selection && file.kind === 'epub' && phase.kind === 'ready' && (
          <button className="lib-rd-highlight" onClick={addHighlight}>
            <IconHighlight size={18} /> ไฮไลต์ข้อความที่เลือก
          </button>
        )}
      </div>

      <footer className="lib-rd-bottom">
        <div className="lib-rd-progress">
          <input
            type="range"
            className="lib-scrub lib-rd-scrub"
            min={0}
            max={1000}
            step={1}
            value={Math.round(percent * 10)}
            disabled={phase.kind !== 'ready'}
            style={{ '--lib-pct': `${Math.min(100, percent)}%` } as CSSProperties}
            aria-label="ตำแหน่งในเล่ม"
            aria-valuetext={`อ่านไป ${fmtPct(percent)}`}
            onChange={(e) => setScrub(Number(e.target.value) / 10)}
            onPointerUp={(e) => {
              const v = Number(e.currentTarget.value) / 10
              setScrub(null)
              go((x) => x.goToFraction(v / 100))
            }}
            onKeyUp={(e) => {
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) return
              const v = Number(e.currentTarget.value) / 10
              setScrub(null)
              go((x) => x.goToFraction(v / 100))
            }}
          />
        </div>
        <div className="lib-rd-row">
          {paged ? (
            <button className="lib-icon-btn" onClick={() => go((x) => x.prev())} aria-label="หน้าก่อน" disabled={phase.kind !== 'ready'}>
              <IconChevronLeft size={24} />
            </button>
          ) : (
            <span className="lib-rd-spacer" />
          )}
          <p className="lib-rd-status lib-num" aria-live="off">
            <strong>{statusParts[0]}</strong>
            {statusParts.slice(1).map((s) => (
              <span key={s}> · {s}</span>
            ))}
            {lib.syncIssue && <span className="lib-rd-sync"> · บันทึกไว้ในเครื่องก่อน</span>}
          </p>
          {paged ? (
            <button className="lib-icon-btn" onClick={() => go((x) => x.next())} aria-label="หน้าถัดไป" disabled={phase.kind !== 'ready'}>
              <IconChevronRight size={24} />
            </button>
          ) : (
            <span className="lib-rd-spacer" />
          )}
        </div>
      </footer>

      {chromeHidden && (
        <span className="lib-rd-thinbar" aria-hidden="true">
          <span style={{ width: `${Math.min(100, percent)}%` }} />
        </span>
      )}

      {settingsOpen && <SettingsPanel kind={file.kind} prefs={prefs} onChange={setPrefs} onClose={() => setSettingsOpen(false)} />}

      {panel && (
        <SidePanel panel={panel} setPanel={setPanel} onClose={() => setPanel(null)}>
          {panel === 'toc' && (
            <TocList
              items={toc}
              current={chapter ?? null}
              kind={file.kind}
              onPick={(t) => {
                go((e) => e.goTo(t.target))
                setPanel(null)
              }}
            />
          )}
          {panel === 'marks' && (
            <MarksList
              marks={marks}
              error={marksError}
              kind={file.kind}
              onPick={(m) => {
                jumpTo(m.locator)
                setPanel(null)
              }}
              onRemove={removeMark}
            />
          )}
          {panel === 'search' && <SearchBox engine={engineRef.current} onPick={(h) => { go((e) => e.goTo(h.target)); setPanel(null) }} />}
        </SidePanel>
      )}
    </div>
  )
}

function ToolButton({
  label,
  active,
  onClick,
  onContextMenu,
  disabled,
  pressed,
  expanded,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  onContextMenu?: () => void
  disabled?: boolean
  pressed?: boolean
  expanded?: boolean
  children: ReactNode
}) {
  return (
    <button
      className={`lib-icon-btn lib-rd-tool${active ? ' is-on' : ''}`}
      onClick={onClick}
      onContextMenu={
        onContextMenu
          ? (e) => {
              e.preventDefault()
              onContextMenu()
            }
          : undefined
      }
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
    >
      {children}
    </button>
  )
}

// ---------- side panel: contents / bookmarks / search ----------
function SidePanel({ panel, setPanel, onClose, children }: { panel: Panel; setPanel: (p: Panel) => void; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus()
    return () => opener?.focus?.()
  }, [])
  const tabs: { id: Panel; label: string }[] = [
    { id: 'toc', label: 'สารบัญ' },
    { id: 'marks', label: 'ที่คั่น' },
    { id: 'search', label: 'ค้นหา' },
  ]
  return (
    <div className="lib-rd-scrim" onClick={onClose}>
      <aside className="lib-rd-panel" ref={ref} role="dialog" aria-modal="true" aria-label="สารบัญและที่คั่น" onClick={(e) => e.stopPropagation()}>
        <div className="lib-rd-panel-head">
          <div className="lib-seg lib-rd-tabs" role="tablist" style={{ '--lib-cols': 3 } as CSSProperties}>
            {tabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={panel === t.id} className={`lib-seg-item${panel === t.id ? ' is-on' : ''}`} onClick={() => setPanel(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <button className="lib-icon-btn" onClick={onClose} aria-label="ปิดแผง">
            <IconClose size={20} />
          </button>
        </div>
        <div className="lib-rd-panel-body">{children}</div>
      </aside>
    </div>
  )
}

function TocList({ items, current, kind, onPick }: { items: TocItem[]; current: string | null; kind: DocFile['kind']; onPick: (t: TocItem) => void }) {
  if (items.length === 0) {
    return (
      <p className="lib-rd-empty">
        {kind === 'pdf'
          ? 'PDF นี้ไม่มีสารบัญฝังมาในไฟล์ ใช้แถบตำแหน่งด้านล่างหรือค้นหาคำแทนได้'
          : kind === 'html'
            ? 'หน้านี้ไม่มีหัวข้อ h1 ถึง h3 ให้ทำสารบัญ'
            : 'เล่มนี้ไม่มีสารบัญในไฟล์ ใช้แถบตำแหน่งด้านล่างเลื่อนไปได้'}
      </p>
    )
  }
  return (
    <ol className="lib-rd-list">
      {items.map((t, i) => (
        <li key={`${t.target}-${i}`}>
          <button
            className={`lib-rd-item${t.label === current ? ' is-current' : ''}`}
            style={{ '--depth': Math.min(t.depth, 4) } as CSSProperties}
            aria-current={t.label === current ? 'true' : undefined}
            onClick={() => onPick(t)}
          >
            <span className="lib-rd-item-text">{t.label}</span>
            {kind === 'pdf' && <span className="lib-rd-item-meta lib-num">หน้า {t.target.slice(5)}</span>}
          </button>
        </li>
      ))}
    </ol>
  )
}

function MarksList({
  marks,
  error,
  kind,
  onPick,
  onRemove,
}: {
  marks: Bookmark[]
  error: string | null
  kind: DocFile['kind']
  onPick: (m: Bookmark) => void
  onRemove: (m: Bookmark) => void
}) {
  const sorted = [...marks].sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0))
  return (
    <>
      {error && (
        <p className="lib-rd-error" role="alert">
          {error}
        </p>
      )}
      {sorted.length === 0 ? (
        <p className="lib-rd-empty">
          ยังไม่มีที่คั่น กดไอคอนที่คั่นด้านบนเพื่อคั่นหน้าที่อ่านอยู่
          {kind === 'epub' ? ' หรือเลือกข้อความแล้วกด "ไฮไลต์" เพื่อเก็บประโยคที่ชอบ' : ''}
        </p>
      ) : (
        <ul className="lib-rd-list">
          {sorted.map((m) => (
            <li key={m.id} className="lib-rd-mark">
              <button className="lib-rd-item" onClick={() => onPick(m)}>
                <span className="lib-rd-item-kind">{m.kind === 'highlight' ? <IconHighlight size={16} /> : <IconBookmark size={16} filled />}</span>
                <span className="lib-rd-item-text">
                  {m.excerpt ? <span className="lib-rd-excerpt">"{m.excerpt}"</span> : m.label ?? 'ที่คั่น'}
                  <span className="lib-rd-item-meta lib-num">
                    {[m.excerpt ? m.label : null, m.percent != null ? fmtPct(m.percent) : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
              <button className="lib-icon-btn lib-icon-btn-sm lib-rd-remove" onClick={() => onRemove(m)} aria-label={`ลบ${m.kind === 'highlight' ? 'ไฮไลต์' : 'ที่คั่น'}นี้`}>
                <IconTrash size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function SearchBox({ engine, onPick }: { engine: ReaderEngine | null; onPick: (h: SearchHit) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const ctrlRef = useRef<AbortController | null>(null)
  useEffect(
    () => () => {
      ctrlRef.current?.abort()
      engine?.clearSearch?.()
    },
    [engine],
  )
  if (!engine?.search) return <p className="lib-rd-empty">ไฟล์ชนิดนี้ยังค้นหาไม่ได้</p>
  const run = async (e: React.FormEvent) => {
    e.preventDefault()
    const query = q.trim()
    if (!query) return
    ctrlRef.current?.abort()
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    setHits([])
    setState('busy')
    const found: SearchHit[] = []
    let flushAt = 0
    try {
      await engine.search!(
        query,
        (h) => {
          if (found.length >= 200) return
          found.push(h)
          if (performance.now() - flushAt > 120) {
            flushAt = performance.now()
            setHits([...found])
          }
        },
        ctrl.signal,
      )
    } catch {
      /* a failed section just yields fewer hits */
    }
    if (!ctrl.signal.aborted) {
      setHits([...found])
      setState('done')
    }
  }
  return (
    <div className="lib-rd-search">
      <form onSubmit={run} className="lib-rd-search-form" role="search">
        <input
          type="search"
          className="lib-rd-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="พิมพ์คำที่อยากหา"
          aria-label="คำที่ต้องการค้นหาในเล่ม"
          autoFocus
        />
        <button className="lib-btn" type="submit" disabled={!q.trim() || state === 'busy'}>
          ค้นหา
        </button>
      </form>
      <p className="lib-rd-search-status lib-num" aria-live="polite">
        {state === 'busy' ? `กำลังค้นหา... เจอแล้ว ${hits.length}` : state === 'done' ? (hits.length ? `เจอ ${hits.length}${hits.length >= 200 ? '+' : ''} ที่` : 'ไม่เจอคำนี้ในเล่ม') : ''}
      </p>
      {hits.length > 0 && (
        <ul className="lib-rd-list">
          {hits.map((h, i) => (
            <li key={`${h.target}-${i}`}>
              <button className="lib-rd-item" onClick={() => onPick(h)}>
                <span className="lib-rd-item-text">
                  <span className="lib-rd-excerpt">
                    {h.pre}
                    <mark>{h.match}</mark>
                    {h.post}
                  </span>
                  {h.label && <span className="lib-rd-item-meta">{h.label}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------- reading settings ----------
const THEMES: { id: ReaderTheme; label: string }[] = [
  { id: 'dark', label: 'มืด' },
  { id: 'light', label: 'สว่าง' },
  { id: 'sepia', label: 'ซีเปีย' },
]

function SettingsPanel({ kind, prefs, onChange, onClose }: { kind: DocFile['kind']; prefs: ReaderPrefs; onChange: (p: Partial<ReaderPrefs>) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (ref.current?.contains(t) || t.closest?.('.lib-rd-tool[aria-expanded]')) return
      onClose()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [onClose])
  const isPdf = kind === 'pdf'
  const size = isPdf ? prefs.pdfZoom : prefs.fontScale
  const step = (d: number) => {
    const v = Math.round((size + d) * 10) / 10
    if (isPdf) onChange({ pdfZoom: Math.min(3, Math.max(0.6, v)) })
    else onChange({ fontScale: Math.min(2, Math.max(0.8, v)) })
  }
  return (
    <div className="lib-rd-settings" ref={ref} role="dialog" aria-label="ตั้งค่าการอ่าน">
      <div className="lib-sheet-group">
        <span className="lib-sheet-label" id="rd-size">
          {isPdf ? 'ขนาดหน้า' : 'ขนาดตัวอักษร'}
        </span>
        <div className="lib-rd-stepper" role="group" aria-labelledby="rd-size">
          <button className="lib-ctl" onClick={() => step(-0.1)} disabled={size <= (isPdf ? 0.6 : 0.8)} aria-label="เล็กลง">
            {isPdf ? '−' : <span className="lib-rd-a-small">ก</span>}
          </button>
          <span className="lib-rd-stepper-value lib-num" aria-live="polite">
            {Math.round(size * 100)}%
          </span>
          <button className="lib-ctl" onClick={() => step(0.1)} disabled={size >= (isPdf ? 3 : 2)} aria-label="ใหญ่ขึ้น">
            {isPdf ? '+' : <span className="lib-rd-a-large">ก</span>}
          </button>
        </div>
      </div>

      {kind === 'epub' && (
        <SegGroup
          label="ระยะบรรทัด"
          options={[
            { id: 1.5, label: 'ชิด' },
            { id: 1.8, label: 'ปกติ' },
            { id: 2.1, label: 'โปร่ง' },
          ]}
          value={prefs.lineHeight}
          onPick={(v) => onChange({ lineHeight: v as ReaderPrefs['lineHeight'] })}
        />
      )}

      <div className="lib-sheet-group">
        <span className="lib-sheet-label" id="rd-theme">
          ธีมการอ่าน{kind === 'html' ? ' (หน้าสรุปใช้สีของตัวเอง ธีมเปลี่ยนเฉพาะกรอบ)' : ''}
        </span>
        <div className="lib-rd-themes" role="group" aria-labelledby="rd-theme">
          {THEMES.map((t) => (
            <button key={t.id} className={`lib-rd-theme${prefs.theme === t.id ? ' is-on' : ''}`} data-swatch={t.id} aria-pressed={prefs.theme === t.id} onClick={() => onChange({ theme: t.id })}>
              <span className="lib-rd-swatch" aria-hidden="true">
                ก
              </span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {kind === 'epub' && (
        <>
          <SegGroup
            label="การจัดหน้า"
            options={[
              { id: 'paginated', label: 'พลิกทีละหน้า' },
              { id: 'scrolled', label: 'เลื่อนยาว' },
            ]}
            value={prefs.flow}
            onPick={(v) => onChange({ flow: v as ReaderPrefs['flow'] })}
          />
          <SegGroup
            label="ฟอนต์"
            options={[
              { id: 'system', label: 'ฟอนต์ระบบ' },
              { id: 'book', label: 'ตามเล่ม' },
            ]}
            value={prefs.systemFont ? 'system' : 'book'}
            onPick={(v) => onChange({ systemFont: v === 'system' })}
          />
        </>
      )}

      {isPdf && (
        <>
          <SegGroup
            label="การจัดหน้า"
            options={[
              { id: 'scroll', label: 'เลื่อนต่อเนื่อง' },
              { id: 'page', label: 'ทีละหน้า' },
            ]}
            value={prefs.pdfMode}
            onPick={(v) => onChange({ pdfMode: v as ReaderPrefs['pdfMode'] })}
          />
          {prefs.theme === 'dark' && (
            <SegGroup
              label="สีหน้ากระดาษในธีมมืด"
              options={[
                { id: 'dim', label: 'กลับสีให้มืด' },
                { id: 'paper', label: 'สีเดิม' },
              ]}
              value={prefs.pdfDim ? 'dim' : 'paper'}
              onPick={(v) => onChange({ pdfDim: v === 'dim' })}
            />
          )}
        </>
      )}
    </div>
  )
}

function SegGroup<T extends string | number>({ label, options, value, onPick }: { label: string; options: { id: T; label: string }[]; value: T; onPick: (v: T) => void }) {
  const id = `rd-seg-${label}`
  return (
    <div className="lib-sheet-group">
      <span className="lib-sheet-label" id={id}>
        {label}
      </span>
      <div className="lib-seg" role="group" aria-labelledby={id} style={{ '--lib-cols': options.length } as CSSProperties}>
        {options.map((o) => (
          <button key={String(o.id)} className={`lib-seg-item${value === o.id ? ' is-on' : ''}`} aria-pressed={value === o.id} onClick={() => onPick(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
