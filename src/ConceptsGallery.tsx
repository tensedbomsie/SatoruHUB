import { useState } from 'react'

type ConceptLink = {
  name: string
  icon: string
  file: string
}

type ConceptGroup = {
  title: string
  items: ConceptLink[]
}

const CONCEPT_GROUPS: ConceptGroup[] = [
  {
    title: 'Dashboard — สไตล์ต่างๆ',
    items: [
      { name: 'Original', icon: '🧩', file: 'dashboard-v0-original.html' },
      { name: 'Minimal Apple/Linear', icon: '◆', file: 'dashboard-v1-minimal-apple.html' },
      { name: 'Vercel/Startup SaaS', icon: '▲', file: 'dashboard-v2-vercel-saas.html' },
      { name: 'Glassmorphism Glow', icon: '✦', file: 'dashboard-v3-glow-glass.html' },
    ],
  },
  {
    title: 'Business Templates — Dark',
    items: [
      { name: 'E-commerce Storefront', icon: '🛍️', file: 'ecommerce-storefront.html' },
      { name: 'POS ร้านอาหาร/คาเฟ่', icon: '🍽️', file: 'pos-restaurant.html' },
      { name: 'ระบบจองคิวคลินิก', icon: '🩺', file: 'clinic-booking.html' },
      { name: 'อสังหาริมทรัพย์', icon: '🏠', file: 'realestate-portfolio.html' },
    ],
  },
  {
    title: 'Business Templates — Flat/Warm',
    items: [
      { name: 'E-commerce Storefront', icon: '🛍️', file: 'ecommerce-storefront-flat.html' },
      { name: 'POS ร้านอาหาร/คาเฟ่', icon: '🍽️', file: 'pos-restaurant-flat.html' },
      { name: 'Landing Page ร้านอาหาร', icon: '🍔', file: 'restaurant-landing-warm-minimal.html' },
    ],
  },
  {
    title: 'Marketing',
    items: [{ name: 'ปกงาน Freelance', icon: '💬', file: 'gig-cover-simple-warm.html' }],
  },
]

export default function ConceptsGallery() {
  const [conceptMode, setConceptMode] = useState<'grid' | 'preview' | 'moodboard'>('grid')

  return (
    <div className="concepts-page">
      <div className="concepts-toolbar">
        <p className="concepts-intro">รวมงานออกแบบ/เทมเพลตที่ทำไว้</p>
        <div className="concept-mode-toggle">
          <button className={conceptMode === 'grid' ? 'active' : ''} onClick={() => setConceptMode('grid')}>
            ⬛ การ์ด
          </button>
          <button className={conceptMode === 'preview' ? 'active' : ''} onClick={() => setConceptMode('preview')}>
            👁️ ดูรวมในหน้านี้
          </button>
          <button className={conceptMode === 'moodboard' ? 'active' : ''} onClick={() => setConceptMode('moodboard')}>
            🖼️ Moodboard
          </button>
        </div>
      </div>

      {conceptMode === 'moodboard' && (
        <div className="moodboard-grid">
          {CONCEPT_GROUPS.flatMap((group) => group.items).map((item) => (
            <a
              key={item.file}
              className="moodboard-tile"
              href={`${import.meta.env.BASE_URL}concepts/${item.file}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src={`${import.meta.env.BASE_URL}concepts/thumbs/${item.file.replace('.html', '.png')}`}
                alt={item.name}
                loading="lazy"
              />
              <div className="moodboard-caption">
                <span>{item.icon}</span> {item.name}
              </div>
            </a>
          ))}
        </div>
      )}

      {conceptMode !== 'moodboard' &&
        CONCEPT_GROUPS.map((group) => (
          <div key={group.title} className="concepts-group">
            <h2 className="concepts-group-title">{group.title}</h2>

            {conceptMode === 'grid' ? (
              <div className="concepts-grid">
                {group.items.map((item) => (
                  <a
                    key={item.file}
                    className="concept-card card"
                    href={`${import.meta.env.BASE_URL}concepts/${item.file}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="concept-card-icon">{item.icon}</span>
                    <span className="concept-card-name">{item.name}</span>
                  </a>
                ))}
              </div>
            ) : (
              <div className="concepts-preview-grid">
                {group.items.map((item) => (
                  <div key={item.file} className="concept-preview-card">
                    <div className="concept-thumb">
                      <iframe
                        className="concept-preview-frame"
                        src={`${import.meta.env.BASE_URL}concepts/${item.file}`}
                        title={item.name}
                        loading="lazy"
                      />
                      <a
                        className="concept-preview-open"
                        href={`${import.meta.env.BASE_URL}concepts/${item.file}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="เปิดเต็มจอ"
                      >
                        ⤢
                      </a>
                    </div>
                    <div className="concept-meta">
                      <span className="concept-meta-icon">{item.icon}</span>
                      <div className="concept-meta-text">
                        <span className="concept-meta-name">{item.name}</span>
                        <span className="concept-meta-group">{group.title}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
    </div>
  )
}
