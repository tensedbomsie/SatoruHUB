import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

type QuestKey = 'work' | 'body' | 'creative' | 'rest'

const QUESTS: { key: QuestKey; icon: string; label: string }[] = [
  { key: 'work', icon: '🎯', label: 'ทำงาน Ppchan อย่างน้อย 1 ชม.' },
  { key: 'body', icon: '💪', label: 'ขยับร่างกาย' },
  { key: 'creative', icon: '✍️', label: 'งานสร้างสรรค์ 15 นาที' },
  { key: 'rest', icon: '📖', label: 'พักสมอง' },
]

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// Consecutive-day streak ending today (or yesterday if today isn't done yet,
// so an unchecked-so-far today doesn't instantly zero out the streak).
function computeStreak(dates: Set<string>): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let cursor = new Date(today)
  if (!dates.has(cursor.toISOString().slice(0, 10))) {
    cursor.setDate(cursor.getDate() - 1)
  }

  let streak = 0
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export default function DailyQuest() {
  const [completedDates, setCompletedDates] = useState<Record<QuestKey, Set<string>>>({
    work: new Set(),
    body: new Set(),
    creative: new Set(),
    rest: new Set(),
  })
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<QuestKey | null>(null)
  const today = todayStr()

  useEffect(() => {
    const since = new Date()
    since.setDate(since.getDate() - 60)

    supabase
      .from('daily_quest_completions')
      .select('quest_key, completed_date')
      .gte('completed_date', since.toISOString().slice(0, 10))
      .then(({ data }) => {
        const next: Record<QuestKey, Set<string>> = { work: new Set(), body: new Set(), creative: new Set(), rest: new Set() }
        for (const row of data ?? []) {
          next[row.quest_key as QuestKey]?.add(row.completed_date)
        }
        setCompletedDates(next)
        setLoading(false)
      })
  }, [])

  async function toggle(key: QuestKey) {
    if (pending) return
    setPending(key)
    const isDone = completedDates[key].has(today)

    if (isDone) {
      const { error } = await supabase
        .from('daily_quest_completions')
        .delete()
        .eq('quest_key', key)
        .eq('completed_date', today)
      if (!error) {
        setCompletedDates((prev) => {
          const next = new Set(prev[key])
          next.delete(today)
          return { ...prev, [key]: next }
        })
      }
    } else {
      const { data: userData } = await supabase.auth.getUser()
      const owner = userData.user?.id
      if (owner) {
        const { error } = await supabase
          .from('daily_quest_completions')
          .insert({ owner, quest_key: key, completed_date: today })
        if (!error) {
          setCompletedDates((prev) => {
            const next = new Set(prev[key])
            next.add(today)
            return { ...prev, [key]: next }
          })
        }
      }
    }
    setPending(null)
  }

  return (
    <div className="hub-sidebar-card daily-quest-card">
      <div className="hub-sidebar-card-head">⚔️ Daily Quest</div>
      {loading ? (
        <span className="stat-line-sub">กำลังโหลด...</span>
      ) : (
        <div className="daily-quest-list">
          {QUESTS.map((q) => {
            const done = completedDates[q.key].has(today)
            const streak = computeStreak(completedDates[q.key])
            return (
              <button
                key={q.key}
                className={`daily-quest-item${done ? ' done' : ''}`}
                onClick={() => toggle(q.key)}
                disabled={pending === q.key}
              >
                <span className="daily-quest-check">{done ? '✅' : '⬜'}</span>
                <span className="daily-quest-label">
                  {q.icon} {q.label}
                </span>
                {streak > 0 && <span className="daily-quest-streak">🔥{streak}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
