import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TestimonialsList, TestimonialForm } from './Testimonials'
import BuildRequestModal from './BuildRequestModal'
import Reveal from './Reveal'
import PortfolioNav from './PortfolioNav'

type Solution = {
  eyebrow: string
  challenge: string
  tools: string[]
  outcome: string
  url: string
  thumb: string
}

const SOLUTIONS: Solution[] = [
  {
    eyebrow: 'Mobile Pet Grooming',
    challenge: 'A mobile groomer needed to explain why house-calls beat the salon — before anyone would trust the idea.',
    tools: ['Website'],
    outcome: 'A calm, story-led site built around "we come to you" — not a generic grooming template.',
    url: 'https://tensedbomsie.github.io/MissDsPetGrooming/',
    thumb: 'client-missdspetgrooming.png',
  },
  {
    eyebrow: 'Dental Clinic',
    challenge: 'A new dental practice needed to earn trust with patients who had never met them before.',
    tools: ['Website'],
    outcome: 'A modern, reassuring first impression for patients choosing a new dentist.',
    url: 'https://tensedbomsie.github.io/VDental/',
    thumb: 'client-vdental.png',
  },
  {
    eyebrow: 'Salon & Spa',
    challenge: 'The same pricing questions kept coming in over DM, one at a time.',
    tools: ['Website'],
    outcome: 'Every service and price laid out clearly — no more "how much for a haircut?" DMs.',
    url: 'https://tensedbomsie.github.io/StrandSalonSpa/',
    thumb: 'client-strand-beauty-glow.png',
  },
  {
    eyebrow: 'Bakery',
    challenge: 'Custom cake requests were scattered across Instagram comments and DMs.',
    tools: ['Website'],
    outcome: 'A custom-order story front and center, with a clear way to reach out about a cake.',
    url: 'https://tensedbomsie.github.io/PasteleriaColin/',
    thumb: 'client-pasteleriacolin.png',
  },
  {
    eyebrow: 'Booking System',
    challenge: 'Customers had to call or message just to check availability — and staff had to answer every one.',
    tools: ['Website', 'Self-serve Booking', 'Owner Dashboard'],
    outcome:
      'Customers pick their own time and confirm it themselves — the owner sees every booking in one place instead of a notebook.',
    url: 'https://tensedbomsie.github.io/BookingSystemDemo/',
    thumb: 'client-bookingsystemdemo.png',
  },
]

