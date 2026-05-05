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
      background: 'linear-gradient(135deg, #0d1117 0%, #161b22 50%, #0d1117 100%)',
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
        padding: '40px 36px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
        animation: 'slideUp 0.4s ease',
      }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
            <img
              src="/logo_ufsc.png"
              alt="Causa Raiz"
              style={{ height: 56 }}
              onError={e => { e.target.style.display = 'none' }}
            />
          </div>
          <h1 style={{
            margin: 0, fontSize: 18, fontWeight: 700,
            color: '#e6edf3', letterSpacing: -0.3, lineHeight: 1.3,
          }}>
            Ferramenta de Análise de
          </h1>
          <h1 style={{
            margin: '2px 0 0', fontSize: 20, fontWeight: 800,
            background: 'linear-gradient(135deg, #f59e0b, #f97316)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            letterSpacing: -0.5,
          }}>
            Causa Raiz
          </h1>
          <p style={{ margin: '10px 0 0', fontSize: 13, color: '#8b949e' }}>
            Entre com suas credenciais para continuar
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* E-mail */}
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block', fontSize: 12, fontWeight: 600,
              color: '#8b949e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              E-mail
            </label>
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
                padding: '11px 14px', fontSize: 14,
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

          {/* Senha */}
          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: 'block', fontSize: 12, fontWeight: 600,
              color: '#8b949e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              Senha
            </label>
            <div style={{ position: 'relative' }}>
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
                  padding: '11px 44px 11px 14px', fontSize: 14,
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
                {showPass ? '🙈' : '👁️'}
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
              <>🔐 Entrar</>
            )}
          </button>
        </form>

        {/* Footer */}
        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#484f58' }}>
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
      `}</style>
    </div>
  )
}
