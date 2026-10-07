// EPUB engine on foliate-js (MIT, github.com/johnfactotum/foliate-js, pinned
// commit in package.json). Loaded only when an EPUB is opened.
//
// Security: foliate renders each chapter in a same-origin blob: iframe, so a
// script inside a book could reach the Hub (and its login). Every chapter is
// therefore sanitised before it becomes a blob: script elements, inline event
// handlers, javascript: URLs and embedded frames are removed, script files are
// refused outright, and a CSP meta (no scripts, no network) is injected as a
// second wall.
import 'foliate-js/view.js'
import { makeBook, type View } from 'foliate-js/view.js'
import { Overlayer } from 'foliate-js/overlayer.js'
import type { Bookmark, Locator } from '../types'
import {
  ReaderError,
  SYSTEM_FONT_STACK,
  THEME_INK,
  type EngineInit,
  type ReaderEngine,
  type ReaderPrefs,
  type SearchHit,
  type TocItem,
} from './engine'

const CHAPTER_CSP =
  "default-src 'none'; img-src blob: data:; media-src blob: data:; font-src blob: data:; style-src blob: data: 'unsafe-inline'"

function sanitizeMarkup(source: string, type: string): string {
  const parseType = /svg/.test(type) ? 'image/svg+xml' : /xhtml|xml/.test(type) ? 'application/xhtml+xml' : 'text/html'
  let doc = new DOMParser().parseFromString(source, parseType as DOMParserSupportedType)
  let asHtml = parseType === 'text/html'
  if (doc.querySelector('parsererror')) {
    doc = new DOMParser().parseFromString(source, 'text/html')
    asHtml = true
  }
  doc.querySelectorAll('script, iframe, frame, frameset, object, embed, applet, base').forEach((el) => el.remove())
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on')) el.removeAttribute(attr.name)
      else if (/(^|:)(href|src|action|formaction|xlink:href)$/.test(name) && /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name)
      else if (name === 'http-equiv' && /refresh/i.test(attr.value)) el.remove()
    }
  }
  const head = doc.querySelector('head')
  if (head) {
    const meta = doc.createElementNS(head.namespaceURI, 'meta')
    meta.setAttribute('http-equiv', 'Content-Security-Policy')
    meta.setAttribute('content', CHAPTER_CSP)
    head.prepend(meta)
  }
  if (asHtml) return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`
  return new XMLSerializer().serializeToString(doc)
}

function readerCss(p: ReaderPrefs): string {
  const ink = THEME_INK[p.theme]
  const font = p.systemFont
    ? `
    body, body :not(code, pre, kbd, samp, tt, code *, pre *) { font-family: ${SYSTEM_FONT_STACK} !important; }`
    : ''
  return `
    @namespace epub "http://www.idpf.org/2007/ops";
    html {
      color-scheme: ${p.theme === 'dark' ? 'dark' : 'light'};
      font-size: ${Math.round(p.fontScale * 100)}% !important;
      color: ${ink.ink} !important;
      background: ${ink.bg} !important;
      -webkit-text-size-adjust: none;
      text-size-adjust: none;
    }
    body {
      background: transparent !important;
      color: ${ink.ink} !important;
      overflow-wrap: break-word;
      word-break: normal;
      line-break: auto;
    }
    /* Publisher colours are written for white paper; the reading theme wins. */
    body *:not(a, a *) { color: inherit !important; background-color: transparent !important; }
    a, a * { color: ${ink.link} !important; }
    body, p, li, blockquote, dd, dt, div, td, th, span {
      line-height: ${p.lineHeight} !important;
    }
    h1, h2, h3, h4, h5, h6 { line-height: 1.4 !important; }
    /* Thai has almost no spaces, so justified text opens wide gaps. */
    p, li, dd { text-align: start; hyphens: manual; -webkit-hyphens: manual; widows: 2; orphans: 2; }
    [align="center"] { text-align: center; }
    [align="right"] { text-align: right; }
    img, svg, video { max-width: 100%; height: auto; }
    pre { white-space: pre-wrap !important; }
    ::selection { background: ${ink.mark}; }
    aside[epub|type~="footnote"], aside[epub|type~="endnote"], aside[epub|type~="note"], aside[epub|type~="rearnote"] {
      display: none;
    }${font}
  `
}

type RelocateDetail = {
  fraction: number
  section?: { current: number; total: number }
  cfi: string
  tocItem?: { label?: string; href?: string } | null
  time?: { total?: number }
  location?: { current: number; total: number }
}

export async function createEpubEngine({ container, data, prefs, initial, callbacks }: EngineInit): Promise<ReaderEngine> {
  let book: Awaited<ReturnType<typeof makeBook>>
  try {
    book = await makeBook(new File([data], 'book.epub', { type: 'application/epub+zip' }))
  } catch (err) {
    throw new ReaderError(
      'เปิดไฟล์ EPUB นี้ไม่ได้',
      'ไฟล์อาจเสียหาย ดาวน์โหลดไม่ครบ หรือไม่ใช่ EPUB จริง ลองเปิดไฟล์ต้นฉบับใน Calibre ถ้าเปิดได้ให้แปลงเป็น EPUB ใหม่แล้วรัน sync อีกครั้ง ไฟล์ที่ติด DRM ของร้านเปิดในห้องสมุดนี้ไม่ได้',
      err,
    )
  }
  if (!book.sections?.length) {
    throw new ReaderError('EPUB นี้ไม่มีเนื้อหาให้อ่าน', 'ไฟล์ไม่มีบทใน spine เลย ลองส่งออกจากโปรแกรมทำ ebook ใหม่')
  }

  book.transformTarget?.addEventListener('load', (e: Event) => {
    const detail = (e as CustomEvent<{ isScript: boolean; allow: boolean }>).detail
    if (detail.isScript) detail.allow = false
  })
  book.transformTarget?.addEventListener('data', (e: Event) => {
    const detail = (e as CustomEvent<{ data: unknown; type: string }>).detail
    if (!/html|xml|svg/.test(detail.type)) return
    detail.data = Promise.resolve(detail.data).then((d) => (typeof d === 'string' ? sanitizeMarkup(d, detail.type) : d))
  })

  const view = document.createElement('foliate-view') as View
  view.className = 'lib-epub-view'
  container.append(view)

  let current = prefs
  const docIndex = new WeakMap<Document, number>()
  let highlights: Bookmark[] = []
  const ink = () => THEME_INK[current.theme]

  const applyLayout = () => {
    const r = view.renderer
    if (!r) return
    r.setAttribute('flow', current.flow)
    r.setAttribute('max-inline-size', '680px')
    r.setAttribute('max-column-count', '1')
    r.setAttribute('gap', '6%')
    r.setAttribute('margin', '28px')
    r.setStyles?.(readerCss(current))
  }

  try {
    await view.open(book)
  } catch (err) {
    view.remove()
    throw new ReaderError('เปิดไฟล์ EPUB นี้ไม่ได้', 'โครงสร้างไฟล์อ่านไม่ออก ลองแปลงไฟล์ใหม่ด้วย Calibre แล้ว sync อีกครั้ง', err)
  }
  applyLayout()

  view.addEventListener('load', (e: Event) => {
    const { doc, index } = (e as CustomEvent<{ doc: Document; index: number }>).detail
    docIndex.set(doc, index)
    doc.addEventListener('keydown', callbacks.onKey)
    doc.addEventListener('click', (ev: MouseEvent) => {
      if ((ev.target as Element | null)?.closest?.('a[href]')) return
      const sel = doc.getSelection()
      if (sel && !sel.isCollapsed) return
      const frame = doc.defaultView?.frameElement as HTMLElement | null
      const box = container.getBoundingClientRect()
      const x = (frame?.getBoundingClientRect().left ?? 0) + ev.clientX - box.left
      const third = box.width / 3
      const pointerType = (ev as PointerEvent).pointerType || 'mouse'
      callbacks.onTap(x < third ? 'left' : x > box.width - third ? 'right' : 'center', pointerType)
    })
    if (callbacks.onSelection) {
      let t = 0
      doc.addEventListener('selectionchange', () => {
        window.clearTimeout(t)
        t = window.setTimeout(() => callbacks.onSelection?.(doc.getSelection()?.toString().trim() ?? ''), 250)
      })
    }
  })

  // foliate reports the END of the visible page when paginated but the START
  // of the view when scrolling, so the same spot read 3% vs <1% and a scrolled
  // book could never reach 100%. Normalise both to "read up to the bottom of
  // what is on screen".
  const endFraction = (d: RelocateDetail): number => {
    const r = view.renderer as unknown as { scrolled?: boolean; end?: number; viewSize?: number }
    const index = d.section?.current
    if (!r?.scrolled || index == null || !r.viewSize) return d.fraction ?? 0
    const fr = view.getSectionFractions()
    const from = fr[index] ?? 0
    const to = fr[index + 1] ?? 1
    return from + Math.min(1, (r.end ?? 0) / r.viewSize) * (to - from)
  }

  view.addEventListener('relocate', (e: Event) => {
    const d = (e as CustomEvent<RelocateDetail>).detail
    const fraction = Math.min(1, Math.max(0, endFraction(d)))
    callbacks.onRelocate({
      locator: { cfi: d.cfi, fraction },
      percent: fraction * 100,
      chapter: d.tocItem?.label?.trim() || null,
      minutesLeft: typeof d.time?.total === 'number' ? Math.round(d.time.total) : null,
    })
  })

  // Highlights: drawn by foliate's overlayer whenever their chapter is on screen.
  view.addEventListener('create-overlay', () => {
    for (const h of highlights) if (h.locator.cfi) view.addAnnotation({ value: h.locator.cfi }).catch(() => {})
  })
  view.addEventListener('draw-annotation', (e: Event) => {
    const { draw } = (e as CustomEvent<{ draw: (fn: unknown, opts: unknown) => void }>).detail
    draw(Overlayer.highlight, { color: ink().hl })
  })
  view.addEventListener('show-annotation', (e: Event) => {
    callbacks.onHighlightTap?.((e as CustomEvent<{ value: string }>).detail.value)
  })

  const toc: TocItem[] = []
  const walk = (items: { label?: string; href?: string; subitems?: unknown[] }[] | undefined, depth: number) => {
    for (const it of items ?? []) {
      if (it.href) toc.push({ label: (it.label ?? '').trim() || 'ไม่มีชื่อบท', target: it.href, depth })
      walk(it.subitems as typeof items, depth + 1)
    }
  }
  walk(book.toc, 0)

  try {
    if (initial?.cfi) await view.init({ lastLocation: initial.cfi })
    else if (typeof initial?.fraction === 'number' && initial.fraction > 0) await view.init({ lastLocation: { fraction: initial.fraction } })
    else await view.init({ showTextStart: true })
  } catch {
    // A stale CFI (the file was replaced) must not strand the reader.
    await view.init({ showTextStart: true }).catch(() => view.goTo(0))
  }

  return {
    kind: 'epub',
    toc,
    get paged() {
      return current.flow === 'paginated'
    },
    async goTo(target) {
      await view.goTo(target)
    },
    async goToFraction(f) {
      await view.goToFraction(Math.min(1, Math.max(0, f)))
    },
    next() {
      view.goRight()
    },
    prev() {
      view.goLeft()
    },
    applyPrefs(p) {
      const redraw = p.theme !== current.theme
      current = p
      applyLayout()
      if (redraw) for (const h of highlights) if (h.locator.cfi) view.addAnnotation({ value: h.locator.cfi }).catch(() => {})
    },
    async search(query, onHit, signal) {
      const results = view.search({ query, matchCase: false, matchDiacritics: true, matchWholeWords: false })
      for await (const r of results) {
        if (signal.aborted) break
        if (r === 'done' || typeof r !== 'object') continue
        const group = r as { label?: string; subitems?: { cfi: string; excerpt: { pre: string; match: string; post: string } }[] }
        for (const s of group.subitems ?? []) {
          const hit: SearchHit = { target: s.cfi, label: group.label ?? '', pre: s.excerpt.pre, match: s.excerpt.match, post: s.excerpt.post }
          onHit(hit)
        }
      }
    },
    clearSearch() {
      view.clearSearch()
    },
    highlightSelection() {
      for (const { doc, index } of view.renderer.getContents()) {
        const sel = doc.getSelection()
        if (!sel || sel.isCollapsed || !sel.rangeCount) continue
        const range = sel.getRangeAt(0)
        const excerpt = sel.toString().trim().slice(0, 400)
        if (!excerpt) continue
        const cfi = view.getCFI(index ?? docIndex.get(doc) ?? 0, range)
        sel.removeAllRanges()
        const fraction = view.lastLocation?.fraction ?? 0
        return { locator: { cfi, fraction } as Locator, excerpt, percent: fraction * 100 }
      }
      return null
    },
    showHighlights(list) {
      const next = list.filter((b) => b.kind === 'highlight' && b.locator.cfi)
      const keep = new Set(next.map((b) => b.locator.cfi))
      for (const h of highlights) if (h.locator.cfi && !keep.has(h.locator.cfi)) view.deleteAnnotation({ value: h.locator.cfi }).catch(() => {})
      highlights = next
      for (const h of highlights) view.addAnnotation({ value: h.locator.cfi! }).catch(() => {})
    },
    destroy() {
      try {
        view.close()
      } catch {
        /* already torn down */
      }
      view.remove()
    },
  }
}
