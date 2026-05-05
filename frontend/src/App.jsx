import { useEffect, useState, useRef } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useUsina } from './hooks/UsinaContext'
import { useAuth } from './hooks/AuthContext'
import { fetchUsinas, createUsina } from './services/api'

export default function App() {
  const { usinaAtual, setUsinaAtual } = useUsina()
  const { user, isAdmin, isAnalystOrAdmin, logout } = useAuth()
  const navigate = useNavigate()
  const [usinas, setUsinas] = useState([])
  const [showNewUsina, setShowNewUsina] = useState(false)
  const [nomeUsina, setNomeUsina]       = useState('')
  const [usinaError, setUsinaError]     = useState('')
  const inputRef = useRef(null)

  const loadUsinas = async () => {
    try {
      const data = await fetchUsinas()
      setUsinas(data || [])
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => { loadUsinas() }, [])

  // Foca o input quando o popover abre
  useEffect(() => {
    if (showNewUsina) setTimeout(() => inputRef.current?.focus(), 50)
  }, [showNewUsina])

  const handleCreateUsina = async (e) => {
    e.preventDefault()
    const nome = nomeUsina.trim()
    if (!nome) { setUsinaError('Informe um nome.'); return }
    try {
      await createUsina(nome)
      await loadUsinas()
      setUsinaAtual(nome)
      setShowNewUsina(false)
      setNomeUsina('')
      setUsinaError('')
    } catch (err) {
      setUsinaError(err.message || 'Erro ao criar usina.')
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  // Iniciais: primeira letra do primeiro e do último nome
  const initials = (() => {
    const parts = (user?.name || '').split(' ').filter(Boolean)
    if (parts.length === 0) return user?.email?.slice(0, 2).toUpperCase() || '?'
    const first = parts[0][0] || ''
    const last  = parts[parts.length - 1][0] || ''
    return (first + last).toUpperCase()
  })()

  return (
    <div className="app-layout">
      {/* Navbar */}
      <nav className="navbar">
        <NavLink to={isAdmin ? "/" : "/dashboard"} className="navbar-brand">
          <img src="/logo_ufsc.png" alt="Fotovoltaica UFSC" style={{ height: '36px', marginRight: '6px' }} />
          <span style={{ fontSize: '15px' }}>Ferramenta de Análise de <strong>Causa Raiz</strong></span>
        </NavLink>

        <div className="navbar-links" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Seletor de Usina */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.1)', padding: '4px 12px', borderRadius: '6px', position: 'relative' }}>
            <span style={{ fontSize: '14px', color: '#ddd' }}>Usina:</span>
            <select
              value={usinaAtual || ''}
              onChange={e => setUsinaAtual(e.target.value)}
              style={{
                background: 'transparent', color: 'white', border: 'none',
                outline: 'none', fontSize: '14px', cursor: 'pointer',
                fontWeight: 'bold', minWidth: '100px'
              }}
            >
              <option value="" style={{ color: 'black' }}>-- Selecionar --</option>
              {usinas.map(u => (
                <option key={u} value={u} style={{ color: 'black' }}>{u}</option>
              ))}
            </select>

            {isAnalystOrAdmin && (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => { setShowNewUsina(v => !v); setUsinaError(''); setNomeUsina('') }}
                  style={{
                    background: '#4CAF50', color: 'white', border: 'none',
                    borderRadius: '4px', padding: '3px 8px', cursor: 'pointer',
                    fontSize: '14px', fontWeight: 'bold', lineHeight: 1,
                  }}
                  title="Nova Usina"
                >
                  +
                </button>

                {/* Popover de nova usina */}
                {showNewUsina && (
                  <>
                    {/* Overlay para fechar ao clicar fora */}
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                      onClick={() => { setShowNewUsina(false); setNomeUsina(''); setUsinaError('') }}
                    />
                    <form
                      onSubmit={handleCreateUsina}
                      style={{
                        position: 'absolute', top: 'calc(100% + 8px)', left: '50%',
                        transform: 'translateX(-50%)',
                        background: '#1c2333', border: '1px solid #30363d',
                        borderRadius: 10, padding: '14px 16px', zIndex: 999,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                        display: 'flex', flexDirection: 'column', gap: 10,
                        minWidth: 240,
                        animation: 'fadeIn 0.15s ease',
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Nome da Usina
                      </label>
                      <input
                        ref={inputRef}
                        value={nomeUsina}
                        onChange={e => { setNomeUsina(e.target.value); setUsinaError('') }}
                        placeholder="Ex: Cortez - SPE São Claus 3"
                        style={{
                          background: 'rgba(255,255,255,0.07)', border: `1.5px solid ${usinaError ? 'rgba(220,38,38,0.6)' : 'rgba(255,255,255,0.15)'}`,
                          borderRadius: 7, color: '#e6edf3', padding: '8px 10px',
                          fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box',
                        }}
                        onFocus={e => e.target.style.borderColor = 'rgba(245,158,11,0.6)'}
                        onBlur={e => e.target.style.borderColor = usinaError ? 'rgba(220,38,38,0.6)' : 'rgba(255,255,255,0.15)'}
                      />
                      {usinaError && (
                        <span style={{ fontSize: 11, color: '#fca5a5' }}>⚠️ {usinaError}</span>
                      )}
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => { setShowNewUsina(false); setNomeUsina(''); setUsinaError('') }}
                          style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #30363d', background: 'transparent', color: '#8b949e', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#f59e0b,#f97316)', color: '#0d1117', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                        >
                          Criar
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Links de navegação — Upload e Settings: Analista e Admin */}
          {isAnalystOrAdmin && (
            <NavLink
              to="/"
              end
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              📤 Upload
            </NavLink>
          )}
          <NavLink
            to="/dashboard"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            📊 Dashboard
          </NavLink>
          {isAnalystOrAdmin && (
            <NavLink
              to="/settings"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              ⚙️ Configurações
            </NavLink>
          )}

          {/* Divider */}
          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)' }} />

          {/* Usuário logado + logout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Avatar */}
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'linear-gradient(135deg, #f59e0b, #f97316)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, color: '#0d1117',
              flexShrink: 0, cursor: 'default',
            }} title={`${user?.name || user?.email} (${user?.role})`}>
              {initials}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#e6edf3', lineHeight: 1, whiteSpace: 'nowrap' }}>
                {user?.name || user?.email}
              </span>
              <span style={{ fontSize: 10, color: '#8b949e', lineHeight: 1, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {user?.role === 'admin' ? 'Admin' : user?.role === 'analyst' ? 'Analista' : 'Usuário'}
              </span>
            </div>
            {/* Logout */}
            <button
              id="btn-logout"
              onClick={handleLogout}
              title="Sair"
              style={{
                background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)',
                borderRadius: 6, color: '#fca5a5', fontSize: 11, fontWeight: 600,
                padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.3)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.15)' }}
            >
              Sair
            </button>
          </div>
        </div>
      </nav>

      {/* Conteúdo da página atual */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
    </div>
  )
}
