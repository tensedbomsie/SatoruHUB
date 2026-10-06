export function fmtClock(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return '--:--'
  const s = Math.floor(totalSeconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export function fmtLength(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60)
  if (minutes < 1) return 'ไม่ถึง 1 นาที'
  if (minutes < 60) return `${minutes} นาที`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} ชม. ${m} นาที` : `${h} ชม.`
}

export function fmtRate(rate: number): string {
  return `${rate.toFixed(2).replace(/0$/, '').replace(/\.0$/, '')}×`
}

/** Stable small variation (0..1) per string, used for natural-looking book heights. */
export function hashUnit(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 1000) / 1000
}
