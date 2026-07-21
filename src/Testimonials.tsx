import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

export type Testimonial = {
  id: string
  name: string
  message: string
  rating: number | null
  approved: boolean
  created_at: string
}

const TEXT = {
  th: {
    heading: 'เสียงจากผู้ใช้งาน',
    empty: 'ยังไม่มีรีวิว — เป็นคนแรกที่เขียนถึงเราได้เลย',
    formTitle: 'ฝากรีวิวถึงเรา',
    name: 'ชื่อของคุณ',
    message: 'เล่าประสบการณ์ที่ได้ทำงานด้วยกัน',
    submit: 'ส่งรีวิว',
    submitting: 'กำลังส่ง...',
    sent: 'ส่งแล้ว ขอบคุณครับ 🙏 รีวิวจะขึ้นแสดงหลังผ่านการตรวจสอบ',
  },
  en: {
    heading: 'What people are saying',
    empty: 'No reviews yet — be the first to share one',
    formTitle: 'Leave a review',
    name: 'Your name',
    message: 'Share your experience working together',
    submit: 'Submit review',
    submitting: 'Submitting...',
    sent: "Thanks! Your review will appear once it's been reviewed.",
  },
}

export function TestimonialsList({ lang = 'th' }: { lang?: 'th' | 'en' }) {
  const [items, setItems] = useState<Testimonial[]>([])
  const [loading, setLoading] = useState(true)
  const t = TEXT[lang]

  useEffect(() => {
    supabase
      .from('testimonials')
      .select('*')
      .eq('approved', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setItems((data as Testimonial[]) ?? [])
        setLoading(false)
      })
  }, [])

  if (loading) return null

  return (
    <div className="testimonials-section">
      <h2 className="testimonials-heading">{t.heading}</h2>
      {items.length === 0 ? (
        <p className="testimonials-empty">{t.empty}</p>
      ) : (
        <div className="testimonials-grid">
          {items.map((item) => (
            <div key={item.id} className="testimonial-card card">
              {item.rating != null && <div className="testimonial-rating">{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</div>}
              <p className="testimonial-message">"{item.message}"</p>
              <p className="testimonial-name">— {item.name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function TestimonialForm({ lang = 'th' }: { lang?: 'th' | 'en' }) {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [rating, setRating] = useState(5)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const t = TEXT[lang]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    await supabase.from('testimonials').insert({ name, message, rating, approved: false })
    setSubmitting(false)
    setSent(true)
    setName('')
    setMessage('')
    setRating(5)
  }

  if (sent) {
    return (
      <div className="testimonial-form card">
        <p className="testimonial-sent">{t.sent}</p>
      </div>
    )
  }

  return (
    <form className="testimonial-form card" onSubmit={handleSubmit}>
      <h3>{t.formTitle}</h3>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.name} required />
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t.message} rows={3} required />
      <div className="testimonial-star-picker">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} className={n <= rating ? 'star active' : 'star'} onClick={() => setRating(n)}>
            ★
          </button>
        ))}
      </div>
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? t.submitting : t.submit}
      </button>
    </form>
  )
}
