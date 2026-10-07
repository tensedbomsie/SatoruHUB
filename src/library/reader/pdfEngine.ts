// PDF engine on pdfjs-dist (Mozilla, Apache-2.0). Loaded only when a PDF is
// opened; the worker is a separate file served next to the app, so it works
// the same on hub.ppchan.com, in the PWA and inside the Tauri .exe (no CDN).
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import type { Locator } from '../types'
import { minutesForText, ReaderError, type EngineInit, type ReaderEngine, type ReaderPrefs, type SearchHit, type TocItem } from './engine'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

type PageSlot = {
  n: number
  el: HTMLDivElement
  w: number
  h: number
  rendered: number // scale it was last drawn at, 0 = not drawn
  task: { cancel(): void } | null
  text: { cancel(): void } | null
}

const MAX_FIT_WIDTH = 920
const GAP = 14

async function resolveOutline(doc: PDFDocumentProxy): Promise<TocItem[]> {
  const out: TocItem[] = []
  const outline = await doc.getOutline().catch(() => null)
  const walk = async (items: Awaited<ReturnType<PDFDocumentProxy['getOutline']>> | undefined, depth: number) => {
    for (const it of items ?? []) {
      let page: number | null = null
      try {
        const dest = typeof it.dest === 'string' ? await doc.getDestination(it.dest) : it.dest
        const ref = dest?.[0]
        if (ref && typeof ref === 'object') page = (await doc.getPageIndex(ref as Parameters<PDFDocumentProxy['getPageIndex']>[0])) + 1
        else if (typeof ref === 'number') page = ref + 1
      } catch {
        page = null
      }
      if (page) out.push({ label: it.title?.trim() || `หน้า ${page}`, target: `page:${page}`, depth })
      await walk(it.items, depth + 1)
    }
  }
  await walk(outline ?? [], 0)
  return out
}

