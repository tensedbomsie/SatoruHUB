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
        <h1>🏠 Satoru HUB</h1>
        <span className="spacer" />
        <span className="user-email">{session.user.email}</span>
        <button onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button>
      </div>

      <div className="hub-grid">
        {APPS.map((app) => (
          <a key={app.name} className="hub-card card" href={app.url}>
            <span className="hub-card-icon">{app.icon}</span>
            <span className="hub-card-name">{app.name}</span>
            <HubCardStats app={app} storyboard={storyboard} food={food} money={money} movie={movie} />
          </a>
        ))}
      </div>

      <div className="corner-links">
        <a
          className="corner-link"
          href="https://web.facebook.com/messages/"
          target="_blank"
          rel="noopener noreferrer"
          title="Messenger"
        >
          💬
        </a>
        <a
          className="corner-link"
          href="https://www.instagram.com/direct/inbox/"
          target="_blank"
          rel="noopener noreferrer"
          title="Instagram DM"
        >
          📸
        </a>
        <button className="corner-link" title="ลงทะเบียนเรียน" onClick={() => setShowRegister(true)}>
          🎓
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
