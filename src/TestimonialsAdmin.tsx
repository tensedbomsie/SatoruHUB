import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import type { Testimonial } from './Testimonials'

export default function TestimonialsAdmin() {
  const [items, setItems] = useState<Testimonial[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('testimonials').select('*').order('created_at', { ascending: false })
    setItems((data as Testimonial[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function approve(id: string) {
    await supabase.from('testimonials').update({ approved: true }).eq('id', id)
    load()
  }

  async function reject(id: string) {
    if (!confirm('ลบรีวิวนี้?')) return
    await supabase.from('testimonials').delete().eq('id', id)
    load()
  }

  if (loading) return <div className="empty-state">กำลังโหลด...</div>

  const pending = items.filter((i) => !i.approved)
  const approved = items.filter((i) => i.approved)

  return (
    <div className="testimonials-admin">
      <h2 className="concepts-group-title">รอตรวจสอบ ({pending.length})</h2>
      {pending.length === 0 ? (
        <p className="testimonials-empty">ไม่มีรีวิวรอตรวจสอบ</p>
      ) : (
        pending.map((item) => (
          <div key={item.id} className="mod-row card">
            <div className="mod-row-main">
              {item.rating != null && <div className="testimonial-rating">{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</div>}
              <p className="testimonial-message">"{item.message}"</p>
              <p className="testimonial-name">— {item.name}</p>
            </div>
            <div className="mod-row-actions">
              <button className="btn btn-primary" onClick={() => approve(item.id)}>
                อนุมัติ
              </button>
              <button className="btn" onClick={() => reject(item.id)}>
                ลบ
              </button>
            </div>
          </div>
        ))
      )}

      <h2 className="concepts-group-title" style={{ marginTop: '2rem' }}>
        แสดงอยู่แล้ว ({approved.length})
      </h2>
      {approved.length === 0 ? (
        <p className="testimonials-empty">ยังไม่มีรีวิวที่อนุมัติ</p>
      ) : (
        approved.map((item) => (
          <div key={item.id} className="mod-row card">
            <div className="mod-row-main">
              {item.rating != null && <div className="testimonial-rating">{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</div>}
              <p className="testimonial-message">"{item.message}"</p>
              <p className="testimonial-name">— {item.name}</p>
            </div>
            <div className="mod-row-actions">
              <button className="btn btn-danger" onClick={() => reject(item.id)}>
                ลบ
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
