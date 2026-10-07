// Minimal types for the parts of foliate-js the reader uses. foliate-js ships
// plain JavaScript without declarations.
declare module 'foliate-js/view.js' {
  export type FoliateBook = {
    sections: { id?: string; linear?: string; size?: number }[]
    toc?: { label?: string; href?: string; subitems?: unknown[] }[]
    metadata?: { title?: unknown; language?: string }
    dir?: string
    transformTarget?: EventTarget
  }
  export type Paginator = HTMLElement & {
    setStyles?: (css: string | [string, string]) => void
    getContents(): { doc: Document; index?: number; overlayer?: unknown }[]
    next(): Promise<void>
    prev(): Promise<void>
  }
  export class View extends HTMLElement {
    book: FoliateBook
    renderer: Paginator
    lastLocation: { fraction?: number; cfi?: string } | null
    open(book: FoliateBook | File | Blob | string): Promise<void>
    close(): void
    init(opts: { lastLocation?: unknown; showTextStart?: boolean }): Promise<void>
    goTo(target: unknown): Promise<unknown>
    goToFraction(f: number): Promise<void>
    goLeft(): Promise<void>
    goRight(): Promise<void>
    next(): Promise<void>
    prev(): Promise<void>
    getCFI(index: number, range?: Range): string
    getSectionFractions(): number[]
    addAnnotation(a: { value: string }, remove?: boolean): Promise<unknown>
    deleteAnnotation(a: { value: string }): Promise<unknown>
    search(opts: { query: string; matchCase?: boolean; matchDiacritics?: boolean; matchWholeWords?: boolean; index?: number }): AsyncGenerator<unknown>
    clearSearch(): void
  }
  export function makeBook(file: File | Blob | string): Promise<FoliateBook>
}

declare module 'foliate-js/overlayer.js' {
  export class Overlayer {
    static highlight: unknown
    static underline: unknown
    static outline: unknown
  }
}
