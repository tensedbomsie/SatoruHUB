import type { Book } from './types'

// Lock-screen / notification artwork for the Media Session, drawn from the
// same cloth token the on-screen cover uses so the two always match.
const cache = new Map<string, string>()

export function coverArtworkUrl(book: Book): string | null {
  const theme = document.documentElement.getAttribute('data-theme') ?? 'dark'
  const key = `${book.id}:${book.cloth}:${theme}`
  const hit = cache.get(key)
  if (hit) return hit
  try {
    const css = getComputedStyle(document.documentElement)
    const cloth = css.getPropertyValue(`--lib-cloth-${book.cloth}`).trim() || '#2f4a7a'
    const ink = css.getPropertyValue('--lib-cover-ink').trim() || '#f3efe6'
    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = cloth
    ctx.fillRect(0, 0, size, size)
    // spine hinge
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    ctx.fillRect(54, 0, 10, size)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.fillRect(64, 0, 3, size)
    ctx.fillStyle = ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const label = book.coverLabel || book.title
    ctx.font = `800 ${label.length > 10 ? 64 : 92}px system-ui, "Segoe UI", sans-serif`
    ctx.fillText(label, size / 2 + 30, size / 2 - 30, size - 140)
    ctx.globalAlpha = 0.5
    ctx.fillRect(size / 2 - 40, size / 2 + 34, 140, 3)
    ctx.globalAlpha = 1
    if (book.subtitle) {
      ctx.font = `600 38px system-ui, "Segoe UI", sans-serif`
      ctx.fillText(book.subtitle, size / 2 + 30, size / 2 + 92, size - 140)
    }
    const url = canvas.toDataURL('image/png')
    cache.set(key, url)
    return url
  } catch {
    return null
  }
}