export async function createPdfEngine({ container, data, prefs, initial, callbacks }: EngineInit): Promise<ReaderEngine> {
  let doc: PDFDocumentProxy
  const loading = pdfjs.getDocument({ data: new Uint8Array(data), enableXfa: false, useSystemFonts: true })
  try {
    doc = await loading.promise
  } catch (err) {
    const name = (err as { name?: string })?.name
    if (name === 'PasswordException') {
      throw new ReaderError('PDF นี้ตั้งรหัสผ่านไว้', 'ห้องสมุดเปิดได้เฉพาะไฟล์ที่ไม่ล็อก ให้ใช้ไฟล์ฉบับที่ไม่มีรหัส แล้ว sync ใหม่', err)
    }
    throw new ReaderError(
      'เปิดไฟล์ PDF นี้ไม่ได้',
      'ไฟล์อาจเสียหายหรือดาวน์โหลดไม่ครบ ลองเปิดไฟล์ต้นฉบับในเบราว์เซอร์ ถ้าเปิดได้ให้ sync ใหม่ด้วยคำสั่ง npm run library:sync',
      err,
    )
  }
  const total = doc.numPages
  if (!total) throw new ReaderError('PDF นี้ไม่มีหน้าเลย', 'ลองส่งออก PDF ใหม่จากต้นฉบับ')

  let current: ReaderPrefs = prefs
  const scroller = document.createElement('div')
  scroller.className = 'lib-pdf'
  scroller.tabIndex = 0
  scroller.setAttribute('role', 'document')
  scroller.setAttribute('aria-label', 'หน้า PDF')
  const stack = document.createElement('div')
  stack.className = 'lib-pdf-stack'
  scroller.append(stack)
  container.append(scroller)

  const first = await doc.getPage(1)
  const base = first.getViewport({ scale: 1 })
  const pages: PageSlot[] = []
  for (let n = 1; n <= total; n++) {
    const el = document.createElement('div')
    el.className = 'lib-pdf-page'
    el.dataset.page = String(n)
    el.setAttribute('aria-label', `หน้า ${n} จาก ${total}`)
    stack.append(el)
    pages.push({ n, el, w: base.width, h: base.height, rendered: 0, task: null, text: null })
  }
  const pageCache = new Map<number, PDFPageProxy>([[1, first]])
  const getPage = async (n: number) => {
    const hit = pageCache.get(n)
    if (hit) return hit
    const p = await doc.getPage(n)
    pageCache.set(n, p)
    return p
  }

  let pageNo = Math.min(total, Math.max(1, initial?.page ?? 1))
  let scale = 1
  let suppressScroll = false

  const fitScale = (slot: PageSlot) => {
    const availW = Math.min(scroller.clientWidth - 24, MAX_FIT_WIDTH)
    if (current.pdfMode === 'page') {
      const availH = scroller.clientHeight - 24
      return Math.max(0.2, Math.min(availW / slot.w, availH / slot.h)) * current.pdfZoom
    }
    return Math.max(0.2, availW / slot.w) * current.pdfZoom
  }

  const layout = () => {
    scale = fitScale(pages[0])
    scroller.classList.toggle('is-paged', current.pdfMode === 'page')
    scroller.classList.toggle('is-dim', current.pdfDim && current.theme === 'dark')
    scroller.dataset.theme = current.theme
    for (const s of pages) {
      const sc = current.pdfMode === 'page' ? fitScale(s) : scale
      s.el.style.width = `${Math.floor(s.w * sc)}px`
      s.el.style.height = `${Math.floor(s.h * sc)}px`
      s.el.style.setProperty('--total-scale-factor', String(sc))
      s.el.hidden = current.pdfMode === 'page' && s.n !== pageNo
    }
  }

  const draw = async (s: PageSlot) => {
    const sc = current.pdfMode === 'page' ? fitScale(s) : scale
    if (s.rendered === sc) return
    s.task?.cancel()
    s.text?.cancel()
    const page = await getPage(s.n)
    const vp0 = page.getViewport({ scale: 1 })
    if (vp0.width !== s.w || vp0.height !== s.h) {
      // pages of a different size than page 1: fix the placeholder
      s.w = vp0.width
      s.h = vp0.height
      const sc2 = current.pdfMode === 'page' ? fitScale(s) : scale
      s.el.style.width = `${Math.floor(s.w * sc2)}px`
      s.el.style.height = `${Math.floor(s.h * sc2)}px`
    }
    const viewport = page.getViewport({ scale: sc })
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.setAttribute('aria-hidden', 'true')
    const task = page.render({ canvas, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined })
    s.task = task
    s.rendered = sc
    try {
      await task.promise
    } catch {
      if (s.task === task) s.rendered = 0
      return
    }
    if (s.task !== task) return
    s.task = null
    const textDiv = document.createElement('div')
    textDiv.className = 'textLayer'
    s.el.replaceChildren(canvas, textDiv)
    try {
      const layer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: textDiv, viewport })
      s.text = layer
      await layer.render()
    } catch {
      /* selection layer is a bonus; the page is already visible */
    }
  }

  const release = (s: PageSlot) => {
    s.task?.cancel()
    s.text?.cancel()
    s.task = null
    s.text = null
    s.rendered = 0
    s.el.replaceChildren()
  }

  // Draw what is on screen (plus a page either side), drop canvases far away.
  const refresh = () => {
    if (current.pdfMode === 'page') {
      for (const s of pages) if (s.n !== pageNo && s.rendered) release(s)
      void draw(pages[pageNo - 1])
      if (pageNo < total) void getPage(pageNo + 1)
      return
    }
    const top = scroller.scrollTop
    const bottom = top + scroller.clientHeight
    for (const s of pages) {
      const y = s.el.offsetTop
      const near = y + s.el.offsetHeight > top - scroller.clientHeight && y < bottom + scroller.clientHeight
      if (near) void draw(s)
      else if (s.rendered && (y + s.el.offsetHeight < top - 4 * scroller.clientHeight || y > bottom + 4 * scroller.clientHeight)) release(s)
    }
  }

  const textCache = new Map<number, string>()
  const pageText = async (n: number) => {
    const hit = textCache.get(n)
    if (hit != null) return hit
    const content = await (await getPage(n)).getTextContent()
    const text = content.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : '') : '')).join('')
    textCache.set(n, text)
    return text
  }

  let minutesPerPage: number | null = null
  let outlineToc: TocItem[] = []
  const chapterFor = (n: number) => {
    let label: string | null = null
    for (const t of outlineToc) {
      const p = Number(t.target.slice(5))
      if (p <= n) label = t.label
    }
    return label
  }

  const position = (): { page: number; offset: number; percent: number } => {
    if (current.pdfMode === 'page') {
      return { page: pageNo, offset: 0, percent: total > 1 ? ((pageNo - 1) / (total - 1)) * 100 : 100 }
    }
    const top = scroller.scrollTop
    const atEnd = top + scroller.clientHeight >= scroller.scrollHeight - 4
    let page = 1
    for (const s of pages) {
      if (s.el.offsetTop - GAP <= top + 1) page = s.n
      else break
    }
    const s = pages[page - 1]
    const offset = Math.min(1, Math.max(0, (top - s.el.offsetTop) / Math.max(1, s.el.offsetHeight)))
    const percent = atEnd ? 100 : ((page - 1 + offset) / total) * 100
    return { page, offset, percent }
  }

  const report = () => {
    const p = position()
    pageNo = p.page
    const left = minutesPerPage != null ? Math.round(minutesPerPage * (total - (p.page - 1 + p.offset))) : null
    const locator: Locator = { page: p.page, offset: Math.round(p.offset * 1000) / 1000, pages: total, fraction: p.percent / 100 }
    callbacks.onRelocate({ locator, percent: p.percent, chapter: chapterFor(p.page), minutesLeft: left, page: { current: p.page, total } })
  }

  const scrollToPage = (n: number, offset = 0) => {
    pageNo = Math.min(total, Math.max(1, n))
    if (current.pdfMode === 'page') {
      for (const s of pages) s.el.hidden = s.n !== pageNo
      scroller.scrollTop = 0
    } else {
      const s = pages[pageNo - 1]
      suppressScroll = true
      scroller.scrollTop = s.el.offsetTop - GAP + offset * s.el.offsetHeight
      requestAnimationFrame(() => (suppressScroll = false))
    }
    refresh()
    report()
  }

  let raf = 0
  const onScroll = () => {
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      refresh()
      if (!suppressScroll) report()
    })
  }
  scroller.addEventListener('scroll', onScroll, { passive: true })
  scroller.addEventListener('keydown', callbacks.onKey)
  scroller.addEventListener('click', (e) => {
    if (window.getSelection()?.toString()) return
    const box = scroller.getBoundingClientRect()
    const x = e.clientX - box.left
    const third = box.width / 3
    if (current.pdfMode === 'page') callbacks.onTap(x < third ? 'left' : x > box.width - third ? 'right' : 'center')
    else callbacks.onTap('center')
  })

  const ro = new ResizeObserver(() => {
    const keep = position()
    layout()
    for (const s of pages) if (s.rendered) s.rendered = -1 // force redraw at the new scale
    scrollToPage(keep.page, keep.offset)
  })

  layout()
  scrollToPage(pageNo, initial?.offset ?? 0)
  ro.observe(scroller)
  outlineToc = await resolveOutline(doc)
  report()

  // Reading-time estimate from a sample of pages, in the background. Scanned
  // PDFs have no text layer: then only "page x of y" is shown.
  let destroyed = false
  void (async () => {
    const count = Math.min(8, total)
    const sample = Array.from(new Set(Array.from({ length: count }, (_, i) => 1 + Math.floor((i * (total - 1)) / Math.max(1, count - 1)))))
    let minutes = 0
    let chars = 0
    for (const n of sample) {
      if (destroyed) return
      const t = await pageText(n).catch(() => '')
      chars += t.replace(/\s/g, '').length
      minutes += minutesForText(t)
    }
    if (destroyed) return
    minutesPerPage = chars > 40 * sample.length ? minutes / sample.length : null
    report()
  })()

  const step = (dir: 1 | -1) => {
    if (current.pdfMode === 'page') scrollToPage(pageNo + dir)
    else scroller.scrollBy({ top: dir * scroller.clientHeight * 0.88, behavior: 'smooth' })
  }

  return {
    kind: 'pdf',
    get toc() {
      return outlineToc
    },
    get paged() {
      return current.pdfMode === 'page'
    },
    async goTo(target) {
      const n = Number(target.replace(/^page:/, ''))
      if (Number.isFinite(n)) scrollToPage(n)
    },
    async goToFraction(f) {
      const x = Math.min(1, Math.max(0, f)) * total
      const n = Math.min(total, Math.floor(x) + 1)
      scrollToPage(n, current.pdfMode === 'page' ? 0 : Math.min(0.999, x - (n - 1)))
    },
    next: () => step(1),
    prev: () => step(-1),
    applyPrefs(p) {
      const keep = position()
      current = p
      layout()
      for (const s of pages) if (s.rendered) s.rendered = -1
      scrollToPage(keep.page, keep.offset)
    },
    async search(query, onHit, signal) {
      const q = query.trim().toLocaleLowerCase()
      if (!q) return
      for (let n = 1; n <= total; n++) {
        if (signal.aborted) return
        const text = await pageText(n).catch(() => '')
        const lower = text.toLocaleLowerCase()
        let i = lower.indexOf(q)
        let count = 0
        while (i >= 0 && count < 20) {
          const hit: SearchHit = {
            target: `page:${n}`,
            label: `หน้า ${n}`,
            pre: text.slice(Math.max(0, i - 40), i).replace(/\s+/g, ' '),
            match: text.slice(i, i + q.length),
            post: text.slice(i + q.length, i + q.length + 60).replace(/\s+/g, ' '),
          }
          onHit(hit)
          count++
          i = lower.indexOf(q, i + q.length)
        }
      }
    },
    destroy() {
      destroyed = true
      ro.disconnect()
      scroller.removeEventListener('scroll', onScroll)
      for (const s of pages) release(s)
      scroller.remove()
      void loading.destroy()
    },
  }
}
