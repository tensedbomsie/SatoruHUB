import { useState } from 'react'
import { timeAgo, type StoryboardStats, type FoodDiaryStats, type WorkoutStats, type MoneyDiaryStats, type MovieHubStats, type TechDictionaryStats } from './liveStats'

type WheelApp = {
  name: string
  icon: string
  url: string
}

// Radius bounds for the wedge ring, in SVG user units (viewBox is 0 0 100 100).
const R_IN = 25
const R_OUT = 49
const GAP_DEG = 3.5

function pointXY(rUnits: number, angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180
  return [50 + rUnits * Math.sin(rad), 50 - rUnits * Math.cos(rad)]
}

function wedgePath(r1: number, r2: number, a1: number, a2: number) {
  const [ox1, oy1] = pointXY(r2, a1)
  const [ox2, oy2] = pointXY(r2, a2)
  const [ix2, iy2] = pointXY(r1, a2)
  const [ix1, iy1] = pointXY(r1, a1)
  const largeArc = a2 - a1 > 180 ? 1 : 0
  return `M ${ox1} ${oy1} A ${r2} ${r2} 0 ${largeArc} 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${r1} ${r1} 0 ${largeArc} 0 ${ix1} ${iy1} Z`
}

// A dashed arc used for the purely decorative depth rings.
function arcPath(r: number, a1: number, a2: number) {
  const [x1, y1] = pointXY(r, a1)
  const [x2, y2] = pointXY(r, a2)
  const largeArc = a2 - a1 > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
}

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 })

function getDetail(
  appName: string,
  data: {
    storyboard: StoryboardStats | null
    food: FoodDiaryStats | null
    workout: WorkoutStats | null
    money: MoneyDiaryStats | null
    movie: MovieHubStats | null
    techDict: TechDictionaryStats | null
  },
): string {
  switch (appName) {
    case 'Storyboard':
      if (!data.storyboard) return ''
      return `${data.storyboard.count} โปรเจกต์`
    case 'Food Diary':
      if (!data.food) return ''
      return `🔥 ${fmt(data.food.kcalToday)} kcal`
    case 'Workout Tracker':
      if (!data.workout?.lastPerformedAt) return ''
      return `${data.workout.totalSets} เซต · ${timeAgo(data.workout.lastPerformedAt)}`
    case 'Money Diary':
      if (!data.money) return ''
      return `฿${fmt(data.money.incomeToday)} วันนี้`
    case 'Movie Hub':
      if (!data.movie?.title) return ''
      return data.movie.rating != null ? `⭐ ${Number(data.movie.rating).toFixed(1)}` : data.movie.title
    case 'Tech Dictionary':
      if (!data.techDict || data.techDict.count === 0) return ''
      return `${data.techDict.count} คำศัพท์`
    default:
      return ''
  }
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString('th-TH', { hour12: false })
}

