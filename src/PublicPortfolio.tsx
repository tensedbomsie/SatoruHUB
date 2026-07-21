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
          Build a <span className="accent">system</span> that's easy to use,
          <br />
          so you can focus on your business
        </h1>
        <p>
          Browse real systems and design concepts I've built. See something you like, or want it tailored to your
          business? Scroll down and take a look — or leave a note below.
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
