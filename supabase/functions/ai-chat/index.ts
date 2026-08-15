// AI chat backend for SatoruHUB — proxies to Gemini API, uses function calling
// to read real data from the user's own apps (via Supabase, respecting RLS).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
// Using the lite alias: much higher free-tier daily quota than the full
// flash model (which caps at 20 req/day free) — check
// https://ai.google.dev/gemini-api/docs/rate-limits if quota errors return.
const GEMINI_MODEL = 'gemini-flash-lite-latest'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Names of tools that only PROPOSE a write (never touch the DB here — the
// frontend shows a confirm card and does the actual insert once the user clicks).
const PROPOSE_TOOLS = new Set([
  'propose_add_meal',
  'propose_edit_meal',
  'propose_delete_meal',
  'propose_add_transaction',
  'propose_add_workout_set',
])

// --- Tool definitions (add one entry here per app you want the AI to read/write) ---
const tools = [{
  functionDeclarations: [
    {
      name: 'get_food_summary',
      description: 'ดึงสรุป kcal รวมและจำนวนมื้ออาหารของผู้ใช้ในวันที่กำหนด (ค่าเริ่มต้น = วันนี้)',
      parameters: {
        type: 'OBJECT',
        properties: {
          date: { type: 'STRING', description: 'วันที่รูปแบบ YYYY-MM-DD, ถ้าไม่ระบุใช้วันนี้' },
        },
      },
    },
    {
      name: 'propose_add_meal',
      description:
        'เสนอบันทึกมื้ออาหารใหม่เข้า Food Diary — ยังไม่บันทึกจริงทันที แค่เตรียมข้อมูลให้ผู้ใช้กดยืนยันเองก่อน ใช้ตอนผู้ใช้บอกว่ากินอะไรไปแล้วอยากบันทึก',
      parameters: {
        type: 'OBJECT',
        properties: {
          meal_type: { type: 'STRING', description: 'เช่น มื้อเช้า/มื้อกลางวัน/มื้อเย็น/ของว่าง' },
          description: { type: 'STRING', description: 'ชื่อเมนูอาหาร' },
          kcal: { type: 'NUMBER', description: 'พลังงานโดยประมาณ (kcal)' },
          protein: { type: 'STRING', description: 'โปรตีนโดยประมาณ เช่น "20g"' },
        },
        required: ['meal_type', 'description', 'kcal'],
      },
    },
    {
      name: 'find_meals',
      description:
        'ค้นหามื้ออาหารจริงที่บันทึกไว้แล้วในวันที่กำหนด (ค่าเริ่มต้น = วันนี้) พร้อม meal_id/food_id ของแต่ละมื้อ — ใช้ tool นี้ก่อนเสมอเมื่อผู้ใช้จะแก้ไข/ลบมื้ออาหาร (ไม่ว่าจะเพิ่งบันทึกไปหรือบันทึกไว้นานแล้วก็ตาม) ห้ามเดา meal_id/food_id เอง ต้องเรียก tool นี้หาให้เจอก่อนเสมอ',
      parameters: {
        type: 'OBJECT',
        properties: {
          date: { type: 'STRING', description: 'วันที่รูปแบบ YYYY-MM-DD, ถ้าไม่ระบุใช้วันนี้' },
        },
      },
    },
    {
      name: 'propose_edit_meal',
      description:
        'เสนอแก้ไขมื้ออาหารที่ระบุ (kcal/โปรตีน/ชื่อเมนู) — ต้องเรียก find_meals หา meal_id/food_id ที่ถูกต้องก่อนเสมอ ถ้า find_meals เจอรายการที่ตรงกับที่ผู้ใช้พูดถึงแน่ชัดแค่รายการเดียว เรียก tool นี้ต่อได้เลยในเทิร์นเดียวกัน ไม่ต้องถามยืนยันด้วยข้อความก่อน แต่ถ้าเจอมากกว่า 1 รายการที่เข้าเงื่อนไข หรือไม่แน่ใจว่าตรงกับที่ผู้ใช้หมายถึงมั้ย ให้ถามยืนยันเป็นข้อความก่อนเสมอ',
      parameters: {
        type: 'OBJECT',
        properties: {
          meal_id: { type: 'STRING', description: 'meal_id ที่ได้จาก find_meals' },
          food_id: { type: 'STRING', description: 'food_id ที่ได้จาก find_meals' },
          kcal: { type: 'NUMBER', description: 'ค่า kcal ใหม่ (ถ้าจะแก้)' },
          protein: { type: 'STRING', description: 'โปรตีนใหม่ (ถ้าจะแก้)' },
          description: { type: 'STRING', description: 'ชื่อเมนูใหม่ (ถ้าจะแก้)' },
        },
        required: ['meal_id', 'food_id'],
      },
    },
    {
      name: 'propose_delete_meal',
      description:
        'เสนอลบมื้ออาหารที่ระบุทิ้ง — ต้องเรียก find_meals หา meal_id/food_id ที่ถูกต้องก่อนเสมอ ถ้า find_meals เจอรายการที่ตรงกับที่ผู้ใช้พูดถึงแน่ชัดแค่รายการเดียว เรียก tool นี้ต่อได้เลยในเทิร์นเดียวกัน ไม่ต้องถามยืนยันด้วยข้อความก่อน แต่ถ้าเจอมากกว่า 1 รายการที่เข้าเงื่อนไข หรือไม่แน่ใจว่าตรงกับที่ผู้ใช้หมายถึงมั้ย ให้ถามยืนยันเป็นข้อความก่อนเสมอ',
      parameters: {
        type: 'OBJECT',
        properties: {
          meal_id: { type: 'STRING', description: 'meal_id ที่ได้จาก find_meals' },
          food_id: { type: 'STRING', description: 'food_id ที่ได้จาก find_meals' },
          description: { type: 'STRING', description: 'ชื่อเมนูของมื้อที่จะลบ (ไว้แสดงในการ์ดยืนยัน)' },
          kcal: { type: 'NUMBER', description: 'kcal ของมื้อที่จะลบ (ไว้แสดงในการ์ดยืนยัน)' },
        },
        required: ['meal_id', 'food_id', 'description'],
      },
    },
    {
      name: 'get_money_summary',
      description: 'ดึงสรุปรายรับ/รายจ่าย/เงินออมของเดือนที่กำหนด (ค่าเริ่มต้น = เดือนนี้)',
      parameters: {
        type: 'OBJECT',
        properties: {
          month: { type: 'STRING', description: 'รูปแบบ YYYY-MM เช่น 2026-08, ถ้าไม่ระบุใช้เดือนนี้' },
        },
      },
    },
    {
      name: 'propose_add_transaction',
      description:
        'เสนอบันทึกรายการเงินใหม่ (รายรับ/รายจ่าย/เงินออม) เข้า Money Diary — ยังไม่บันทึกจริง แค่เตรียมให้ผู้ใช้กดยืนยันก่อน',
      parameters: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', description: 'income, expense, หรือ saving เท่านั้น' },
          amount: { type: 'NUMBER', description: 'จำนวนเงิน (บาท)' },
          category: { type: 'STRING', description: 'หมวดหมู่ เช่น อาหาร, เดินทาง, เงินเดือน' },
          note: { type: 'STRING', description: 'บันทึกเพิ่มเติม (ถ้ามี)' },
        },
        required: ['type', 'amount', 'category'],
      },
    },
    {
      name: 'get_workout_summary',
      description: 'ดึงสรุปการออกกำลังกาย (จำนวนเซต, ท่าที่เล่น, volume รวม) ของวันที่กำหนด หรือครั้งล่าสุดถ้าไม่ระบุวันที่',
      parameters: {
        type: 'OBJECT',
        properties: {
          date: { type: 'STRING', description: 'วันที่รูปแบบ YYYY-MM-DD, ถ้าไม่ระบุจะดึงเวิร์กเอาต์ล่าสุด' },
        },
      },
    },
    {
      name: 'propose_add_workout_set',
      description:
        'เสนอบันทึกเซตออกกำลังกายใหม่ (ท่า+เซต) เข้า Workout Tracker เป็นเวิร์กเอาต์ใหม่ — ยังไม่บันทึกจริง แค่เตรียมให้ผู้ใช้กดยืนยันก่อน ใช้ตอนผู้ใช้บอกว่าเล่นท่าอะไร กี่เซต กี่ครั้ง น้ำหนักเท่าไหร่',
      parameters: {
        type: 'OBJECT',
        properties: {
          exercise_name: { type: 'STRING', description: 'ชื่อท่าออกกำลังกาย เช่น Bench Press' },
          sets: {
            type: 'ARRAY',
            description: 'รายการเซต แต่ละเซตมี reps และ weight (กก.)',
            items: {
              type: 'OBJECT',
              properties: {
                reps: { type: 'NUMBER' },
                weight: { type: 'NUMBER' },
              },
              required: ['reps', 'weight'],
            },
          },
        },
        required: ['exercise_name', 'sets'],
      },
    },
    {
      name: 'get_movie_status',
      description: 'ค้นหาสถานะหนัง/ซีรีส์ที่บันทึกไว้ (ดูแล้ว/กำลังดู/อยากดู + คะแนน) หรือถ้าไม่ระบุชื่อ จะดึง 5 เรื่องล่าสุดที่ดูจบ',
      parameters: {
        type: 'OBJECT',
        properties: {
          title_query: { type: 'STRING', description: 'ชื่อหนัง/ซีรีส์ที่ค้นหา (ไม่ต้องพิมพ์เป๊ะ) ปล่อยว่างได้ถ้าอยากดูล่าสุด' },
        },
      },
    },
  ],
}]

