import { useEffect } from 'react'
import { getStoredTheme, applyTheme } from './theme'
import ConceptsGallery from './ConceptsGallery'

export default function PublicPortfolio() {
  useEffect(() => {
    applyTheme(getStoredTheme())
  }, [])

  return (
    <div className="hub-page fade-in">
      <div className="toolbar">
        <h1>🧩 Satoru — Portfolio & Design Concepts</h1>
      </div>

      <p className="portfolio-intro">
        A collection of systems and designs I've built — like one of these or want it tailored to your business? Feel
        free to reach out.
      </p>

      <ConceptsGallery lang="en" />
    </div>
  )
}
