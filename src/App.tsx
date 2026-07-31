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
  fetchTechDictionaryStats,
  type StoryboardStats,
  type FoodDiaryStats,
  type MoneyDiaryStats,
  type MovieHubStats,
  type TechDictionaryStats,
} from './liveStats'
import { THEMES, getStoredTheme, applyTheme, setTheme, type ThemeId } from './theme'
import { getStoredHubName, setHubName, DEFAULT_HUB_NAME } from './hubSettings'
import ConceptsGallery from './ConceptsGallery'
import PublicPortfolio from './PublicPortfolio'
import TestimonialsAdmin from './TestimonialsAdmin'
import ProjectRequestsAdmin from './ProjectRequestsAdmin'
import MarqueeTicker from './MarqueeTicker'
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
  {
    name: 'Tech Dictionary',
    description: 'พจนานุกรมศัพท์เว็บ/ไอที อธิบายง่ายๆ พร้อมค้นหาและหมวดหมู่',
    icon: '📖',
    url: 'https://tensedbomsie.github.io/TechDictionary/',
  },
  {
    name: 'Booking Demo',
    description: 'ระบบจองคิวตัวอย่างที่ใช้เสนอลูกค้าจริง พร้อม auto-invoice และ dashboard',
    icon: '🗓️',
    url: 'https://bookingdemo.ppchan.com/',
  },
]

type QuickLink = { name: string; icon: 'youtube' | string; url: string }

const QUICK_LINKS: QuickLink[] = [{ name: 'YouTube', icon: 'youtube', url: 'https://www.youtube.com/' }]

type FavoriteChannel = { name: string; url: string }

const FAVORITE_CHANNELS: FavoriteChannel[] = [
  { name: 'Ohana', url: 'https://www.youtube.com/@ohanaclip' },
  { name: 'Wednesday Night', url: 'https://www.youtube.com/@wednesdaynight' },
]

function QuickLinkIcon({ icon }: { icon: string }) {
  if (icon === 'youtube') {
    return (
      <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">
        <path
          fill="#FF0000"
          d="M23.498 6.186a2.994 2.994 0 0 0-2.107-2.117C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.391.524A2.994 2.994 0 0 0 .502 6.186 31.26 31.26 0 0 0 0 12a31.26 31.26 0 0 0 .502 5.814 2.994 2.994 0 0 0 2.107 2.117c1.886.524 9.391.524 9.391.524s7.505 0 9.391-.524a2.994 2.994 0 0 0 2.107-2.117A31.26 31.26 0 0 0 24 12a31.26 31.26 0 0 0-.502-5.814z"
        />
        <path fill="#fff" d="M9.75 15.02V8.98L15.5 12l-5.75 3.02z" />
      </svg>
    )
  }
  return <span className="hub-card-icon">{icon}</span>
}

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 })

