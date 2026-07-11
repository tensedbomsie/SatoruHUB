import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Login from './Login'
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
]

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [checked, setChecked] = useState(false)

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
            <span className="hub-card-desc">{app.description}</span>
          </a>
        ))}
      </div>
    </div>
  )
}

export default App