export default function HubWheel({
  apps,
  onCenterClick,
  centerActive,
  storyboard,
  food,
  workout,
  money,
  movie,
  techDict,
  lastSync,
}: {
  apps: WheelApp[]
  onCenterClick: () => void
  centerActive: boolean
  storyboard: StoryboardStats | null
  food: FoodDiaryStats | null
  workout: WorkoutStats | null
  money: MoneyDiaryStats | null
  movie: MovieHubStats | null
  techDict: TechDictionaryStats | null
  lastSync: Date | null
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const count = apps.length
  const segmentAngle = 360 / count
  const midRadius = (R_IN + R_OUT) / 2
  const statData = { storyboard, food, workout, money, movie, techDict }

  const activeCount = [
    food && food.kcalToday > 0,
    workout?.lastPerformedAt,
    money && money.incomeToday > 0,
    movie?.title,
  ].filter(Boolean).length

  const hoveredDetail = hovered ? getDetail(hovered, statData) : ''

  return (
    <div className={`hub-wheel${centerActive ? ' vortex' : ''}`}>
      {/* ambient system readout */}
      <div className="hub-wheel-ambient hub-wheel-ambient-left">
        <div className="ambient-label">SYSTEM STATUS</div>
        <div className="ambient-value"><span className="ambient-dot" /> ONLINE</div>
      </div>
      <div className="hub-wheel-ambient hub-wheel-ambient-right">
        <div className="ambient-label">{String(count).padStart(2, '0')} MODULES</div>
        <div className="ambient-value">{String(activeCount).padStart(2, '0')} ACTIVE</div>
        {lastSync && (
          <>
            <div className="ambient-label ambient-label-spaced">LAST SYNC</div>
            <div className="ambient-value ambient-value-small">{fmtTime(lastSync)}</div>
          </>
        )}
      </div>

      <div className="hub-wheel-vortex-wrap">
        {/* decorative depth rings, independent of the module orbit */}
        <svg className="hub-wheel-depth" viewBox="0 0 100 100">
          <circle className="depth-ring depth-ring-full" cx="50" cy="50" r="17" />
          <path className="depth-ring depth-ring-arc" d={arcPath(58, -40, 140)} />
          <path className="depth-ring depth-ring-arc depth-ring-arc-2" d={arcPath(58, 160, 320)} />
          <path className="depth-ring depth-ring-arc depth-ring-arc-glow" d={arcPath(58, 10, 95)} />
          <circle className="depth-ring depth-ring-faint" cx="50" cy="50" r="63" />
          {Array.from({ length: 24 }, (_, i) => {
            const a = (i / 24) * 360
            const [x1, y1] = pointXY(53, a)
            const [x2, y2] = pointXY(55.5, a)
            return <line key={i} className="depth-tick" x1={x1} y1={y1} x2={x2} y2={y2} />
          })}
        </svg>

        <div className="hub-wheel-orbit">
          <svg className="hub-wheel-svg" viewBox="0 0 100 100">
            {apps.map((app, i) => {
              const a1 = i * segmentAngle + GAP_DEG / 2
              const a2 = (i + 1) * segmentAngle - GAP_DEG / 2
              const isHovered = hovered === app.name
              const isDimmed = hovered !== null && !isHovered
              return (
                <a
                  key={app.name}
                  href={app.url}
                  onMouseEnter={() => setHovered(app.name)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <path
                    className={`hub-wheel-wedge-path${isHovered ? ' is-hovered' : ''}${isDimmed ? ' is-dimmed' : ''}`}
                    d={wedgePath(R_IN, R_OUT, a1, a2)}
                  />
                </a>
              )
            })}
          </svg>

          <div className="hub-wheel-icons">
            {apps.map((app, i) => {
              const midAngle = i * segmentAngle + segmentAngle / 2
              const [x, y] = pointXY(midRadius, midAngle)
              const detail = getDetail(app.name, statData)
              const isHovered = hovered === app.name
              const isDimmed = hovered !== null && !isHovered
              return (
                <div key={app.name} className="hub-wheel-wedge-content-wrap" style={{ left: `${x}%`, top: `${y}%` }}>
                  <div
                    className={`hub-wheel-wedge-content${isHovered ? ' is-hovered' : ''}${isDimmed ? ' is-dimmed' : ''}`}
                  >
                    <span className="hub-wheel-item-icon">{app.icon}</span>
                    <span className="hub-wheel-item-name">{app.name}</span>
                    {detail && <span className="hub-wheel-item-detail">{detail}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <button
        className={`hub-wheel-center${centerActive ? ' active' : ''}${hovered ? ' inspecting' : ''}`}
        onClick={onCenterClick}
        aria-label="คุยกับ AI"
      >
        {hovered ? (
          <>
            <span className="hub-wheel-center-brand">SATORU AI</span>
            <span className="hub-wheel-center-focus">{hovered}</span>
            {hoveredDetail && <span className="hub-wheel-center-focus-detail">{hoveredDetail}</span>}
          </>
        ) : (
          <>
            <span className="hub-wheel-center-icon">🤖</span>
            <span className="hub-wheel-center-label">Satoru AI</span>
          </>
        )}
      </button>
    </div>
  )
}
