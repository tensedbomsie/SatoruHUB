import { useEffect } from 'react'
import BookCover from './BookCover'
import { fmtClock, fmtLength } from './format'
import { IconCheck, IconChevronRight, IconPause, IconPlay, IconRetry } from './icons'
import { useLibrary } from './LibraryProvider'
import type { LibraryRoute } from './route'
import { bookStats, trackState, type TrackState } from './stats'
import type { Book, Shelf } from './types'
import './library.css'

type Nav = (route: LibraryRoute | null) => void

const SYNC_HINT = 'npm run library:sync'
const CATALOG_HINT = 'scripts/library/catalog.json'

export default function LibraryView({ route, navigate }: { route: LibraryRoute; navigate: Nav }) {
  // Paint the Squircle ground behind the whole route (and calm the Hub
  // toolbar to match) only while the Library is on screen.
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('lib-route')
    return () => root.classList.remove('lib-route')
  }, [])

  return (
    <div className="lib-sq lib-root">
      <LibraryBody route={route} navigate={navigate} />
    </div>
  )
}

function LibraryBody({ route, navigate }: { route: LibraryRoute; navigate: Nav }) {
  const lib = useLibrary()
  const { catalog } = lib

  if (catalog.status === 'loading' && catalog.shelves.length === 0) return <LibrarySkeleton />

  if (catalog.status === 'error') {
    return (
      <div className="lib-page">
        <div className="lib-state" role="alert">
          <h1 className="lib-state-title">เปิดห้องสมุดไม่สำเร็จ</h1>
          <p className="lib-state-text">ระบบตอบกลับว่า: {catalog.error}</p>
          <p className="lib-state-text">ถ้าเพิ่งตั้งค่าครั้งแรก ให้เช็คว่า migration ของ Library ถูก apply แล้ว</p>
          <button className="lib-btn" onClick={lib.reload}>
            <IconRetry size={18} /> ลองโหลดใหม่
          </button>
        </div>
      </div>
    )
  }

  if (catalog.shelves.length === 0) {
    return (
      <div className="lib-page">
        <div className="lib-state">
          <h1 className="lib-state-title">ห้องสมุดยังไม่มีชั้นหนังสือ</h1>
          <p className="lib-state-text">
            ใส่ชั้น เล่ม และตอนใน <code>{CATALOG_HINT}</code> แล้วรัน <code>{SYNC_HINT}</code> ไฟล์เสียงจะขึ้นคลังส่วนตัวและโผล่ที่นี่เอง
          </p>
        </div>
      </div>
    )
  }

  if (route.kind === 'book') {
    const found = findBook(catalog.shelves, route.slug)
    if (!found) return <NotFound navigate={navigate} what="เล่มนี้" />
    return <BookPage book={found.book} shelf={found.shelf} navigate={navigate} />
  }
  if (route.kind === 'shelf') {
    const shelf = catalog.shelves.find((s) => s.slug === route.slug)
    if (!shelf) return <NotFound navigate={navigate} what="ชั้นนี้" />
    return <ShelfPage shelf={shelf} navigate={navigate} />
  }
  return <Bookcase shelves={catalog.shelves} navigate={navigate} />
}

function findBook(shelves: Shelf[], slug: string) {
  for (const shelf of shelves) {
    const book = shelf.books.find((b) => b.slug === slug)
    if (book) return { shelf, book }
  }
  return null
}

function NotFound({ navigate, what }: { navigate: Nav; what: string }) {
  return (
    <div className="lib-page">
      <div className="lib-state">
        <h1 className="lib-state-title">ไม่พบ{what}ในห้องสมุด</h1>
        <p className="lib-state-text">อาจถูกย้ายหรือเปลี่ยนชื่อใน catalog แล้ว</p>
        <button className="lib-btn" onClick={() => navigate({ kind: 'home' })}>
          กลับไปที่ชั้นหนังสือ
        </button>
      </div>
    </div>
  )
}