// deno-lint-ignore no-explicit-any
async function getFoodSummary(supabase: any, date?: string) {
  const day = date ?? new Date().toISOString().slice(0, 10)
  const { data: meals, error } = await supabase
    .from('meals')
    .select('id, meal_type, eaten_at, meal_foods(quantity, kcal_override, foods(kcal, protein))')
    .gte('eaten_at', `${day}T00:00:00`)
    .lte('eaten_at', `${day}T23:59:59`)

  if (error) return { error: error.message }

  let totalKcal = 0
  // deno-lint-ignore no-explicit-any
  for (const m of meals ?? []) {
    // deno-lint-ignore no-explicit-any
    for (const mf of m.meal_foods ?? []) {
      const kcal = mf.kcal_override ?? mf.foods?.kcal ?? 0
      totalKcal += kcal * (mf.quantity ?? 1)
    }
  }

  return { date: day, meal_count: meals?.length ?? 0, total_kcal: Math.round(totalKcal) }
}

// deno-lint-ignore no-explicit-any
async function findMeals(supabase: any, date?: string) {
  const day = date ?? new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('meals')
    .select('id, meal_type, description, eaten_at, meal_foods(food_id, quantity, kcal_override, foods(kcal, protein))')
    .gte('eaten_at', `${day}T00:00:00`)
    .lte('eaten_at', `${day}T23:59:59`)
    .order('eaten_at', { ascending: true })

  if (error) return { error: error.message }

  // deno-lint-ignore no-explicit-any
  const meals = (data ?? []).map((m: any) => {
    let kcal = 0
    let foodId: string | null = null
    for (const mf of m.meal_foods ?? []) {
      kcal += (mf.kcal_override ?? mf.foods?.kcal ?? 0) * (mf.quantity ?? 1)
      foodId = mf.food_id
    }
    return {
      meal_id: m.id,
      food_id: foodId,
      description: m.description,
      meal_type: m.meal_type,
      kcal: Math.round(kcal),
      eaten_at: m.eaten_at,
    }
  })

  return { date: day, meals }
}

