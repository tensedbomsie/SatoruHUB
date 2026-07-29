import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const SECTIONS = [
  { id: 'philosophy', label: 'Philosophy' },
  { id: 'whatwedo', label: 'What We Do' },
  { id: 'solutions', label: 'Solutions' },
  { id: 'howwework', label: 'How We Work' },
]

export default function PortfolioNav({ visible }: { visible: boolean }) {
  const [active, setActive] = useState(0)
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    const observers = SECTIONS.map((s, i) => {
      const el = document.getElementById(s.id)
      if (!el) return null
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActive(i)
        },
        { rootMargin: '-40% 0px -50% 0px', threshold: 0 },
      )
      obs.observe(el)
      return obs
    })
    return () => observers.forEach((o) => o?.disconnect())
  }, [])

  useEffect(() => {
    const btn = btnRefs.current[active]
    if (btn) setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth })
  }, [active, visible])

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return createPortal(
    <nav className={`portfolio-liquid-nav${visible ? ' portfolio-liquid-nav-visible' : ''}`}>
      <div className="portfolio-liquid-pill" style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }} />
      {SECTIONS.map((s, i) => (
        <button
          key={s.id}
          ref={(el) => {
            btnRefs.current[i] = el
          }}
          className={`portfolio-liquid-link${active === i ? ' active' : ''}`}
          onClick={() => scrollTo(s.id)}
        >
          {s.label}
        </button>
      ))}
    </nav>,
    document.body,
  )
}
