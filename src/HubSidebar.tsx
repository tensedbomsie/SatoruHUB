import { timeAgo, type FoodDiaryStats, type WorkoutStats, type MoneyDiaryStats, type MovieHubStats } from './liveStats'
import DailyQuest from './DailyQuest'

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 })

export default function HubSidebar({
  open,
  onClose,
  food,
  workout,
  money,
  movie,
}: {
  open: boolean
  onClose: () => void
  food: FoodDiaryStats | null
  workout: WorkoutStats | null
  money: MoneyDiaryStats | null
  movie: MovieHubStats | null
}) {
  return (
    <>
      <button
        className={`hub-sidebar-tab${open ? ' open' : ''}`}
        onClick={onClose}
        aria-label="เปิด/ปิดแถบข้อมูล"
        title="แถบข้อมูล AI"
      >
        {open ? '‹' : '📊'}
      </button>

      <aside className={`hub-sidebar${open ? ' open' : ''}`}>
        <div className="hub-sidebar-title">Today's Status</div>

        <DailyQuest />

        <div className="hub-sidebar-card">
          <div className="hub-sidebar-card-head">🍽️ Food Diary</div>
          {food ? (
            <>
              <span className="stat-line">🔥 {fmt(food.kcalToday)} kcal วันนี้</span>
              <span className="stat-line-sub">🥩 โปรตีน {fmt(food.proteinToday)}g</span>
            </>
          ) : (
            <span className="stat-line-sub">ยังไม่มีข้อมูลวันนี้</span>
          )}
        </div>

        <div className="hub-sidebar-card">
          <div className="hub-sidebar-card-head">🏋️ Workout Tracker</div>
          {workout?.lastPerformedAt ? (
            <>
              <span className="stat-line">{workout.exerciseNames.join(', ') || 'เวิร์กเอาต์'}</span>
              <span className="stat-line-sub">{workout.totalSets} เซต · {timeAgo(workout.lastPerformedAt)}</span>
            </>
          ) : (
            <span className="stat-line-sub">ยังไม่มีเวิร์กเอาต์บันทึกไว้</span>
          )}
        </div>

        <div className="hub-sidebar-card">
          <div className="hub-sidebar-card-head">💰 Money Diary</div>
          {money ? (
            <>
              <span className="stat-line">รายรับวันนี้ ฿{fmt(money.incomeToday)}</span>
              <span className="stat-line-sub">รายรับเดือนนี้ ฿{fmt(money.incomeMonth)}</span>
            </>
          ) : (
            <span className="stat-line-sub">ยังไม่มีข้อมูล</span>
          )}
        </div>

        <div className="hub-sidebar-card">
          <div className="hub-sidebar-card-head">🎬 Movie Hub</div>
          {movie?.title ? (
            <>
              <span className="stat-line-sub">ดูล่าสุด: {movie.title}</span>
              {movie.rating != null && <span className="stat-line">⭐ {Number(movie.rating).toFixed(1)}</span>}
            </>
          ) : (
            <span className="stat-line-sub">ยังไม่มีข้อมูล</span>
          )}
        </div>
      </aside>
    </>
  )
}
