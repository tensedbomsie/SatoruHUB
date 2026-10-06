import { useCallback, useEffect, useState } from 'react'

// The Library lives inside the Hub's single page, addressed by hash:
//   #library                 bookcase
//   #library/shelf/<slug>    one shelf
//   #library/book/<slug>     one book and its tracks
// Hash routing keeps it clear of the service worker's navigateFallback and of
// GitHub Pages paths, and makes the phone's back button work naturally.
export type LibraryRoute = { kind: 'home' } | { kind: 'shelf'; slug: string } | { kind: 'book'; slug: string }

export function parseLibraryHash(hash: string): LibraryRoute | null {
  const m = /^#library(?:\/(shelf|book)\/([^/?#]+))?\/?$/.exec(hash)
  if (!m) return null
  if (!m[1]) return { kind: 'home' }
  return { kind: m[1] as 'shelf' | 'book', slug: decodeURIComponent(m[2]) }
}

export function libraryHash(route: LibraryRoute): string {
  return route.kind === 'home' ? '#library' : `#library/${route.kind}/${encodeURIComponent(route.slug)}`
}

export function useLibraryRoute(): [LibraryRoute | null, (route: LibraryRoute | null) => void] {
  const [route, setRoute] = useState<LibraryRoute | null>(() => parseLibraryHash(window.location.hash))

  useEffect(() => {
    const sync = () => setRoute(parseLibraryHash(window.location.hash))
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])

  const navigate = useCallback((next: LibraryRoute | null) => {
    const base = window.location.pathname + window.location.search
    const target = next ? base + libraryHash(next) : base
    if (target !== base + window.location.hash) window.history.pushState(null, '', target)
    setRoute(next)
    window.scrollTo({ top: 0 })
  }, [])

  return [route, navigate]
}
