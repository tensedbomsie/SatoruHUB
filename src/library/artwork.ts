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
    const cloth = css.getPropertyValue(`--lib-cloth-${book.cloth}`).trim() || '#2c3d6e'
    const ink = css.getPropertyValue('--lib-cover-ink').trim() || '#f1f2f6'
    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    // Same flat tinted plate as the on-screen Squircle cover.
    ctx.fillStyle = cloth
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(0, 0, size, 4)
    ctx.fillStyle = ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const label = book.coverLabel || book.title
    ctx.font = `700 ${label.length > 10 ? 64 : 92}px system-ui, "Segoe UI", sans-serif`
    ctx.fillText(label, size / 2, size / 2 - 30, size - 96)
    ctx.globalAlpha = 0.4
    ctx.fillRect(size / 2 - 70, size / 2 + 34, 140, 3)
    ctx.globalAlpha = 1
    if (book.subtitle) {
      ctx.font = `600 38px system-ui, "Segoe UI", sans-serif`
      ctx.fillText(book.subtitle, size / 2, size / 2 + 92, size - 96)
    }
    const url = canvas.toDataURL('image/png')
    cache.set(key, url)
    return url
  } catch {
    return null
  }
}
