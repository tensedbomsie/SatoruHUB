import { useState } from 'react'
import { supabase } from './lib/supabase'

const OWNER_EMAIL = 'blackmotion1245@gmail.com'

export default function Login() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: OWNER_EMAIL, password })
    setLoading(false)
    if (error) setError(error.message)
  }

  return (
    <div className="login-page">
      <div className="login-glow" aria-hidden="true" />
      <form className="login-form" onSubmit={handleSubmit}>
        <div className="login-brand">
          <span className="login-brand-icon">🏠</span>
          <div>
            <div className="login-eyebrow">Satoru System</div>
            <h1>SATORU HUB</h1>
          </div>
        </div>

        <div className="login-field">
          <label htmlFor="login-password">Access key</label>
          <input
            id="login-password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </div>

        {error && <p className="login-error" role="alert">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? (
            <span className="login-btn-loading">
              <span className="login-spinner" /> Authenticating…
            </span>
          ) : (
            'Unlock →'
          )}
        </button>
      </form>
    </div>
  )
}