// ---------- bookcase ----------
function Bookcase({ shelves, navigate }: { shelves: Shelf[]; navigate: Nav }) {
  const books = shelves.reduce((n, s) => n + s.books.length, 0)
  const seconds = shelves.reduce(
    (n, s) => n + s.books.reduce((m, b) => m + b.tracks.reduce((k, t) => k + (t.durationSeconds ?? 0), 0), 0),
    0,
  )
  return (
    <div className="lib-page fade-in">
      <header className="lib-head">
        <h1 className="lib-title">ห้องสมุดเสียง</h1>
        <p className="lib-head-meta lib-num">
          {shelves.length} ชั้น · {books} เล่ม{seconds > 0 ? ` · ฟังรวม ${fmtLength(seconds)}` : ''}
        </p>
      </header>
      <ResumeStrip navigate={navigate} />
      <div className="lib-case">
        {shelves.map((s) => (
          <ShelfRow key={s.id} shelf={s} navigate={navigate} />
        ))}
      </div>
    </div>
  )
}

function ResumeStrip({ navigate }: { navigate: Nav }) {
  const lib = useLibrary()
  const target = lib.current ?? lib.lastPlayed
  if (!target) return null
  const { track, book, index } = target
  const isCurrent = lib.current?.track.id === track.id
  const playing = isCurrent && lib.status === 'playing'
  const p = lib.progress[track.id]
  const at = isCurrent ? lib.position : p && !p.completed ? p.positionSeconds : 0
  const dur = isCurrent && lib.duration ? lib.duration : track.durationSeconds ?? 0
  const pct = dur > 0 ? Math.min(100, (at / dur) * 100) : 0
  return (
    <section className="lib-resume" aria-label="ฟังต่อจากครั้งก่อน">
      <button className="lib-resume-book" onClick={() => navigate({ kind: 'book', slug: book.slug })} aria-label={`เปิดเล่ม ${book.title}`}>
        <BookCover book={book} size="thumb" />
      </button>
      <div className="lib-resume-text">
        <span className="lib-resume-title">
          {playing ? 'กำลังฟัง' : 'ฟังต่อ'}: {track.title}
        </span>
        <span className="lib-resume-meta">
          {at > 3 ? `${playing ? '' : 'ค้างที่ '}${fmtClock(at)}/${fmtClock(track.durationSeconds)} · ` : ''}
          ตอน {index + 1}/{book.tracks.length} · {book.title}
        </span>
        {at > 3 && dur > 0 && (
          <span className="lib-meter lib-resume-meter" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </span>
        )}
      </div>
      <button
        className="lib-play"
        onClick={() => (isCurrent ? lib.toggle() : lib.playTrack(track.id))}
        aria-label={playing ? 'หยุดชั่วคราว' : `ฟังต่อ ${track.title}`}
      >
        {playing ? <IconPause size={22} /> : <IconPlay size={22} />}
      </button>
    </section>
  )
}

