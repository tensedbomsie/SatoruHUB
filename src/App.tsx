import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Login from './Login'
import {
  timeAgo,
  fetchStoryboardStats,
  fetchFoodDiaryStats,
  fetchMoneyDiaryStats,
  fetchMovieHubStats,
  type StoryboardStats,
  type FoodDiaryStats,
  type MoneyDiaryStats,
  type MovieHubStats,
} from './liveStats'
import './App.css'

type AppLink = {
  name: string
  description: string
  icon: string
  url: string
}

const APPS: AppLink[] = [
  {
    name: 'Storyboard',
    description: 'กระดานไอเดียแบบ node graph สำหรับแต่งเรื่องสยองขวัญ',
    icon: '🕸️',
    url: 'https://tensedbomsie.github.io/Storyboard/',
  },
  {
    name: 'Food Diary',
    description: 'บันทึกมื้ออาหารประจำวัน พร้อมคำนวณ kcal รวม',
    icon: '🍽️',
    url: 'https://tensedbomsie.github.io/FoodDiary/',
  },
  {
    name: 'Workout Tracker',
    description: 'บันทึกการออกกำลังกาย ท่า/เซ็ต/PR/สถิติครบวงจร',
    icon: '🏋️',
    url: 'https://tensedbomsie.github.io/WorkoutTracker/',
  },
  {
    name: 'Movie Hub',
    description: 'คลังหนังที่เคยดู พร้อมคะแนน รีวิว และข้อมูลจาก TMDb',
    icon: '🎬',
    url: 'https://tensedbomsie.github.io/MovieHub/',
  },
  {
    name: 'Money Diary',
    description: 'บันทึกรายรับ-รายจ่าย พร้อมสรุปยอดและกราฟตามหมวดหมู่',
    icon: '💰',
    url: 'https://tensedbomsie.github.io/MoneyDiary/',
  },
]

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

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 })

