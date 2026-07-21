import { useState } from 'react'

type ConceptLink = {
  name: string
  nameEn: string
  icon: string
  file?: string
  url?: string
  thumb?: string
}

type ConceptGroup = {
  title: string
  titleEn: string
  items: ConceptLink[]
}

const CONCEPT_GROUPS: ConceptGroup[] = [
  {
    title: 'เว็บไซต์ที่สร้างให้ลูกค้า',
    titleEn: "Websites I've Built",
    items: [
      {
        name: 'Adorable Grooming by Debbie (Austin, US)',
        nameEn: 'Adorable Grooming by Debbie (Austin, US)',
        icon: '🐩',
        url: 'https://sparkle-pup-style.lovable.app/',
        thumb: 'client-sparkle-pup-style.png',
      },
    ],
  },
  {
    title: 'Dashboard — สไตล์ต่างๆ',
    titleEn: 'Dashboard — Styles',
    items: [
      { name: 'Original', nameEn: 'Original', icon: '🧩', file: 'dashboard-v0-original.html' },
      { name: 'Minimal Apple/Linear', nameEn: 'Minimal Apple/Linear', icon: '◆', file: 'dashboard-v1-minimal-apple.html' },
      { name: 'Vercel/Startup SaaS', nameEn: 'Vercel/Startup SaaS', icon: '▲', file: 'dashboard-v2-vercel-saas.html' },
      { name: 'Glassmorphism Glow', nameEn: 'Glassmorphism Glow', icon: '✦', file: 'dashboard-v3-glow-glass.html' },
      { name: 'Premium Workflow', nameEn: 'Premium Workflow', icon: '⚙️', file: 'dashboard-premium-workflow.html' },
    ],
  },
  {
    title: 'Business Templates — Dark',
    titleEn: 'Business Templates — Dark',
    items: [
      { name: 'E-commerce Storefront', nameEn: 'E-commerce Storefront', icon: '🛍️', file: 'ecommerce-storefront.html' },
      { name: 'POS ร้านอาหาร/คาเฟ่', nameEn: 'Restaurant/Cafe POS', icon: '🍽️', file: 'pos-restaurant.html' },
      { name: 'ระบบจองคิวคลินิก', nameEn: 'Clinic Booking System', icon: '🩺', file: 'clinic-booking.html' },
      { name: 'อสังหาริมทรัพย์', nameEn: 'Real Estate', icon: '🏠', file: 'realestate-portfolio.html' },
    ],
  },
  {
    title: 'Business Templates — Flat/Warm',
    titleEn: 'Business Templates — Flat/Warm',
    items: [
      { name: 'E-commerce Storefront', nameEn: 'E-commerce Storefront', icon: '🛍️', file: 'ecommerce-storefront-flat.html' },
      { name: 'POS ร้านอาหาร/คาเฟ่', nameEn: 'Restaurant/Cafe POS', icon: '🍽️', file: 'pos-restaurant-flat.html' },
      { name: 'Landing Page ร้านอาหาร', nameEn: 'Restaurant Landing Page', icon: '🍔', file: 'restaurant-landing-warm-minimal.html' },
    ],
  },
  {
    title: 'Business Templates — Premium Brand',
    titleEn: 'Business Templates — Premium Brand',
    items: [
      { name: 'AMBRE — E-commerce ระดับพรีเมียม', nameEn: 'AMBRE — Premium E-commerce', icon: '🏺', file: 'ecommerce-premium-brand.html' },
    ],
  },
  {
    title: 'Marketing',
    titleEn: 'Marketing',
    items: [{ name: 'ปกงาน Freelance', nameEn: 'Freelance Gig Cover', icon: '💬', file: 'gig-cover-simple-warm.html' }],
  },
]

const TEXT = {
  th: {
    intro: 'รวมงานออกแบบ/เทมเพลตที่ทำไว้',
    cards: '⬛ การ์ด',
    preview: '👁️ ดูรวมในหน้านี้',
    moodboard: '🖼️ Moodboard',
    openFull: 'เปิดเต็มจอ',
  },
  en: {
    intro: 'A collection of design work and templates',
    cards: '⬛ Cards',
    preview: '👁️ Preview Here',
    moodboard: '🖼️ Moodboard',
    openFull: 'Open Fullscreen',
  },
}

function itemHref(item: ConceptLink) {
  return item.url ?? `${import.meta.env.BASE_URL}concepts/${item.file}`
}

function itemThumb(item: ConceptLink) {
  const file = item.thumb ?? item.file!.replace('.html', '.png')
  return `${import.meta.env.BASE_URL}concepts/thumbs/${file}`
}

export default function ConceptsGallery({ lang = 'th' }: { lang?: 'th' | 'en' }) {
  const [conceptMode, setConceptMode] = useState<'grid' | 'preview' | 'moodboard'>('grid')
  const t = TEXT[lang]

  const groupTitle = (g: ConceptGroup) => (lang === 'en' ? g.titleEn : g.title)
  const itemName = (i: ConceptLink) => (lang === 'en' ? i.nameEn : i.name)

  return (
    <div className="concepts-page">
      <div className="concepts-toolbar">
        <p className="concepts-intro">{t.intro}</p>
        <div className="concept-mode-toggle">
          <button className={conceptMode === 'grid' ? 'active' : ''} onClick={() => setConceptMode('grid')}>
            {t.cards}
          </button>
          <button className={conceptMode === 'preview' ? 'active' : ''} onClick={() => setConceptMode('preview')}>
            {t.preview}
          </button>
          <button className={conceptMode === 'moodboard' ? 'active' : ''} onClick={() => setConceptMode('moodboard')}>
            {t.moodboard}
          </button>
        </div>
      </div>

      {conceptMode === 'moodboard' && (
        <div className="moodboard-grid">
          {CONCEPT_GROUPS.flatMap((group) => group.items).map((item) => (
            <a
              key={item.url ?? item.file}
              className="moodboard-tile"
              href={itemHref(item)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img src={itemThumb(item)} alt={itemName(item)} loading="lazy" />
              <div className="moodboard-caption">
                <span>{item.icon}</span> {itemName(item)}
              </div>
            </a>
          ))}
        </div>
      )}

      {conceptMode !== 'moodboard' &&
        CONCEPT_GROUPS.map((group) => (
          <div key={group.title} className="concepts-group">
            <h2 className="concepts-group-title">{groupTitle(group)}</h2>

            {conceptMode === 'grid' ? (
              <div className="concepts-grid">
                {group.items.map((item) => (
                  <a
                    key={item.url ?? item.file}
                    className="concept-card card"
                    href={itemHref(item)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="concept-card-icon">{item.icon}</span>
                    <span className="concept-card-name">{itemName(item)}</span>
                  </a>
                ))}
              </div>
            ) : (
              <div className="concepts-preview-grid">
                {group.items.map((item) => (
                  <div key={item.url ?? item.file} className="concept-preview-card">
                    <div className="concept-thumb">
                      <iframe className="concept-preview-frame" src={itemHref(item)} title={itemName(item)} loading="lazy" />
                      <a
                        className="concept-preview-open"
                        href={itemHref(item)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={t.openFull}
                      >
                        ⤢
                      </a>
                    </div>
                    <div className="concept-meta">
                      <span className="concept-meta-icon">{item.icon}</span>
                      <div className="concept-meta-text">
                        <span className="concept-meta-name">{itemName(item)}</span>
                        <span className="concept-meta-group">{groupTitle(group)}</span>
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
