import { useState } from 'react'
import ConceptsGallery from './ConceptsGallery'
import { TestimonialsList, TestimonialForm } from './Testimonials'
import BuildRequestModal from './BuildRequestModal'
import Reveal from './Reveal'

export default function PublicPortfolio() {
  const [showBuildModal, setShowBuildModal] = useState(false)

  return (
    <div className="portfolio-brand fade-in">
      <section className="portfolio-hero">
        <div className="portfolio-hero-blob b1"></div>
        <div className="portfolio-hero-blob b2"></div>

        <div className="portfolio-wordmark">
          <span className="dot"></span> PPchan Design Concept
        </div>
        <h1>
          Choose a <span className="accent">concept</span>.
          <br />
          Make it yours.
        </h1>
        <p>
          Find a design style that fits your business. Every concept can be customized to match your brand and
          workflow.
        </p>
        <div className="portfolio-hero-actions">
          <a className="portfolio-cta" href="#gallery">
            View My Work ↓
          </a>
          <button className="portfolio-cta portfolio-cta-secondary" onClick={() => setShowBuildModal(true)}>
            Let's build yours →
          </button>
        </div>
      </section>

      <div id="gallery">
        <ConceptsGallery lang="en" />
      </div>

      <Reveal>
        <TestimonialsList lang="en" />
      </Reveal>
      <Reveal>
        <TestimonialForm lang="en" />
      </Reveal>

      <footer className="portfolio-footer">© 2026 PPchan Design Concept</footer>

      {showBuildModal && <BuildRequestModal onClose={() => setShowBuildModal(false)} />}
    </div>
  )
}
