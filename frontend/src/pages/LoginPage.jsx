import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext'
import api from '../services/api'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPass, setShowPass] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      login(data.access_token, { email: data.email, name: data.name, role: data.role })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'E-mail ou senha inválidos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(rgba(13, 17, 23, 0.2), rgba(13, 17, 23, 0.6)), url(/login_bg_new.png) center/cover no-repeat',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', sans-serif",
      padding: '20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background glow effects */}
      <div style={{
        position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 500, height: 500,
        background: 'radial-gradient(circle, rgba(245,158,11,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '10%', right: '20%',
        width: 300, height: 300,
        background: 'radial-gradient(circle, rgba(37,99,235,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 420,
        background: 'rgba(22,27,34,0.85)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(245,158,11,0.2)',
        borderRadius: 20,
        padding: '28px 36px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
        animation: 'slideUp 0.4s ease',
      }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'center' }}>
            <img
              src="/logo_plataforma_transparent.png"
              alt="Plataforma"
              style={{ height: 180 }}
              onError={e => { e.target.style.display = 'none' }}
            />
          </div>
          <h1 style={{
            margin: 0, fontSize: 24, fontWeight: 700,
            color: '#e6edf3', letterSpacing: -0.3, lineHeight: 1.3,
          }}>
            Análise de Desempenho de
          </h1>
          <h1 style={{
            margin: '2px 0 0', fontSize: 28, fontWeight: 800,
            background: 'linear-gradient(135deg, #f59e0b, #f97316)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            letterSpacing: -0.5,
          }}>
            Usinas Fotovoltaicas
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 }}>
            <span style={{ fontSize: 12, color: '#8b949e', opacity: 0.8 }}>
              por
            </span>
            <img src="/logo_ufsc_white.png" alt="Fotovoltaica UFSC" style={{ height: 42 }} />
          </div>
          <div style={{ width: 40, height: 1, background: 'rgba(245,158,11,0.5)', margin: '12px auto 0' }} />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* E-mail */}
          <div style={{ marginBottom: 12 }}>
            <label style={{
              display: 'block', fontSize: 12, fontWeight: 600,
              color: '#8b949e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              E-mail
            </label>
            <div style={{ position: 'relative' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', opacity: 0.8 }}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                placeholder="seu@email.com"
                autoComplete="email"
                required
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.05)',
                  border: `1.5px solid ${error ? 'rgba(220,38,38,0.6)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 10, color: '#e6edf3',
                  padding: '11px 14px 11px 42px', fontSize: 14,
                  fontFamily: 'inherit', outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={e => {
                  e.target.style.borderColor = 'rgba(245,158,11,0.5)'
                  e.target.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.1)'
                }}
                onBlur={e => {
                  e.target.style.borderColor = error ? 'rgba(220,38,38,0.6)' : 'rgba(255,255,255,0.1)'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>
          </div>

          {/* Senha */}
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block', fontSize: 12, fontWeight: 600,
              color: '#8b949e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              Senha
            </label>
            <div style={{ position: 'relative' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', opacity: 0.8 }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              <input
                id="login-password"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.05)',
                  border: `1.5px solid ${error ? 'rgba(220,38,38,0.6)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 10, color: '#e6edf3',
                  padding: '11px 44px 11px 42px', fontSize: 14,
                  fontFamily: 'inherit', outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={e => {
                  e.target.style.borderColor = 'rgba(245,158,11,0.5)'
                  e.target.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.1)'
                }}
                onBlur={e => {
                  e.target.style.borderColor = error ? 'rgba(220,38,38,0.6)' : 'rgba(255,255,255,0.1)'
                  e.target.style.boxShadow = 'none'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#8b949e', fontSize: 16, padding: '2px 4px',
                  lineHeight: 1, display: 'flex', alignItems: 'center',
                }}
                tabIndex={-1}
                title={showPass ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPass ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                )}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              marginBottom: 16, padding: '10px 14px',
              background: 'rgba(220,38,38,0.12)',
              border: '1px solid rgba(220,38,38,0.3)',
              borderRadius: 8, color: '#fca5a5', fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>⚠️</span> {error}
            </div>
          )}

          {/* Submit */}
          <button
            id="login-submit"
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: loading ? 'rgba(245,158,11,0.5)' : 'linear-gradient(135deg, #f59e0b, #f97316)',
              border: 'none', borderRadius: 10,
              color: '#0d1117', fontWeight: 700, fontSize: 15,
              padding: '13px', cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', letterSpacing: 0.2,
              boxShadow: loading ? 'none' : '0 4px 20px rgba(245,158,11,0.35)',
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
          >
            {loading ? (
              <>
                <span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite' }}>⏳</span>
                Entrando...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
                Entrar
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: '#484f58' }}>
          Acesso restrito — solicite uma conta ao administrador
        </p>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        input:-webkit-autofill,
        input:-webkit-autofill:hover, 
        input:-webkit-autofill:focus, 
        input:-webkit-autofill:active {
            -webkit-box-shadow: 0 0 0 30px #1e242d inset !important;
            -webkit-text-fill-color: #e6edf3 !important;
            transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>
    </div>
  )
}
