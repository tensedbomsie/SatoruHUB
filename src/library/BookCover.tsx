import { IconBook, IconCheck } from './icons'
import type { TrackState } from './stats'
import type { Book } from './types'

type Size = 'shelf' | 'detail' | 'thumb'

// A book drawn as a Squircle plate: a solid tinted face (hue from the book's
// `cloth` id) carrying the cover label. The tint is the only thing that tells
// two books apart at a glance, so it stays; the leather/cloth relief is gone.
// The thumbnail is too small for lettering and becomes a tinted key instead.
export default function BookCover({ book, size, state, done, count }: { book: Book; size: Size; state?: TrackState; done?: number; count?: number }) {
  const label = book.coverLabel || book.title
  const sub = book.coverLabel ? book.subtitle : null
  return (
    <span className={`lib-cover lib-cover-${size}`} data-cloth={book.cloth} aria-hidden="true">
      {size === 'thumb' ? (
        <IconBook size={20} />
      ) : (
        <span className="lib-cover-face">
          <span className="lib-cover-label">{label}</span>
          {sub && <span className="lib-cover-sub">{sub}</span>}
        </span>
      )}
      {size === 'shelf' && state === 'progress' && (
        <span className="lib-pill is-progress lib-cover-pill lib-num">
          ฟังค้าง{count ? ` ${done ?? 0}/${count}` : ''}
        </span>
      )}
      {size === 'shelf' && state === 'done' && (
        <span className="lib-pill is-done lib-cover-pill">
          <IconCheck size={13} /> ฟังจบ
        </span>
      )}
    </span>
  )
}