function HubCardStats({
  app,
  storyboard,
  food,
  money,
  movie,
}: {
  app: AppLink
  storyboard: StoryboardStats | null
  food: FoodDiaryStats | null
  money: MoneyDiaryStats | null
  movie: MovieHubStats | null
}) {
  if (app.name === 'Storyboard') {
    if (!storyboard) return <span className="hub-card-desc">{app.description}</span>
    return (
      <div className="hub-card-stats">
        <span className="stat-line">{storyboard.count} Projects</span>
        {storyboard.latestName && (
          <>
            <span className="stat-line-sub">ล่าสุด: {storyboard.latestName}</span>
            {storyboard.latestUpdatedAt && (
              <span className="stat-line-sub">แก้ไข {timeAgo(storyboard.latestUpdatedAt)}</span>
            )}
          </>
        )}
      </div>
    )
  }

  if (app.name === 'Food Diary') {
    if (!food) return <span className="hub-card-desc">{app.description}</span>
    return (
      <div className="hub-card-stats">
        <span className="stat-line">🔥 {fmt(food.kcalToday)} kcal วันนี้</span>
        <span className="stat-line-sub">🥩 โปรตีน {fmt(food.proteinToday)}g วันนี้</span>
      </div>
    )
  }

  if (app.name === 'Money Diary') {
    if (!money) return <span className="hub-card-desc">{app.description}</span>
    return (
      <div className="hub-card-stats">
        <span className="stat-line">รายรับวันนี้ ฿{fmt(money.incomeToday)}</span>
        <span className="stat-line-sub">รายรับเดือนนี้ ฿{fmt(money.incomeMonth)}</span>
      </div>
    )
  }

  if (app.name === 'Movie Hub') {
    if (!movie) return <span className="hub-card-desc">{app.description}</span>
    if (!movie.title) return <span className="hub-card-desc">{app.description}</span>
    return (
      <div className="hub-card-stats">
        <span className="stat-line-sub">ดูล่าสุด: {movie.title}</span>
        {movie.rating != null && <span className="stat-line">⭐ {Number(movie.rating).toFixed(1)}</span>}
      </div>
    )
  }

  return <span className="hub-card-desc">{app.description}</span>
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [checked, setChecked] = useState(false)
  const [storyboard, setStoryboard] = useState<StoryboardStats | null>(null)
  const [food, setFood] = useState<FoodDiaryStats | null>(null)
  const [money, setMoney] = useState<MoneyDiaryStats | null>(null)
  const [movie, setMovie] = useState<MovieHubStats | null>(null)
  const [showRegister, setShowRegister] = useState(false)
  const [cornerOpen, setCornerOpen] = useState(false)
  const [view, setView] = useState<'hub' | 'concepts'>('hub')
  const [conceptMode, setConceptMode] = useState<'grid' | 'preview' | 'moodboard'>('grid')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setChecked(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    fetchStoryboardStats().then(setStoryboard)
    fetchFoodDiaryStats().then(setFood)
    fetchMoneyDiaryStats().then(setMoney)
    fetchMovieHubStats().then(setMovie)
  }, [session])

  if (!checked) return null
  if (!session) return <Login />

  return (
    <div className="hub-page fade-in">
      <div className="toolbar">
        {view === 'concepts' ? (
          <button onClick={() => setView('hub')}>← กลับ</button>
        ) : (
          <h1>🏠 Satoru HUB</h1>
        )}
        <span className="spacer" />
        {view === 'hub' && <button onClick={() => setView('concepts')}>🎨 Concepts</button>}
        <span className="user-email">{session.user.email}</span>
        <button onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button>
      </div>

      {view === 'concepts' ? (
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

          {conceptMode !== 'moodboard' && CONCEPT_GROUPS.map((group) => (
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
      ) : (
        <div className="hub-grid">
          {APPS.map((app) => (
            <a key={app.name} className="hub-card card" href={app.url}>
              <span className="hub-card-icon">{app.icon}</span>
              <span className="hub-card-name">{app.name}</span>
              <HubCardStats app={app} storyboard={storyboard} food={food} money={money} movie={movie} />
            </a>
          ))}
        </div>
      )}

      <a
        className="side-link-left"
        href="https://www.vlr.gg/"
        target="_blank"
        rel="noopener noreferrer"
        title="VLR.gg"
      >
        🎯
      </a>

      <div className="corner-links">
        <div className={`corner-links-items${cornerOpen ? ' open' : ''}`}>
          <a
            className="corner-link"
            href="https://web.facebook.com/messages/"
            target="_blank"
            rel="noopener noreferrer"
            title="Messenger"
            tabIndex={cornerOpen ? 0 : -1}
          >
            💬
          </a>
          <a
            className="corner-link"
            href="https://www.instagram.com/direct/inbox/"
            target="_blank"
            rel="noopener noreferrer"
            title="Instagram DM"
            tabIndex={cornerOpen ? 0 : -1}
          >
            📸
          </a>
          <button
            className="corner-link"
            title="ลงทะเบียนเรียน"
            tabIndex={cornerOpen ? 0 : -1}
            onClick={() => setShowRegister(true)}
          >
            🎓
          </button>
        </div>
        <button
          className={`corner-toggle${cornerOpen ? ' open' : ''}`}
          title={cornerOpen ? 'ปิด' : 'เปิด'}
          onClick={() => setCornerOpen((o) => !o)}
        >
          ▲
        </button>
      </div>

      {showRegister && (
        <div className="modal-backdrop" onClick={() => setShowRegister(false)}>
          <div className="modal register-modal" onClick={(e) => e.stopPropagation()}>
            <div className="register-modal-header">
              <h2>ลงทะเบียนเรียน</h2>
              <div className="register-modal-actions">
                <a
                  href="https://iregis2s1.ru.ac.th/ass_prog_semester2/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn"
                >
                  เปิดในแท็บใหม่
                </a>
                <button className="btn" onClick={() => setShowRegister(false)}>
                  ปิด
                </button>
              </div>
            </div>
            <iframe
              src="https://iregis2s1.ru.ac.th/ass_prog_semester2/"
              title="ลงทะเบียนเรียน"
              className="register-iframe"
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default App
