import { fmtPct } from './format'
import { IconBook, IconBookOpen, IconCheck, IconHeadphones } from './icons'
import type { BookMode, TrackState } from './stats'
import type { Book } from './types'

type Size = 'shelf' | 'detail' | 'thumb'

const MODE_LABEL: Record<Exclude<BookMode, 'empty'>, string> = {
  audio: 'หนังสือเสียง',
  read: 'อ่าน',
  both: 'ฟังและอ่าน',
}

// A book drawn as a Squircle plate: a solid tinted face (hue from the book's
// `cloth` id) carrying the cover label. The tint is the only thing that tells
// two books apart at a glance, so it stays; the leather/cloth relief is gone.
// The thumbnail is too small for lettering and becomes a tinted key instead.
// A small key in the top corner names the formats the book comes in.
export default function BookCover({
  book,
  size,
  state,
  done,
  count,
  mode,
  read,
}: {
  book: Book
  size: Size
  state?: TrackState
  done?: number
  count?: number
  mode?: BookMode
  read?: { state: TrackState; percent: number }
}) {
  const label = book.coverLabel || book.title
  const sub = book.coverLabel ? book.subtitle : null
  const showMode = size !== 'thumb' && mode && mode !== 'empty'
  return (
    <span className={`lib-cover lib-cover-${size}${showMode ? ' has-mode' : ''}`} data-cloth={book.cloth} aria-hidden="true">
      {size === 'thumb' ? (
        <IconBook size={20} />
      ) : (
        <span className="lib-cover-face">
          <span className="lib-cover-label">{label}</span>
          {sub && <span className="lib-cover-sub">{sub}</span>}
        </span>
      )}
      {showMode && (
        <span className={`lib-cover-mode is-${mode}`} title={MODE_LABEL[mode]}>
          {(mode === 'audio' || mode === 'both') && <IconHeadphones size={13} />}
          {(mode === 'read' || mode === 'both') && <IconBookOpen size={13} />}
        </span>
      )}
      {size === 'shelf' && (
        <span className="lib-cover-pills">
          {state === 'progress' && (
            <span className="lib-pill is-progress lib-cover-pill lib-num">
              ฟังค้าง{count ? ` ${done ?? 0}/${count}` : ''}
            </span>
          )}
          {state === 'done' && (
            <span className="lib-pill is-done lib-cover-pill">
              <IconCheck size={13} /> ฟังจบ
            </span>
          )}
          {read?.state === 'progress' && <span className="lib-pill is-progress lib-cover-pill lib-num">อ่าน {fmtPct(read.percent)}</span>}
          {read?.state === 'done' && (
            <span className="lib-pill is-done lib-cover-pill">
              <IconCheck size={13} /> อ่านจบ
            </span>
          )}
        </span>
      )}
    </span>
  )
}
