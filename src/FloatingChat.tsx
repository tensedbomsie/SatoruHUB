import { useState, useRef, useEffect } from 'react'
import { supabase } from './lib/supabase'

// Parts can also carry functionCall/functionResponse (no visible text) — the
// full shape must round-trip through `history` so multi-turn tool use keeps
// working, even though we only ever render the `text` ones.
type ChatPart = { text?: string; functionCall?: unknown; functionResponse?: unknown }
type ChatMsg = { role: 'user' | 'model'; parts: ChatPart[] }

type PendingMeal = {
  kind: 'propose_add_meal'
  args: { meal_type: string; description: string; kcal: number; protein: string | null }
}
type PendingEditMeal = {
  kind: 'propose_edit_meal'
  args: { meal_id: string; food_id: string; kcal?: number; protein?: string; description?: string }
}
type PendingDeleteMeal = {
  kind: 'propose_delete_meal'
  args: { meal_id: string; food_id: string; description: string; kcal?: number }
}
type PendingTransaction = {
  kind: 'propose_add_transaction'
  args: { type: 'income' | 'expense' | 'saving'; amount: number; category: string; note: string | null }
}
type PendingWorkoutSet = {
  kind: 'propose_add_workout_set'
  args: { exercise_name: string; sets: { reps: number; weight: number }[] }
}
type PendingAction = PendingMeal | PendingEditMeal | PendingDeleteMeal | PendingTransaction | PendingWorkoutSet

type FloatingChatProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  hideBubble?: boolean
}

const CLOSE_ANIM_MS = 500

