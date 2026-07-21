import { useEffect, useRef, useState } from 'react'
import ConceptsGallery from './ConceptsGallery'
import { TestimonialsList, TestimonialForm } from './Testimonials'
import BuildRequestModal from './BuildRequestModal'
import Reveal from './Reveal'

export default function PublicPortfolio() {
  const [showBuildModal, setShowBuildModal] = useState(false)
  const [heroVisible, setHeroVisible] = useState(true)
  const heroRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = heroRef.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting), { threshold: 0 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="portfolio-brand fade-in">
      <section className="portfolio-hero" ref={heroRef}>
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

      <button
        className={`portfolio-cta portfolio-fab${heroVisible ? '' : ' portfolio-fab-visible'}`}
        onClick={() => setShowBuildModal(true)}
      >
        Let's build yours →
      </button>

      {showBuildModal && <BuildRequestModal onClose={() => setShowBuildModal(false)} />}
    </div>
  )
}
