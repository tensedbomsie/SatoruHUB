export type ThemeId = 'dark' | 'business' | 'warm'

export type ThemeMeta = {
  id: ThemeId
  name: string
  desc: string
  bg: string
  accent: string
  accent2: string
  cardBg: string
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'dark',
    name: 'Dark Glassmorphism',
    desc: 'ธีมเดิม เขียว-ม่วง กระจกเบลอ',
    bg: '#0a0b0f',
    accent: '#34d399',
    accent2: '#6366f1',
    cardBg: 'rgba(255,255,255,0.06)',
  },
  {
    id: 'business',
    name: 'Business Dark',
    desc: 'ฟ้า-ม่วงอมชมพู อิ่มตัว สไตล์แดชบอร์ด',
    bg: '#0f1115',
    accent: '#22d3ee',
    accent2: '#a78bfa',
    cardBg: 'rgba(255,255,255,0.08)',
  },
  {
    id: 'warm',
    name: 'Flat Warm',
    desc: 'พื้นครีมสว่าง การ์ดแบน ส้ม-เหลือง',
    bg: '#fdf6ec',
    accent: '#f97316',
    accent2: '#f59e0b',
    cardBg: '#ffffff',
  },
]

const STORAGE_KEY = 'satoru_theme'

export function getStoredTheme(): ThemeId {
  const v = localStorage.getItem(STORAGE_KEY)
  if (v === 'dark' || v === 'business' || v === 'warm') return v
  return 'dark'
}

export function applyTheme(id: ThemeId) {
  document.documentElement.setAttribute('data-theme', id)
}

export function setTheme(id: ThemeId) {
  localStorage.setItem(STORAGE_KEY, id)
  applyTheme(id)
}
