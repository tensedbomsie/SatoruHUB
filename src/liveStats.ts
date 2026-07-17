import { supabase } from './lib/supabase'

export type StoryboardStats = {
  count: number
  latestName: string | null
  latestUpdatedAt: string | null
}

export type FoodDiaryStats = {
  kcalToday: number
  proteinToday: number
}

export type MoneyDiaryStats = {
  incomeToday: number
  incomeMonth: number
}

export type MovieHubStats = {
  title: string | null
  rating: number | null
}

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'เมื่อสักครู่'
  if (min < 60) return `${min} นาทีที่แล้ว`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`
  const day = Math.floor(hr / 24)
  return `${day} วันที่แล้ว`
}

export async function fetchStoryboardStats(): Promise<StoryboardStats | null> {
  try {
    const { data, count } = await supabase
      .from('boards')
      .select('name, updated_at', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .limit(1)
    return {
      count: count ?? 0,
      latestName: data?.[0]?.name ?? null,
      latestUpdatedAt: data?.[0]?.updated_at ?? null,
    }
  } catch {
    return null
  }
}

function parseProteinGrams(protein: string | null | undefined): number {
  if (!protein) return 0
  const match = protein.match(/[\d.]+/)
  return match ? parseFloat(match[0]) : 0
}

export async function fetchFoodDiaryStats(): Promise<FoodDiaryStats | null> {
  try {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(startOfDay)
    endOfDay.setDate(endOfDay.getDate() + 1)

    const { data } = await supabase
      .from('meals')
      .select('meal_foods(quantity, kcal_override, food:foods(kcal, protein))')
      .gte('eaten_at', startOfDay.toISOString())
      .lt('eaten_at', endOfDay.toISOString())

    let kcalToday = 0
    let proteinToday = 0
    for (const meal of (data as any[]) ?? []) {
      for (const mf of meal.meal_foods ?? []) {
        const baseKcal = mf.kcal_override ?? mf.food?.kcal ?? 0
        kcalToday += baseKcal * mf.quantity
        proteinToday += parseProteinGrams(mf.food?.protein) * mf.quantity
      }
    }
    return { kcalToday, proteinToday }
  } catch {
    return null
  }
}

export async function fetchMoneyDiaryStats(): Promise<MoneyDiaryStats | null> {
  try {
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    const monthStart = `${todayStr.slice(0, 7)}-01`
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

    const [{ data: todayTx }, { data: monthTx }] = await Promise.all([
      supabase.from('transactions').select('amount').eq('type', 'income').eq('occurred_at', todayStr),
      supabase
        .from('transactions')
        .select('amount')
        .eq('type', 'income')
        .gte('occurred_at', monthStart)
        .lte('occurred_at', monthEnd),
    ])

    const sum = (rows: { amount: number }[] | null) => (rows ?? []).reduce((s, r) => s + Number(r.amount), 0)
    return { incomeToday: sum(todayTx), incomeMonth: sum(monthTx) }
  } catch {
    return null
  }
}

export async function fetchMovieHubStats(): Promise<MovieHubStats | null> {
  try {
    const { data } = await supabase
      .from('watch_entries')
      .select('title, rating')
      .eq('status', 'watched')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return { title: null, rating: null }
    return { title: data.title, rating: data.rating }
  } catch {
    return null
  }
}