// deno-lint-ignore no-explicit-any
async function getMoneySummary(supabase: any, month?: string) {
  const ym = month ?? new Date().toISOString().slice(0, 7)
  const [y, m] = ym.split('-').map(Number)
  const start = `${ym}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const end = `${ym}-${String(lastDay).padStart(2, '0')}`

  const { data: rows, error } = await supabase
    .from('transactions')
    .select('type, amount')
    .gte('occurred_at', start)
    .lte('occurred_at', end)

  if (error) return { error: error.message }

  const totals: Record<string, number> = { income: 0, expense: 0, saving: 0 }
  // deno-lint-ignore no-explicit-any
  for (const r of rows ?? []) {
    totals[r.type] = (totals[r.type] ?? 0) + Number(r.amount)
  }

  return {
    month: ym,
    income: totals.income,
    expense: totals.expense,
    saving: totals.saving,
    net: totals.income - totals.expense - totals.saving,
  }
}

// deno-lint-ignore no-explicit-any
async function getWorkoutSummary(supabase: any, date?: string) {
  // deno-lint-ignore no-explicit-any
  let query: any = supabase
    .from('workouts')
    .select('id, name, performed_at, workout_exercises(exercises(name), sets(reps, weight))')

  if (date) {
    query = query.gte('performed_at', `${date}T00:00:00`).lte('performed_at', `${date}T23:59:59`)
  } else {
    query = query.order('performed_at', { ascending: false }).limit(1)
  }

  const { data: workouts, error } = await query
  if (error) return { error: error.message }
  if (!workouts || workouts.length === 0) return { found: false }

  let totalSets = 0
  let totalVolume = 0
  const exerciseNames = new Set<string>()
  // deno-lint-ignore no-explicit-any
  for (const w of workouts) {
    // deno-lint-ignore no-explicit-any
    for (const we of w.workout_exercises ?? []) {
      if (we.exercises?.name) exerciseNames.add(we.exercises.name)
      // deno-lint-ignore no-explicit-any
      for (const s of we.sets ?? []) {
        totalSets += 1
        totalVolume += (s.reps ?? 0) * (s.weight ?? 0)
      }
    }
  }

  return {
    workout_count: workouts.length,
    last_performed_at: workouts[0]?.performed_at,
    exercises: [...exerciseNames],
    total_sets: totalSets,
    total_volume_kg: Math.round(totalVolume),
  }
}

// deno-lint-ignore no-explicit-any
async function getMovieStatus(supabase: any, titleQuery?: string) {
  // deno-lint-ignore no-explicit-any
  let query: any = supabase
    .from('watch_entries')
    .select('title, status, rating, watch_date, review')

  if (titleQuery) {
    query = query.ilike('title', `%${titleQuery}%`).limit(5)
  } else {
    query = query.eq('status', 'watched').order('watch_date', { ascending: false }).limit(5)
  }

  const { data, error } = await query
  if (error) return { error: error.message }
  return { results: data ?? [] }
}

// deno-lint-ignore no-explicit-any
async function callGemini(contents: any[], attempt = 1): Promise<any> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, tools }),
    },
  )
  if (res.status === 503 && attempt < 3) {
    // model overloaded on Google's side — back off and retry a couple times
    await new Promise((r) => setTimeout(r, attempt * 800))
    return callGemini(contents, attempt + 1)
  }
  if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${await res.text()}`)
  return res.json()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { message, history = [] } = await req.json()
    // deno-lint-ignore no-explicit-any
    const contents: any[] = [...history, { role: 'user', parts: [{ text: message }] }]

    let response = await callGemini(contents)
    let parts = response.candidates?.[0]?.content?.parts ?? []
    // deno-lint-ignore no-explicit-any
    let pendingAction: any = null

    // Chain tool calls within a single request: a read tool (e.g. find_meals)
    // can be followed immediately by a propose tool (e.g. propose_delete_meal)
    // using the IDs it just looked up — same turn, no separate "yes, confirm
    // that" round trip where the model has to remember context across turns.
    for (let hop = 0; hop < 5; hop++) {
      // deno-lint-ignore no-explicit-any
      const functionCall = parts.find((p: any) => p.functionCall)?.functionCall
      if (!functionCall) break

      if (PROPOSE_TOOLS.has(functionCall.name)) {
        // Do NOT write to the DB here — just hand the proposal back to the
        // frontend so the user has to explicitly click confirm.
        // NOTE: nest args under `args` (not spread) — propose_add_transaction's
        // own "type" field (income/expense/saving) would otherwise clobber
        // this discriminator field.
        pendingAction = { kind: functionCall.name, args: functionCall.args }
        contents.push({ role: 'model', parts })
        contents.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: functionCall.name,
              response: { status: 'awaiting_user_confirmation' },
            },
          }],
        })
        response = await callGemini(contents)
        parts = response.candidates?.[0]?.content?.parts ?? []
        break
      }

      // deno-lint-ignore no-explicit-any
      let result: any
      switch (functionCall.name) {
        case 'get_food_summary':
          result = await getFoodSummary(supabase, functionCall.args?.date)
          break
        case 'find_meals':
          result = await findMeals(supabase, functionCall.args?.date)
          break
        case 'get_money_summary':
          result = await getMoneySummary(supabase, functionCall.args?.month)
          break
        case 'get_workout_summary':
          result = await getWorkoutSummary(supabase, functionCall.args?.date)
          break
        case 'get_movie_status':
          result = await getMovieStatus(supabase, functionCall.args?.title_query)
          break
        default:
          result = { error: `unknown tool ${functionCall.name}` }
      }

      contents.push({ role: 'model', parts })
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: functionCall.name, response: result } }],
      })
      response = await callGemini(contents)
      parts = response.candidates?.[0]?.content?.parts ?? []
      // loop continues — the model may now call a propose tool with the
      // result it just got back, or just answer in plain text
    }

    // deno-lint-ignore no-explicit-any
    const text = parts.find((p: any) => p.text)?.text ?? 'ขอโทษครับ ตอบไม่ได้ตอนนี้ ลองใหม่อีกครั้ง'

    // Persist the final model turn too, so the NEXT request's `history` still
    // has every function call/response that happened along the way — without
    // this, follow-up turns (e.g. "yes, confirm that") lose the meal_id/food_id
    // that an earlier find_meals call resolved, and tool calls start failing.
    contents.push({ role: 'model', parts })

    return new Response(JSON.stringify({ reply: text, pendingAction, history: contents }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
