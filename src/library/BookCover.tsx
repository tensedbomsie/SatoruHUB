import type { CSSProperties } from 'react'
import { hashUnit } from './format'
import type { TrackState } from './stats'
import type { Book } from './types'

type Size = 'shelf' | 'detail' | 'thumb'

// A cloth-bound book drawn in CSS: hinge, board edge and title block. Height
// varies a little per book (stable per slug) so a shelf never looks stamped.
export default function BookCover({ book, size, state }: { book: Book; size: Size; state?: TrackState }) {
  const label = book.coverLabel || book.title
  const sub = book.coverLabel ? book.subtitle : null
  const style = { '--lib-book-scale': (0.9 + hashUnit(book.slug) * 0.1).toFixed(3) } as CSSProperties
  return (
    <span className={`lib-cover lib-cover-${size}`} data-cloth={book.cloth} style={style} aria-hidden="true">
      <span className="lib-cover-face">
        <span className="lib-cover-label">{label}</span>
        {sub && size !== 'thumb' && <span className="lib-cover-sub">{sub}</span>}
      </span>
      {state === 'progress' && size !== 'thumb' && <span className="lib-ribbon" />}
      {state === 'done' && size !== 'thumb' && <span className="lib-cover-done">ฟังจบ</span>}
    </span>
  )
}
