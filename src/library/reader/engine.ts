import type { Bookmark, DocKind, Locator } from '../types'

export type ReaderTheme = 'dark' | 'light' | 'sepia'

export type ReaderPrefs = {
  theme: ReaderTheme
  /** text scale for EPUB / HTML, 0.8 .. 2 */
  fontScale: number
  lineHeight: 1.5 | 1.8 | 2.1
  /** EPUB layout */
  flow: 'paginated' | 'scrolled'
  /** EPUB: override the book's fonts with the system Thai stack */
  systemFont: boolean
  /** PDF layout */
  pdfMode: 'scroll' | 'page'
  /** PDF zoom on top of fit-to-width, 0.6 .. 3 */
  pdfZoom: number
  /** PDF: invert page colours in the dark theme */
  pdfDim: boolean
}

export const DEFAULT_PREFS: ReaderPrefs = {
  theme: 'dark',
  // Thai glyphs sit small at 16px; 110% is a calmer default for long reads
  fontScale: 1.1,
  lineHeight: 1.8,
  flow: 'paginated',
  systemFont: true,
  pdfMode: 'scroll',
  pdfZoom: 1,
  pdfDim: true,
}

export type TocItem = { label: string; target: string; depth: number }

export type EngineLocation = {
  locator: Locator
  /** 0..100 of the whole file */
  percent: number
  chapter: string | null
  /** the engine's own time estimate, used when the sync script had none */
  minutesLeft: number | null
  page?: { current: number; total: number }
}

export type SearchHit = { target: string; label: string; pre: string; match: string; post: string }

export type EngineCallbacks = {
  onRelocate: (loc: EngineLocation) => void
  /** tap in the reading area: left / right third turn pages, centre toggles the chrome */
  onTap: (zone: 'left' | 'center' | 'right') => void
  onKey: (e: KeyboardEvent) => void
  /** EPUB: text was selected (empty string when cleared) */
  onSelection?: (text: string) => void
  /** EPUB: a highlight was tapped */
  onHighlightTap?: (value: string) => void
}

export interface ReaderEngine {
  readonly kind: DocKind
  readonly toc: TocItem[]
  /** prev/next move by screen pages (EPUB paginated, PDF page mode) */
  readonly paged: boolean
  goTo(target: string): Promise<void>
  goToFraction(fraction: number): Promise<void>
  next(): void
  prev(): void
  applyPrefs(p: ReaderPrefs): void
  search?(query: string, onHit: (hit: SearchHit) => void, signal: AbortSignal): Promise<void>
  clearSearch?(): void
  /** EPUB: highlight the current selection; returns what to store */
  highlightSelection?(): { locator: Locator; excerpt: string; percent: number } | null
  showHighlights?(list: Bookmark[]): void
  destroy(): void
}

export type EngineInit = {
  container: HTMLElement
  data: ArrayBuffer
  prefs: ReaderPrefs
  initial: Locator | null
  callbacks: EngineCallbacks
}

/** Error with a reader-facing explanation and a way out. */
export class ReaderError extends Error {
  readonly title: string
  readonly hint: string
  constructor(title: string, hint: string, cause?: unknown) {
    super(title, { cause })
    this.title = title
    this.hint = hint
  }
}

// Thai is read slower per character than English and has no spaces; both
// rates are deliberately conservative (same as scripts/library/sync.ts).
export function minutesForText(text: string): number {
  let thai = 0
  let other = 0
  for (const ch of text) {
    if (/\s/.test(ch)) continue
    const c = ch.codePointAt(0)!
    if (c >= 0x0e00 && c <= 0x0e7f) thai++
    else other++
  }
  return thai / 650 + other / 1000
}

export const SYSTEM_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans Thai', 'Leelawadee UI', Thonburi, Tahoma, system-ui, sans-serif"

// `mark` tints text selection; `hl` is the solid highlight colour that
// foliate's overlayer lays down at its own ~30% opacity.
export const THEME_INK: Record<ReaderTheme, { bg: string; ink: string; dim: string; link: string; mark: string; hl: string }> = {
  dark: { bg: '#101117', ink: '#dcdee6', dim: '#9ca0ae', link: '#a5a5fb', mark: 'rgba(139, 139, 250, 0.38)', hl: '#9d9dff' },
  light: { bg: '#f7f7f4', ink: '#1d1e24', dim: '#5d606b', link: '#4447c9', mark: 'rgba(250, 204, 21, 0.45)', hl: '#f5c400' },
  sepia: { bg: '#f2e8d5', ink: '#3a2e21', dim: '#6f5c45', link: '#8a4f1c', mark: 'rgba(214, 153, 64, 0.42)', hl: '#e08a1e' },
}
