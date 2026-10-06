import { useEffect, useRef, useState, type CSSProperties } from 'react'
import BookCover from './BookCover'
import { fmtClock, fmtRate } from './format'
import {
  IconBack15,
  IconChevronDown,
  IconClose,
  IconForward30,
  IconMoon,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconRetry,
} from './icons'
import { RATES, useLibrary, type SleepChoice, type SleepState } from './LibraryProvider'
import './library.css'

const SLEEP_CHOICES: { id: SleepChoice; label: string }[] = [
  { id: 'off', label: 'ปิด' },
  { id: 15, label: '15 นาที' },
  { id: 30, label: '30 นาที' },
  { id: 60, label: '60 นาที' },
  { id: 'track', label: 'จบตอน' },
]

function sleepLabel(sleep: SleepState, now: number): string | null {
  if (sleep.kind === 'off') return null
  if (sleep.kind === 'track') return 'จบตอน'
  return fmtClock(Math.max(0, (sleep.endsAt - now) / 1000))
}

function isSleepChoice(sleep: SleepState, id: SleepChoice) {
  if (id === 'off') return sleep.kind === 'off'
  if (id === 'track') return sleep.kind === 'track'
  return sleep.kind === 'time' && sleep.minutes === id
}

export default function PlayerBar({ onOpenBook }: { onOpenBook: (slug: string) => void }) {
  const lib = useLibrary()
  const [menu, setMenu] = useState<'rate' | 'sleep' | null>(null)
  if (!lib.current) return null
  const { track, book, index } = lib.current
  const playing = lib.status === 'playing'
  const busy = lib.status === 'loading' || (lib.buffering && playing)
  const hasNext = index < book.tracks.length - 1
  const sleepText = sleepLabel(lib.sleep, lib.now)

  return (
    <>
      <div className="lib-sq lib-player" role="region" aria-label="ตัวเล่นเสียง">
        <Scrubber variant="bar" />
        <div className="lib-player-row">
          <button className="lib-player-info" onClick={() => lib.setSheetOpen(true)} aria-label={`เปิดตัวเล่นเต็ม: ${track.title}`}>
            <BookCover book={book} size="thumb" />
            <span className="lib-player-text">
              <span className="lib-player-title">{track.title}</span>
              <span className="lib-player-sub">
                {sleepText && (
                  <span className="lib-player-sleep" aria-label={`ตั้งเวลาปิด เหลือ ${sleepText}`}>
                    <IconMoon size={12} />
                    {sleepText}
                  </span>
                )}
                {lib.status === 'error' ? (lib.error ?? 'เล่นไม่ได้') : `ตอน ${index + 1}/${book.tracks.length} · ${book.title}`}
              </span>
            </span>
          </button>

          <div className="lib-player-controls">
            <button className="lib-icon-btn lib-wide-only" onClick={lib.prev} aria-label="ตอนก่อนหน้า หรือกลับต้นตอน">
              <IconPrev />
            </button>
            <button className="lib-icon-btn" onClick={() => lib.skip(-15)} aria-label="ย้อน 15 วินาที">
              <IconBack15 size={26} />
            </button>
            <PlayButton playing={playing} busy={busy} error={lib.status === 'error'} onClick={lib.toggle} />
            <button className="lib-icon-btn" onClick={() => lib.skip(30)} aria-label="ข้ามไป 30 วินาที">
              <IconForward30 size={26} />
            </button>
            <button className="lib-icon-btn lib-wide-only" onClick={lib.next} disabled={!hasNext} aria-label="ตอนถัดไป">
              <IconNext />
            </button>
          </div>

          <div className="lib-player-extras">
            <span className="lib-player-time">
              {fmtClock(lib.position)} / {fmtClock(lib.duration)}
            </span>
            <div className="lib-menu-anchor">
              <button
                className={`lib-ctl${lib.rate !== 1 ? ' is-on' : ''}`}
                onClick={() => setMenu(menu === 'rate' ? null : 'rate')}
                aria-expanded={menu === 'rate'}
                aria-label={`ความเร็ว ${fmtRate(lib.rate)}`}
              >
                {fmtRate(lib.rate)}
              </button>
              {menu === 'rate' && (
                <Popover onClose={() => setMenu(null)} label="ความเร็วในการเล่น">
                  {RATES.map((r) => (
                    <button
                      key={r}
                      className={`lib-menu-item${lib.rate === r ? ' is-on' : ''}`}
                      aria-pressed={lib.rate === r}
                      onClick={() => {
                        lib.setRate(r)
                        setMenu(null)
                      }}
                    >
                      {fmtRate(r)}
                    </button>
                  ))}
                </Popover>
              )}
            </div>
            <div className="lib-menu-anchor">
              <button
                className={`lib-ctl${sleepText ? ' is-on' : ''}`}
                onClick={() => setMenu(menu === 'sleep' ? null : 'sleep')}
                aria-expanded={menu === 'sleep'}
                aria-label={sleepText ? `ตั้งเวลาปิด เหลือ ${sleepText}` : 'ตั้งเวลาปิดเสียง'}
              >
                <IconMoon size={16} />
                {sleepText && <span className="lib-num">{sleepText}</span>}
              </button>
              {menu === 'sleep' && (
                <Popover onClose={() => setMenu(null)} label="ตั้งเวลาปิดเสียง">
                  {SLEEP_CHOICES.map((c) => (
                    <button
                      key={String(c.id)}
                      className={`lib-menu-item${isSleepChoice(lib.sleep, c.id) ? ' is-on' : ''}`}
                      aria-pressed={isSleepChoice(lib.sleep, c.id)}
                      onClick={() => {
                        lib.setSleep(c.id)
                        setMenu(null)
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                </Popover>
              )}
            </div>
            <button className="lib-icon-btn lib-icon-btn-quiet" onClick={lib.close} aria-label="หยุดและปิดตัวเล่น">
              <IconClose size={20} />
            </button>
          </div>
        </div>
      </div>
      {lib.sheetOpen && <PlayerSheet onOpenBook={onOpenBook} />}
    </>
  )
}

function PlayButton({ playing, busy, error, onClick, large }: { playing: boolean; busy: boolean; error: boolean; onClick: () => void; large?: boolean }) {
  return (
    <button
      className={`lib-play${large ? ' lib-play-large' : ''}${busy ? ' is-busy' : ''}`}
      onClick={onClick}
      aria-label={error ? 'ลองเล่นใหม่' : playing ? 'หยุดชั่วคราว' : 'เล่น'}
    >
      {error ? <IconRetry size={large ? 30 : 22} /> : playing ? <IconPause size={large ? 34 : 24} /> : <IconPlay size={large ? 34 : 24} />}
    </button>
  )
}

function Popover({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLButtonElement>('.is-on, button')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  return (
    <div className="lib-popover" ref={ref} role="group" aria-label={label}>
      {children}
    </div>
  )
}

function Scrubber({ variant }: { variant: 'bar' | 'sheet' }) {
  const lib = useLibrary()
  const [drag, setDrag] = useState<number | null>(null)
  const dragging = useRef(false)
  const max = lib.duration > 0 ? lib.duration : 1
  const value = Math.min(drag ?? lib.position, max)
  const pct = (value / max) * 100
  const commit = (v: number) => {
    dragging.current = false
    setDrag(null)
    lib.seekTo(v)
  }
  return (
    <input
      type="range"
      className={`lib-scrub lib-scrub-${variant}`}
      min={0}
      max={max}
      step={1}
      value={value}
      style={{ '--lib-pct': `${pct}%` } as CSSProperties}
      aria-label="ตำแหน่งที่ฟัง"
      aria-valuetext={`${fmtClock(value)} จาก ${fmtClock(lib.duration)}`}
      tabIndex={variant === 'bar' ? -1 : 0}
      onPointerDown={() => {
        dragging.current = true
        setDrag(lib.position)
      }}
      onChange={(e) => {
        const v = Number(e.target.value)
        if (dragging.current) setDrag(v)
        else lib.seekTo(v)
      }}
      onPointerUp={(e) => commit(Number(e.currentTarget.value))}
      onPointerCancel={() => {
        dragging.current = false
        setDrag(null)
      }}
    />
  )
}

function PlayerSheet({ onOpenBook }: { onOpenBook: (slug: string) => void }) {
  const lib = useLibrary()
  const sheetRef = useRef<HTMLDivElement>(null)
  const { setSheetOpen } = lib

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    sheetRef.current?.querySelector<HTMLButtonElement>('.lib-play')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [setSheetOpen])

  if (!lib.current) return null
  const { track, book, shelf, index } = lib.current
  const playing = lib.status === 'playing'
  const busy = lib.status === 'loading' || (lib.buffering && playing)
  const sleepText = sleepLabel(lib.sleep, lib.now)
  const remaining = Math.max(0, lib.duration - lib.position)

  return (
    <div className="lib-sq lib-sheet-backdrop" onClick={() => setSheetOpen(false)}>
      <div
        className="lib-sheet"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={`กำลังเล่น ${track.title}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lib-sheet-top">
          <button className="lib-icon-btn" onClick={() => setSheetOpen(false)} aria-label="ย่อตัวเล่น">
            <IconChevronDown />
          </button>
        </div>

        <div className="lib-sheet-hero">
          <BookCover book={book} size="detail" />
          <div className="lib-sheet-titles">
            <h2 className="lib-sheet-title">{track.title}</h2>
            <p className="lib-head-meta">
              ตอน {index + 1} จาก {book.tracks.length} · {book.title} · ชั้น {shelf.title}
            </p>
            <button
              className="lib-inline-link lib-sheet-booklink"
              onClick={() => {
                setSheetOpen(false)
                onOpenBook(book.slug)
              }}
            >
              ดูทุกตอนในเล่ม
            </button>
          </div>
        </div>

        {lib.status === 'error' && (
          <p className="lib-sheet-error" role="alert">
            {lib.error ?? 'เล่นไม่ได้'}
          </p>
        )}

        <Scrubber variant="sheet" />
        <div className="lib-sheet-times lib-num">
          <span>{fmtClock(lib.position)}</span>
          <span>-{fmtClock(remaining)}</span>
        </div>

        <div className="lib-sheet-controls">
          <button className="lib-icon-btn" onClick={lib.prev} aria-label="ตอนก่อนหน้า หรือกลับต้นตอน">
            <IconPrev size={26} />
          </button>
          <button className="lib-icon-btn" onClick={() => lib.skip(-15)} aria-label="ย้อน 15 วินาที">
            <IconBack15 size={34} />
          </button>
          <PlayButton large playing={playing} busy={busy} error={lib.status === 'error'} onClick={lib.toggle} />
          <button className="lib-icon-btn" onClick={() => lib.skip(30)} aria-label="ข้ามไป 30 วินาที">
            <IconForward30 size={34} />
          </button>
          <button className="lib-icon-btn" onClick={lib.next} disabled={index >= book.tracks.length - 1} aria-label="ตอนถัดไป">
            <IconNext size={26} />
          </button>
        </div>

        <div className="lib-sheet-group">
          <span className="lib-sheet-label" id="lib-rate-label">
            ความเร็ว
          </span>
          <div className="lib-seg" role="group" aria-labelledby="lib-rate-label" style={{ '--lib-cols': RATES.length } as CSSProperties}>
            {RATES.map((r) => (
              <button key={r} className={`lib-seg-item${lib.rate === r ? ' is-on' : ''}`} aria-pressed={lib.rate === r} onClick={() => lib.setRate(r)}>
                {fmtRate(r)}
              </button>
            ))}
          </div>
        </div>

        <div className="lib-sheet-group">
          <span className="lib-sheet-label" id="lib-sleep-label">
            ตั้งเวลาปิด{sleepText ? <span className="lib-sheet-label-value lib-num"> · เหลือ {sleepText}</span> : null}
          </span>
          <div className="lib-seg" role="group" aria-labelledby="lib-sleep-label" style={{ '--lib-cols': SLEEP_CHOICES.length } as CSSProperties}>
            {SLEEP_CHOICES.map((c) => (
              <button
                key={String(c.id)}
                className={`lib-seg-item${isSleepChoice(lib.sleep, c.id) ? ' is-on' : ''}`}
                aria-pressed={isSleepChoice(lib.sleep, c.id)}
                onClick={() => lib.setSleep(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <button className="lib-btn lib-sheet-stop" onClick={lib.close}>
          <IconClose size={18} /> หยุดฟังและปิดตัวเล่น
        </button>

        {lib.syncIssue && <p className="lib-sheet-note">บันทึกตำแหน่งขึ้นคลาวด์ไม่สำเร็จ เก็บไว้ในเครื่องนี้ก่อน จะส่งขึ้นอีกครั้งตอนบันทึกรอบถัดไปหรือเปิดหน้าใหม่</p>}
      </div>
    </div>
  )
}