export default function FloatingChat({ open: controlledOpen, onOpenChange, hideBubble }: FloatingChatProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = (updater: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof updater === 'function' ? (updater as (prev: boolean) => boolean)(open) : updater
    onOpenChange ? onOpenChange(next) : setInternalOpen(next)
  }
  const [closing, setClosing] = useState(false)
  const wasOpen = useRef(open)

  useEffect(() => {
    if (wasOpen.current && !open) {
      setClosing(true)
      const t = setTimeout(() => setClosing(false), CLOSE_ANIM_MS)
      wasOpen.current = open
      return () => clearTimeout(t)
    }
    wasOpen.current = open
  }, [open])

  const [input, setInput] = useState('')
  const [history, setHistory] = useState<ChatMsg[]>([])
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [saving, setSaving] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, open])

  function pushReply(text: string) {
    setHistory((h) => [...h, { role: 'model', parts: [{ text }] }])
  }

  async function send() {
    const message = input.trim()
    if (!message || loading) return
    setInput('')
    const nextHistory: ChatMsg[] = [...history, { role: 'user', parts: [{ text: message }] }]
    setHistory(nextHistory)
    setLoading(true)

    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: { message, history },
      })
      if (error) throw error
      // Use the server's full history (includes tool-call turns) so the next
      // request still has the context to act on, e.g. after a find_meals lookup.
      setHistory(data.history ?? [...nextHistory, { role: 'model', parts: [{ text: data.reply }] }])
      setPending(data.pendingAction ?? null)
    } catch (e) {
      setHistory([
        ...nextHistory,
        { role: 'model', parts: [{ text: `ขอโทษครับ เกิดข้อผิดพลาด: ${String(e)}` }] },
      ])
    } finally {
      setLoading(false)
    }
  }

  async function confirmPending() {
    if (!pending || saving) return
    setSaving(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const owner = userData.user?.id
      if (!owner) throw new Error('ไม่พบผู้ใช้ที่ล็อกอิน')

      if (pending.kind === 'propose_add_meal') {
        const { meal_type, description, kcal, protein } = pending.args
        const { data: food, error: foodErr } = await supabase
          .from('foods')
          .insert({ owner, name: description, category: 'AI ประมาณ', kcal, protein })
          .select()
          .single()
        if (foodErr) throw foodErr

        const { data: meal, error: mealErr } = await supabase
          .from('meals')
          .insert({ owner, meal_type, description })
          .select()
          .single()
        if (mealErr) throw mealErr

        const { error: linkErr } = await supabase
          .from('meal_foods')
          .insert({ meal_id: meal.id, food_id: food.id, quantity: 1 })
        if (linkErr) throw linkErr

        pushReply(`✅ บันทึก "${description}" ลง ${meal_type} เรียบร้อยครับ`)
      } else if (pending.kind === 'propose_edit_meal') {
        const { meal_id, food_id, kcal, protein, description } = pending.args

        const foodUpdate: Record<string, string | number> = {}
        if (kcal !== undefined) foodUpdate.kcal = kcal
        if (protein !== undefined) foodUpdate.protein = protein
        if (description !== undefined) foodUpdate.name = description
        if (Object.keys(foodUpdate).length > 0) {
          const { error: foodErr } = await supabase.from('foods').update(foodUpdate).eq('id', food_id)
          if (foodErr) throw foodErr
        }

        if (description !== undefined) {
          const { error: mealErr } = await supabase.from('meals').update({ description }).eq('id', meal_id)
          if (mealErr) throw mealErr
        }

        pushReply(`✅ แก้ไข "${description ?? 'มื้ออาหาร'}" เรียบร้อยครับ`)
      } else if (pending.kind === 'propose_delete_meal') {
        const { meal_id, food_id, description } = pending.args
        const { error: mealErr } = await supabase.from('meals').delete().eq('id', meal_id)
        if (mealErr) throw mealErr
        const { error: foodErr } = await supabase.from('foods').delete().eq('id', food_id)
        if (foodErr) throw foodErr

        pushReply(`✅ ลบ "${description}" ออกแล้วครับ`)
      } else if (pending.kind === 'propose_add_transaction') {
        const { type, amount, category, note } = pending.args
        const { error } = await supabase.from('transactions').insert({ owner, type, amount, category, note })
        if (error) throw error
        pushReply(`✅ บันทึก ${type} ${amount} บาท (${category}) เรียบร้อยครับ`)
      } else if (pending.kind === 'propose_add_workout_set') {
        const { exercise_name, sets } = pending.args

        let { data: exercise } = await supabase
          .from('exercises')
          .select('id')
          .ilike('name', exercise_name)
          .maybeSingle()

        if (!exercise) {
          const { data: newExercise, error: exErr } = await supabase
            .from('exercises')
            .insert({ owner, name: exercise_name, category: 'อื่นๆ' })
            .select()
            .single()
          if (exErr) throw exErr
          exercise = newExercise
        }

        const { data: workout, error: workoutErr } = await supabase
          .from('workouts')
          .insert({ owner, name: exercise_name })
          .select()
          .single()
        if (workoutErr) throw workoutErr

        const { data: workoutExercise, error: weErr } = await supabase
          .from('workout_exercises')
          .insert({ workout_id: workout.id, exercise_id: exercise!.id, position: 0 })
          .select()
          .single()
        if (weErr) throw weErr

        const setsPayload = sets.map((s, i) => ({
          workout_exercise_id: workoutExercise.id,
          set_number: i + 1,
          reps: s.reps,
          weight: s.weight,
        }))
        const { error: setsErr } = await supabase.from('sets').insert(setsPayload)
        if (setsErr) throw setsErr

        pushReply(`✅ บันทึก ${exercise_name} (${sets.length} เซต) เรียบร้อยครับ`)
      }

      setPending(null)
    } catch (e) {
      pushReply(`บันทึกไม่สำเร็จ: ${String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {closing && (
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
          <defs>
            <filter id="nanoDissolve" x="-60%" y="-60%" width="220%" height="220%">
              <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="3" seed="7" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" xChannelSelector="R" yChannelSelector="G">
                <animate attributeName="scale" values="0;40;140" keyTimes="0;0.4;1" dur="0.55s" fill="freeze" />
              </feDisplacementMap>
            </filter>
          </defs>
        </svg>
      )}

      {!hideBubble && (
        <button className="fc-bubble" onClick={() => setOpen((o) => !o)} aria-label="เปิด AI chat">
          {open ? '✕' : '🤖'}
        </button>
      )}

      {(open || closing) && (
        <div className={`fc-panel${closing ? ' closing' : ''}`}>
          <div className="fc-header">
            Satoru AI
            <button className="fc-close" onClick={() => setOpen(false)} aria-label="ปิดแชท">✕</button>
          </div>
          <div className="fc-messages">
            {history.length === 0 && (
              <div className="fc-empty">ถามอะไรก็ได้เกี่ยวกับข้อมูลในแอปของนายเลยครับ</div>
            )}
            {history
              .filter((m) => m.parts.some((p) => p.text))
              .map((m, i) => (
                <div key={i} className={`fc-msg fc-msg-${m.role}`}>
                  {m.parts
                    .filter((p) => p.text)
                    .map((p) => p.text)
                    .join('')}
                </div>
              ))}
            {loading && <div className="fc-msg fc-msg-model fc-loading">กำลังคิด...</div>}
            {pending && (
              <div className="fc-pending">
                <div className="fc-pending-title">
                  {pending.kind === 'propose_add_meal' && 'ยืนยันบันทึกมื้ออาหาร?'}
                  {pending.kind === 'propose_edit_meal' && 'ยืนยันแก้ไขมื้ออาหาร?'}
                  {pending.kind === 'propose_delete_meal' && 'ยืนยันลบมื้ออาหาร?'}
                  {pending.kind === 'propose_add_transaction' && 'ยืนยันบันทึกรายการเงิน?'}
                  {pending.kind === 'propose_add_workout_set' && 'ยืนยันบันทึกเวิร์กเอาต์?'}
                </div>
                <div className="fc-pending-body">
                  {pending.kind === 'propose_add_meal' && (
                    <>
                      {pending.args.meal_type} — {pending.args.description}
                      <br />
                      ~{pending.args.kcal} kcal{pending.args.protein ? ` · โปรตีน ${pending.args.protein}` : ''}
                    </>
                  )}
                  {pending.kind === 'propose_edit_meal' && (
                    <>
                      {pending.args.description ?? 'มื้ออาหารที่เลือก'}
                      <br />
                      {pending.args.kcal !== undefined && `~${pending.args.kcal} kcal`}
                      {pending.args.protein !== undefined && ` · โปรตีน ${pending.args.protein}`}
                    </>
                  )}
                  {pending.kind === 'propose_delete_meal' && (
                    <>
                      ลบ "{pending.args.description}"
                      {pending.args.kcal !== undefined && ` (~${pending.args.kcal} kcal)`} ออกจาก Food Diary
                    </>
                  )}
                  {pending.kind === 'propose_add_transaction' && (
                    <>
                      {pending.args.type} — {pending.args.category}
                      <br />
                      {pending.args.amount.toLocaleString()} บาท{pending.args.note ? ` · ${pending.args.note}` : ''}
                    </>
                  )}
                  {pending.kind === 'propose_add_workout_set' && (
                    <>
                      {pending.args.exercise_name}
                      <br />
                      {pending.args.sets.map((s, i) => `เซต ${i + 1}: ${s.reps} ครั้ง × ${s.weight} กก.`).join(' · ')}
                    </>
                  )}
                </div>
                <div className="fc-pending-actions">
                  <button className="fc-confirm" onClick={confirmPending} disabled={saving}>
                    {saving ? 'กำลังบันทึก...' : '✅ บันทึก'}
                  </button>
                  <button className="fc-cancel" onClick={() => setPending(null)} disabled={saving}>
                    ยกเลิก
                  </button>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div className="fc-input-row">
            <input
              className="fc-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="พิมพ์ข้อความ..."
              disabled={loading}
            />
            <button className="fc-send" onClick={send} disabled={loading}>
              ส่ง
            </button>
          </div>
        </div>
      )}
    </>
  )
}