const HOW_WE_WORK = [
  'Understand your business',
  'Identify opportunities',
  'Design the right solution',
  'Build',
  'Improve',
]

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
      <PortfolioNav visible={!heroVisible} />
      <section className="portfolio-hero" ref={heroRef}>
        <div className="portfolio-hero-grid" aria-hidden="true"></div>

        <div className="portfolio-hero-inner">
          <div className="portfolio-wordmark">
            <span className="dot"></span> PPchan Design Concept
          </div>
          <h1>
            Every business works differently.
            <br />
            Your <span className="accent">tools</span> should too.
          </h1>
          <p>
            Every business has its own way of working. We design the digital tools that fit around that — instead of
            asking your business to adapt to generic software.
          </p>
          <div className="portfolio-hero-actions">
            <button className="portfolio-cta portfolio-cta-secondary" onClick={() => setShowBuildModal(true)}>
              Let's talk about your business →
            </button>
            <a className="portfolio-cta-ghost" href="#bridge">
              See how we think ↓
            </a>
          </div>
          <a
            className="portfolio-hero-demo-chip"
            href="https://bookingdemo.ppchan.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            🗓️ See it in action — live Booking System demo →
          </a>
        </div>

        <div className="portfolio-hero-index" aria-hidden="true">
          <span>01</span>
          <span>Philosophy</span>
          <span>02</span>
          <span>Solutions</span>
          <span>03</span>
          <span>Process</span>
        </div>
      </section>

      <section className="portfolio-bridge" id="bridge">
        <Reveal>
          <h2 className="bridge-heading">Most software feels like it was built for everyone.</h2>
        </Reveal>
        <Reveal>
          <p className="bridge-lead">
            Which usually means it wasn't really built for anyone in particular. A salon doesn't run like a bakery. A
            clinic doesn't run like a repair shop — so the tools each of them uses probably shouldn't look the same
            either.
          </p>
        </Reveal>
        <Reveal className="bridge-illustration">
          {['Salon', 'Bakery', 'Clinic', 'Repair Shop'].map((biz) => (
            <span key={biz} className="bridge-tag">
              {biz}
            </span>
          ))}
        </Reveal>
      </section>

      <section className="portfolio-section" id="philosophy">
        <Reveal>
          <div className="ps-eyebrow">Our Philosophy</div>
        </Reveal>
        <Reveal>
          <p className="ps-lead">
            We're not a web agency, and we're not a software vendor.
            <br />
            <br />
            We're a small team that spends time understanding how a business actually works before suggesting
            anything — because the right tool depends entirely on the business it's for.
            <br />
            <br />
            Sometimes that's a beautifully designed website. Sometimes it's a booking calendar that runs itself.
            Sometimes it's just one screen that shows what's happening today instead of five scattered notebooks and
            chats.
            <br />
            <br />
            We'd rather understand your business first, and build something that actually fits — even if that means
            building less than you expected.
          </p>
        </Reveal>
      </section>

      <section className="portfolio-section" id="whatwedo">
        <Reveal>
          <div className="ps-eyebrow">What We Do</div>
        </Reveal>
        <div className="wwd-journey">
          <Reveal className="wwd-step">
            <h3>Help people find you</h3>
            <p>A site that explains who you are before they even call.</p>
            <span className="wwd-step-tag">Website</span>
          </Reveal>
          <div className="wwd-journey-arrow">↓</div>
          <Reveal className="wwd-step">
            <h3>Help your team work better</h3>
            <p>One dashboard instead of five scattered notebooks and chats.</p>
            <span className="wwd-step-tag">Dashboard · Workflow</span>
          </Reveal>
          <div className="wwd-journey-arrow">↓</div>
          <Reveal className="wwd-step">
            <h3>Help your business grow</h3>
            <p>Less time on repetitive tasks, more time on what matters.</p>
            <span className="wwd-step-tag">Automation · Booking</span>
          </Reveal>
        </div>
        <Reveal>
          <p className="wwd-closing">Website. Dashboard. Automation. These are the tools — not the point.</p>
        </Reveal>
      </section>

      <section className="portfolio-solutions" id="solutions">
        <Reveal>
          <div className="ps-eyebrow">Featured Solutions</div>
        </Reveal>
        <Reveal>
          <h2 className="ps-heading">A few real projects, and what they actually do.</h2>
        </Reveal>
        <div className="solutions-grid">
          {SOLUTIONS.map((s) => (
            <Reveal key={s.eyebrow} className="solution-card">
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="solution-thumb">
                <img src={`${import.meta.env.BASE_URL}concepts/thumbs/${s.thumb}`} alt={s.eyebrow} loading="lazy" />
              </a>
              <div className="solution-body">
                <div className="solution-eyebrow">{s.eyebrow}</div>

                <div className="solution-block">
                  <span className="solution-label">Challenge</span>
                  <p>{s.challenge}</p>
                </div>

                <div className="solution-block">
                  <span className="solution-label">Solution</span>
                  <div className="solution-tags">
                    {s.tools.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                </div>

                <div className="solution-block">
                  <span className="solution-label">Outcome</span>
                  <p>{s.outcome}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="portfolio-section" id="howwework">
        <Reveal>
          <div className="ps-eyebrow">How We Work</div>
        </Reveal>
        <div className="how-we-work">
          {HOW_WE_WORK.map((step, i) => (
            <Reveal key={step} className="how-step-wrap">
              <div className="how-step">{step}</div>
              {i < HOW_WE_WORK.length - 1 && <div className="how-arrow">↓</div>}
            </Reveal>
          ))}
        </div>
      </section>

      <section className="portfolio-final-cta">
        <Reveal>
          <h2>Let's explore your business together.</h2>
        </Reveal>
        <Reveal>
          <p>No pitch, no packages upfront — just a conversation about how things run today.</p>
        </Reveal>
        <Reveal>
          <button className="portfolio-cta" onClick={() => setShowBuildModal(true)}>
            Start the conversation →
          </button>
        </Reveal>
      </section>

      <Reveal>
        <TestimonialsList lang="en" />
      </Reveal>
      <Reveal>
        <TestimonialForm lang="en" />
      </Reveal>

      <footer className="portfolio-footer">© 2026 PPchan Design Concept</footer>

      {createPortal(
        <button
          className={`portfolio-cta portfolio-fab${heroVisible ? '' : ' portfolio-fab-visible'}`}
          onClick={() => setShowBuildModal(true)}
        >
          Let's build yours →
        </button>,
        document.body,
      )}

      {showBuildModal && <BuildRequestModal onClose={() => setShowBuildModal(false)} />}
    </div>
  )
}
