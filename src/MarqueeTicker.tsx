import { createPortal } from 'react-dom'
import { timeAgo, type StoryboardStats, type FoodDiaryStats, type MoneyDiaryStats, type MovieHubStats, type TechDictionaryStats } from './liveStats'

type Props = {
  storyboard: StoryboardStats | null
  food: FoodDiaryStats | null
  money: MoneyDiaryStats | null
  movie: MovieHubStats | null
  techDict: TechDictionaryStats | null
}

function buildItems(props: Props): string[] {
  const items: string[] = []

  const today = new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' })
  items.push(`📅 ${today}`)

  if (props.storyboard && props.storyboard.count > 0) {
    let text = `📖 Storyboard: ${props.storyboard.count} เรื่อง`
    if (props.storyboard.latestName && props.storyboard.latestUpdatedAt) {
      text += ` · ล่าสุด "${props.storyboard.latestName}" (${timeAgo(props.storyboard.latestUpdatedAt)})`
    }
    items.push(text)
  }

  if (props.food && props.food.kcalToday > 0) {
    items.push(`🍽️ วันนี้กินไป ${Math.round(props.food.kcalToday)} kcal · โปรตีน ${Math.round(props.food.proteinToday)}g`)
  }

  if (props.money && props.money.incomeMonth > 0) {
    items.push(`💰 รายรับเดือนนี้ ฿${props.money.incomeMonth.toLocaleString('th-TH')}`)
  }

  if (props.movie?.title) {
    items.push(`🎬 ดูล่าสุด "${props.movie.title}"${props.movie.rating ? ` ⭐${props.movie.rating}` : ''}`)
  }

  if (props.techDict && props.techDict.count > 0) {
    items.push(`🧠 Tech Dictionary: ${props.techDict.count} คำ ใน ${props.techDict.categoryCount} หมวด`)
  }

  return items
}

export default function MarqueeTicker(props: Props) {
  const items = buildItems(props)
  if (items.length === 0) return null

  const line = items.join('   |   ')

  return createPortal(
    <div className="marquee-ticker">
      <div className="marquee-track">
        <span className="marquee-segment">{line}</span>
        <span className="marquee-segment" aria-hidden="true">
          {line}
        </span>
      </div>
    </div>,
    document.body,
  )
}