function HubCardStats({
  app,
  storyboard,
  food,
  money,
  movie,
  techDict,
}: {
  app: AppLink
  storyboard: StoryboardStats | null
  food: FoodDiaryStats | null
  money: MoneyDiaryStats | null
  movie: MovieHubStats | null
  techDict: TechDictionaryStats | null
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

  if (app.name === 'Tech Dictionary') {
    if (!techDict || techDict.count === 0) return <span className="hub-card-desc">{app.description}</span>
    return (
      <div className="hub-card-stats">
        <span className="stat-line">📖 {techDict.count} คำศัพท์</span>
        <span className="stat-line-sub">{techDict.categoryCount} หมวดหมู่</span>
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
  const [techDict, setTechDict] = useState<TechDictionaryStats | null>(null)
  const [showRegister, setShowRegister] = useState(false)
  const [cornerOpen, setCornerOpen] = useState(false)
  const [view, setView] = useState<'hub' | 'concepts' | 'testimonials' | 'requests'>('hub')
  const [showQuickLinks, setShowQuickLinks] = useState(false)
  const [showFavorites, setShowFavorites] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [currentTheme, setCurrentTheme] = useState<ThemeId>('dark')
  const [hubName, setHubNameState] = useState(DEFAULT_HUB_NAME)
  const [nameDraft, setNameDraft] = useState(DEFAULT_HUB_NAME)
  const [isPortfolio] = useState(() => {
    const path = window.location.pathname.replace(/\/$/, '')
    if (path.endsWith('/PPchanDesignConcepts')) return true
    const host = window.location.hostname
    return (host === 'ppchan.com' || host === 'www.ppchan.com') && path === ''
  })

  useEffect(() => {
    const stored = getStoredTheme()
    setCurrentTheme(stored)
    applyTheme(stored)
    const storedName = getStoredHubName()
    setHubNameState(storedName)
    setNameDraft(storedName)
  }, [])

  const chooseTheme = (id: ThemeId) => {
    setTheme(id)
    setCurrentTheme(id)
  }

  const saveHubName = () => {
    const trimmed = nameDraft.trim() || DEFAULT_HUB_NAME
    setHubName(trimmed)
    setHubNameState(trimmed)
    setNameDraft(trimmed)
  }

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
    fetchTechDictionaryStats().then(setTechDict)
  }, [session])

  if (isPortfolio) return <PublicPortfolio />

  if (!checked) return null
  if (!session) return <Login />

  return (
    <div className="hub-page fade-in">
      <div className="toolbar">
        {view !== 'hub' ? (
          <button onClick={() => setView('hub')}>← กลับ</button>
        ) : (
          <h1>🏠 {hubName}</h1>
        )}
        <span className="spacer" />
        {view === 'hub' && (
          <>
            <button className="nav-btn nav-btn-1" onClick={() => setView('concepts')}>🎨 Concepts</button>
            <button className="nav-btn nav-btn-2" onClick={() => setView('testimonials')}>💬 รีวิว</button>
            <button className="nav-btn nav-btn-3" onClick={() => setView('requests')}>📋 คำขอสร้างเว็บ</button>
            <a
              className="toolbar-link nav-btn nav-btn-4"
              href={`${import.meta.env.BASE_URL}PPchanDesignConcepts`}
              target="_blank"
              rel="noopener noreferrer"
            >
              🌐 Portfolio
            </a>
          </>
        )}
        <button className="nav-btn nav-btn-5" onClick={() => setShowSettings(true)} title="ตั้งค่า">⚙️ ตั้งค่า</button>
        <span className="user-email">{session.user.email}</span>
        <button onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button>
      </div>

      {view === 'concepts' ? (
        <ConceptsGallery />
      ) : view === 'testimonials' ? (
        <TestimonialsAdmin />
      ) : view === 'requests' ? (
        <ProjectRequestsAdmin />
      ) : (
        <div className="flip-zone">
          <button
            className="flip-trigger"
            onClick={() => setShowQuickLinks((v) => !v)}
            title="พลิกดูลิงก์ที่ใช้บ่อย"
          >
            🔄
          </button>
          <div className={`flip-scene${showQuickLinks ? ' flipped' : ''}`}>
            <div className="flip-face flip-front">
              <div className="hub-grid">
                {APPS.map((app) => (
                  <a key={app.name} className="hub-card card" href={app.url}>
                    <span className="hub-card-icon">{app.icon}</span>
                    <span className="hub-card-name">{app.name}</span>
                    <HubCardStats app={app} storyboard={storyboard} food={food} money={money} movie={movie} techDict={techDict} />
                  </a>
                ))}
              </div>
            </div>
            <div className="flip-face flip-back">
              <div className="quick-links-column">
                <div className="youtube-bar">
                  <button
                    className="youtube-bar-hamburger"
                    onClick={() => setShowFavorites((v) => !v)}
                    title="ช่องโปรด"
                  >
                    ☰
                  </button>
                  <div className="youtube-bar-body">
                    {!showFavorites ? (
                      <a
                        key="yt"
                        className="youtube-bar-main fade-in"
                        href={QUICK_LINKS[0].url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <QuickLinkIcon icon={QUICK_LINKS[0].icon} />
                        <span className="hub-card-name">{QUICK_LINKS[0].name}</span>
                      </a>
                    ) : (
                      <div key="favs" className="favorites-list fade-in">
                        {FAVORITE_CHANNELS.map((ch) => (
                          <a key={ch.name} className="favorites-list-item" href={ch.url} target="_blank" rel="noopener noreferrer">
                            {ch.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <MarqueeTicker storyboard={storyboard} food={food} money={money} movie={movie} techDict={techDict} />

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

      {showSettings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
            <h2>⚙️ ตั้งค่า</h2>
            <p className="modal-sub">การตั้งค่าเหล่านี้เก็บในเครื่องนี้ และซิงก์ไปทุกแอปในเครือด้วย</p>

            <div className="settings-section">
              <h3 className="settings-section-title">ชื่อฮับ</h3>
              <div className="settings-name-row">
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder={DEFAULT_HUB_NAME}
                  maxLength={40}
                />
                <button className="btn btn-primary" onClick={saveHubName} disabled={nameDraft.trim() === hubName}>
                  บันทึก
                </button>
              </div>
            </div>

            <div className="settings-section">
              <h3 className="settings-section-title">ธีม</h3>
              <div className="theme-grid">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    className={`theme-card${currentTheme === t.id ? ' active' : ''}`}
                    onClick={() => chooseTheme(t.id)}
                  >
                    <div className="theme-card-swatch" style={{ background: t.bg }}>
                      <span className="theme-swatch-dot" style={{ background: t.accent }} />
                      <span className="theme-swatch-dot" style={{ background: t.accent2 }} />
                    </div>
                    <div className="theme-card-label">
                      <span className="theme-card-name">{t.name}</span>
                      <span className="theme-card-desc">{t.desc}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={() => setShowSettings(false)}>ปิด</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
