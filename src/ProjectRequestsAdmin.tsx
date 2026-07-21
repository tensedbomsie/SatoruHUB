import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

type ProjectRequest = {
  id: string
  style_choice: string
  business_name: string
  industry: string | null
  description: string
  email: string | null
  instagram: string | null
  facebook: string | null
  line: string | null
  preferred_contact: string
  reviewed: boolean
  created_at: string
}

const STYLE_LABELS: Record<string, string> = {
  dark: 'Dark & Bold',
  warm: 'Warm & Minimal',
  premium: 'Premium Brand',
  custom: 'Describe your own',
}

export default function ProjectRequestsAdmin() {
  const [items, setItems] = useState<ProjectRequest[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('project_requests').select('*').order('created_at', { ascending: false })
    setItems((data as ProjectRequest[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function markReviewed(id: string) {
    await supabase.from('project_requests').update({ reviewed: true }).eq('id', id)
    load()
  }

  async function remove(id: string) {
    if (!confirm('ลบคำขอนี้?')) return
    await supabase.from('project_requests').delete().eq('id', id)
    load()
  }

  if (loading) return <div className="empty-state">กำลังโหลด...</div>

  const pending = items.filter((i) => !i.reviewed)
  const reviewed = items.filter((i) => i.reviewed)

  const renderRow = (item: ProjectRequest) => (
    <div key={item.id} className="mod-row card">
      <div className="mod-row-main">
        <p className="request-business">
          {item.business_name}
          {item.industry && <span className="request-industry"> — {item.industry}</span>}
        </p>
        <p className="request-style">🎨 {STYLE_LABELS[item.style_choice] ?? item.style_choice}</p>
        <p className="testimonial-message">"{item.description}"</p>
        <div className="request-contacts">
          {item.email && <span>📧 {item.email}</span>}
          {item.instagram && <span>📸 {item.instagram}</span>}
          {item.facebook && <span>👤 {item.facebook}</span>}
          {item.line && <span>💬 LINE: {item.line}</span>}
          <span className="request-preferred">Prefers: {item.preferred_contact}</span>
        </div>
      </div>
      <div className="mod-row-actions">
        {!item.reviewed && (
          <button className="btn btn-primary" onClick={() => markReviewed(item.id)}>
            ทำเครื่องหมายว่าติดต่อแล้ว
          </button>
        )}
        <button className="btn btn-danger" onClick={() => remove(item.id)}>
          ลบ
        </button>
      </div>
    </div>
  )

  return (
    <div className="testimonials-admin">
      <h2 className="concepts-group-title">รอติดต่อ ({pending.length})</h2>
      {pending.length === 0 ? <p className="testimonials-empty">ไม่มีคำขอค้างอยู่</p> : pending.map(renderRow)}

      <h2 className="concepts-group-title" style={{ marginTop: '2rem' }}>
        ติดต่อแล้ว ({reviewed.length})
      </h2>
      {reviewed.length === 0 ? <p className="testimonials-empty">ยังไม่มีรายการที่ติดต่อแล้ว</p> : reviewed.map(renderRow)}
    </div>
  )
}
