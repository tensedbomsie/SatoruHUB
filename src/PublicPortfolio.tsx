import ConceptsGallery from './ConceptsGallery'
import { TestimonialsList, TestimonialForm } from './Testimonials'

export default function PublicPortfolio() {
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
        <a className="portfolio-cta" href="#gallery">
          View My Work ↓
        </a>
      </section>

      <div id="gallery">
        <ConceptsGallery lang="en" />
      </div>

      <TestimonialsList lang="en" />
      <TestimonialForm lang="en" />

      <footer className="portfolio-footer">© 2026 PPchan Design Concept</footer>
    </div>
  )
}
