import { useState } from 'react'
import { supabase } from './lib/supabase'

type Step = 'style' | 'business' | 'contact' | 'done'
type StyleChoice = 'dark' | 'warm' | 'premium' | 'custom'
type ContactChannel = 'email' | 'instagram' | 'facebook' | 'line'

const STYLE_OPTIONS: { id: StyleChoice; name: string; desc: string; thumb?: string }[] = [
  { id: 'dark', name: 'Dark & Bold', desc: 'Glassmorphism, moody gradients', thumb: 'ecommerce-storefront.png' },
  { id: 'warm', name: 'Warm & Minimal', desc: 'Flat, light, friendly', thumb: 'ecommerce-storefront-flat.png' },
  { id: 'premium', name: 'Premium Brand', desc: 'Editorial, high-end retail', thumb: 'ecommerce-premium-brand.png' },
  { id: 'custom', name: 'Describe your own', desc: "Not sure yet — I'll tell you what I want" },
]

const CONTACT_CHANNELS: { id: ContactChannel; label: string }[] = [
  { id: 'email', label: 'Email' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'line', label: 'LINE' },
]

export default function BuildRequestModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>('style')
  const [style, setStyle] = useState<StyleChoice | null>(null)
  const [businessName, setBusinessName] = useState('')
  const [industry, setIndustry] = useState('')
  const [description, setDescription] = useState('')
  const [email, setEmail] = useState('')
  const [instagram, setInstagram] = useState('')
  const [facebook, setFacebook] = useState('')
  const [line, setLine] = useState('')
  const [preferredContact, setPreferredContact] = useState<ContactChannel>('email')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmitContact = Boolean(email || instagram || facebook || line)

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.from('project_requests').insert({
      style_choice: style,
      business_name: businessName,
      industry: industry || null,
      description,
      email: email || null,
      instagram: instagram || null,
      facebook: facebook || null,
      line: line || null,
      preferred_contact: preferredContact,
      reviewed: false,
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setStep('done')
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal build-modal" onClick={(e) => e.stopPropagation()}>
        {step !== 'done' && (
          <div className="build-modal-steps">
            <span className={step === 'style' ? 'active' : ''}>1. Style</span>
            <span className={step === 'business' ? 'active' : ''}>2. Business</span>
            <span className={step === 'contact' ? 'active' : ''}>3. Contact</span>
          </div>
        )}

        {step === 'style' && (
          <>
            <h2>Let's build yours</h2>
            <p className="modal-sub">Pick a style to start from, or tell me exactly what you have in mind.</p>
            <div className="style-pick-grid">
              {STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`style-pick-card${style === opt.id ? ' active' : ''}`}
                  onClick={() => setStyle(opt.id)}
                >
                  {opt.thumb ? (
                    <img src={`${import.meta.env.BASE_URL}concepts/thumbs/${opt.thumb}`} alt={opt.name} loading="lazy" />
                  ) : (
                    <div className="style-pick-custom-icon">✏️</div>
                  )}
                  <div className="style-pick-name">{opt.name}</div>
                  <div className="style-pick-desc">{opt.desc}</div>
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={!style} onClick={() => setStep('business')}>
                Next →
              </button>
            </div>
          </>
        )}

        {step === 'business' && (
          <>
            <h2>Tell me about your business</h2>
            <div className="build-form-fields">
              <label>
                Business Name
                <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
              </label>
              <label>
                Industry
                <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. restaurant, real estate, clinic" />
              </label>
              <label>
                Describe what you need
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} required />
              </label>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setStep('style')}>
                ← Back
              </button>
              <button className="btn btn-primary" disabled={!businessName || !description} onClick={() => setStep('contact')}>
                Next →
              </button>
            </div>
          </>
        )}

        {step === 'contact' && (
          <>
            <h2>How can I reach you?</h2>
            <div className="build-form-fields">
              <label>
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label>
                Instagram
                <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@yourhandle" />
              </label>
              <label>
                Facebook
                <input value={facebook} onChange={(e) => setFacebook(e.target.value)} placeholder="Page or profile link" />
              </label>
              <label>
                LINE
                <input value={line} onChange={(e) => setLine(e.target.value)} placeholder="LINE ID" />
              </label>
              <label>
                Preferred contact
                <select value={preferredContact} onChange={(e) => setPreferredContact(e.target.value as ContactChannel)}>
                  {CONTACT_CHANNELS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {error && <p className="login-error">{error}</p>}
            <div className="modal-actions">
              <button className="btn" onClick={() => setStep('business')}>
                ← Back
              </button>
              <button className="btn btn-primary" disabled={!canSubmitContact || submitting} onClick={handleSubmit}>
                {submitting ? 'Sending...' : 'Send'}
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <div className="build-modal-done">
            <div className="build-modal-done-emoji">🎉</div>
            <h2>Thank you!</h2>
            <p className="modal-sub">I'll review your ideas and get back to you with the best approach and pricing.</p>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