function ShelfRow({ shelf, navigate, large }: { shelf: Shelf; navigate: Nav; large?: boolean }) {
  const lib = useLibrary()
  const titleId = `lib-shelf-${shelf.slug}`
  return (
    <section className={`lib-shelf${large ? ' lib-shelf-large' : ''}`} aria-labelledby={large ? undefined : titleId} aria-label={large ? shelf.title : undefined}>
      {!large && (
        <button className="lib-shelf-head" onClick={() => navigate({ kind: 'shelf', slug: shelf.slug })}>
          <span className="lib-shelf-title" id={titleId}>
            {shelf.title}
          </span>
          <span className="lib-shelf-count lib-num">{shelf.books.length} เล่ม</span>
          <IconChevronRight size={18} className="lib-shelf-chev" />
        </button>
      )}
      <div className="lib-bay">
        {shelf.books.length > 0 ? (
          <ul className="lib-shelf-books">
            {shelf.books.map((b) => {
              const st = bookStats(b, lib.progress)
              const playing = lib.current?.book.id === b.id && lib.status === 'playing'
              return (
                <li key={b.id} className="lib-slot">
                  <button
                    className={`lib-book${playing ? ' is-playing' : ''}`}
                    onClick={() => navigate({ kind: 'book', slug: b.slug })}
                    onPointerEnter={() => lib.prepareBook(b)}
                    aria-label={`${b.title}, ${st.count} ตอน, ${caption(st)}`}
                  >
                    <BookCover book={b} size="shelf" state={st.state} done={st.done} count={st.count} />
                  </button>
                  <span className="lib-slot-caption" aria-hidden="true">
                    <span className="lib-slot-title">{b.title}</span>
                    <span className="lib-slot-meta lib-num">
                      {st.count === 0 ? 'ยังไม่มีตอน' : `${st.count} ตอน · ${fmtLength(st.totalSeconds)}`}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="lib-shelf-empty">
            <span className="lib-ghost-book" aria-hidden="true" />
            <span className="lib-ghost-book lib-ghost-book-2" aria-hidden="true" />
            <p className="lib-shelf-empty-text">
              <strong>ชั้นนี้ยังว่าง</strong>
              <span>
                เพิ่มเล่มใน <code>{CATALOG_HINT}</code> ที่ชั้น "{shelf.slug}" แล้วรัน <code>{SYNC_HINT}</code>
              </span>
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

function caption(st: ReturnType<typeof bookStats>) {
  if (st.count === 0) return 'ยังไม่มีตอน'
  if (st.state === 'done') return `ฟังจบครบ ${st.count} ตอน`
  if (st.state === 'progress') return `ฟังจบ ${st.done}/${st.count} ตอน`
  return `${st.count} ตอน · ${fmtLength(st.totalSeconds)}`
}

// ---------- one shelf ----------
function ShelfPage({ shelf, navigate }: { shelf: Shelf; navigate: Nav }) {
  return (
    <div className="lib-page fade-in">
      <header className="lib-head">
        <h1 className="lib-title">{shelf.title}</h1>
        <p className="lib-head-meta lib-num">
          {shelf.books.length} เล่ม{shelf.description ? ` · ${shelf.description}` : ''}
        </p>
      </header>
      <ShelfRow shelf={shelf} navigate={navigate} large />
    </div>
  )
}

// ---------- one book ----------
const PILL_TEXT: Record<TrackState, string> = { new: 'ยังไม่ฟัง', progress: 'ฟังค้าง', done: 'ฟังจบ' }

function BookPage({ book, shelf, navigate }: { book: Book; shelf: Shelf; navigate: Nav }) {
  const lib = useLibrary()
  const { prepareBook } = lib
  useEffect(() => {
    prepareBook(book)
  }, [book, prepareBook])

  const st = bookStats(book, lib.progress)
  const currentHere = lib.current?.book.id === book.id ? lib.current : null
  const playingHere = !!currentHere && lib.status === 'playing'
  const pct = st.count ? Math.round((st.done / st.count) * 100) : 0

  let primaryLabel: string
  let primaryAction: () => void
  if (currentHere) {
    primaryLabel = playingHere ? 'หยุดชั่วคราว' : `ฟังต่อ ตอน ${currentHere.index + 1} · ${fmtClock(lib.position)}`
    primaryAction = lib.toggle
  } else if (st.state === 'done' || !st.nextUp) {
    primaryLabel = 'ฟังใหม่ตั้งแต่ตอนแรก'
    primaryAction = () => book.tracks[0] && lib.playTrack(book.tracks[0].id, { fromStart: true })
  } else {
    const nextUp = st.nextUp
    const p = lib.progress[nextUp.id]
    const n = book.tracks.indexOf(nextUp) + 1
    primaryLabel =
      st.state === 'new'
        ? 'เริ่มฟังตอนแรก'
        : p && !p.completed && p.positionSeconds > 3
          ? `ฟังต่อ ตอน ${n} · ค้างที่ ${fmtClock(p.positionSeconds)}`
          : `ฟังต่อ ตอน ${n}`
    primaryAction = () => lib.playTrack(nextUp.id)
  }

  return (
    <div className="lib-page lib-book-page fade-in">
      <aside className="lib-book-aside">
        <BookCover book={book} size="detail" state={st.state} />
      </aside>
      <div className="lib-book-main">
        <header className="lib-book-head">
          <h1 className="lib-title">{book.title}</h1>
          <p className="lib-head-meta">
            <button className="lib-inline-link" onClick={() => navigate({ kind: 'shelf', slug: shelf.slug })}>
              ชั้น {shelf.title}
            </button>
            {' · '}
            {[book.author, `${st.count} ตอน`, fmtLength(st.totalSeconds)].filter(Boolean).join(' · ')}
          </p>
        </header>
        <div className="lib-book-progress" aria-label={`ฟังจบ ${st.done} จาก ${st.count} ตอน`}>
          <span className="lib-meter" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </span>
          <span className="lib-book-progress-text lib-num">
            ฟังจบ {st.done} จาก {st.count} ตอน
          </span>
        </div>
        {st.count > 0 && (
          <button className="lib-primary" onClick={primaryAction}>
            {playingHere ? <IconPause size={20} /> : <IconPlay size={20} />}
            <span>{primaryLabel}</span>
          </button>
        )}

        {st.count === 0 ? (
          <p className="lib-state-text lib-book-empty">
            เล่มนี้ยังไม่มีตอน ใส่ไฟล์ใน <code>{CATALOG_HINT}</code> แล้วรัน <code>{SYNC_HINT}</code>
          </p>
        ) : (
          <ol className="lib-tracks">
            {book.tracks.map((t, i) => {
              const s = trackState(t, lib.progress)
              const isCurrent = lib.current?.track.id === t.id
              const isPlaying = isCurrent && lib.status === 'playing'
              const isLoading = isCurrent && (lib.status === 'loading' || lib.buffering)
              const isError = isCurrent && lib.status === 'error'
              const p = lib.progress[t.id]
              const at = isCurrent ? lib.position : p?.positionSeconds ?? 0
              const dur = isCurrent && lib.duration ? lib.duration : t.durationSeconds ?? 0
              const showBar = isCurrent ? at > 0 : s === 'progress'
              let statusText: string
              if (isError) statusText = 'เล่นไม่ได้ กดเพื่อลองใหม่'
              else if (isPlaying) statusText = `กำลังเล่น · ${fmtClock(at)}`
              else if (isLoading) statusText = 'กำลังโหลด...'
              else if (isCurrent && at > 3) statusText = `หยุดไว้ที่ ${fmtClock(at)}`
              else if (s === 'done') statusText = 'ฟังจบแล้ว'
              else if (s === 'progress') statusText = `ค้างที่ ${fmtClock(at)}`
              else statusText = 'ยังไม่ฟัง'
              // The pill names the state; the line under the title carries the time.
              let pillKind: string = s
              let pillText = PILL_TEXT[s]
              if (isError) {
                pillKind = 'error'
                pillText = 'เล่นไม่ได้'
              } else if (isPlaying || isLoading) {
                pillKind = 'live'
                pillText = isLoading ? 'กำลังโหลด' : 'กำลังเล่น'
              } else if (isCurrent && at > 3) {
                pillKind = 'progress'
                pillText = 'หยุดไว้'
              }
              const detail =
                isError || isPlaying || isLoading || (isCurrent && at > 3) || s === 'progress' ? statusText : null
              return (
                <li key={t.id}>
                  <button
                    className={`lib-track is-${s}${isCurrent ? ' is-current' : ''}`}
                    aria-current={isCurrent ? 'true' : undefined}
                    onClick={() => (isCurrent ? lib.toggle() : lib.playTrack(t.id))}
                    aria-label={`ตอน ${i + 1} ${t.title}, ${fmtClock(t.durationSeconds)}, ${statusText}`}
                  >
                    <span className="lib-track-num lib-num" aria-hidden="true">
                      {isPlaying ? <EqBars /> : s === 'done' && !isCurrent ? <IconCheck size={16} /> : i + 1}
                    </span>
                    <span className="lib-track-body">
                      <span className="lib-track-title">{t.title}</span>
                      {detail && <span className="lib-track-status lib-num">{detail}</span>}
                      {showBar && dur > 0 && (
                        <span className="lib-track-bar" aria-hidden="true">
                          <span style={{ width: `${Math.min(100, (at / dur) * 100)}%` }} />
                        </span>
                      )}
                    </span>
                    <span className="lib-track-side" aria-hidden="true">
                      <span className={`lib-pill is-${pillKind}`}>{pillText}</span>
                      <span className="lib-track-dur lib-num">{fmtClock(t.durationSeconds)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}

function EqBars() {
  return (
    <span className="lib-eq">
      <span />
      <span />
      <span />
    </span>
  )
}

function LibrarySkeleton() {
  return (
    <div className="lib-page" aria-busy="true" aria-label="กำลังโหลดห้องสมุด">
      <header className="lib-head">
        <span className="lib-skel lib-skel-title" />
        <span className="lib-skel lib-skel-line" />
      </header>
      <div className="lib-case">
        {[0, 1].map((i) => (
          <section key={i} className="lib-shelf">
            <div className="lib-shelf-head lib-shelf-head-skel">
              <span className="lib-skel lib-skel-line" />
            </div>
            <div className="lib-bay">
              <ul className="lib-shelf-books">
                {[0, 1, 2].map((j) => (
                  <li key={j} className="lib-slot">
                    <span className="lib-skel lib-skel-book" />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
