import { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/AuthContext'
import { useUsina } from './hooks/UsinaContext'
import { fetchUsinas } from './services/api'

export default function App() {
  const { user, isAdmin, isAnalystOrAdmin, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { usinaAtual, setUsinaAtual } = useUsina()
  const [usinas, setUsinas] = useState([])

  useEffect(() => {
    fetchUsinas().then(setUsinas).catch(() => {})
  }, [])

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
          <img src="/logo_plataforma_transparent.png" alt="Plataforma" style={{ height: '38px', marginRight: '8px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', lineHeight: '1.2' }}>
              Análise de Desempenho de <strong style={{ color: '#f97316' }}>Usinas Fotovoltaicas</strong>
            </span>
            <span style={{ fontSize: '9px', color: '#8b949e', fontWeight: '500', lineHeight: '1.1' }}>
              por Fotovoltaica UFSC
            </span>
          </div>
        </NavLink>

        <div className="navbar-links" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Links de navegação principais (filtram via search params) */}
          <NavLink
            to="/dashboard?view=dashboard"
            className={() => {
              const view = new URLSearchParams(location.search).get('view') || 'dashboard'
              return `nav-link ${view === 'dashboard' && location.pathname === '/dashboard' ? 'active' : ''}`
            }}
          >
            📊 Dashboard
          </NavLink>
          <NavLink
            to="/dashboard?view=desempenho"
            className={() => {
              const view = new URLSearchParams(location.search).get('view')
              return `nav-link ${view === 'desempenho' && location.pathname === '/dashboard' ? 'active' : ''}`
            }}
          >
            📈 Desempenho
          </NavLink>
          <NavLink
            to="/dashboard?view=causa-raiz"
            className={() => {
              const view = new URLSearchParams(location.search).get('view')
              return `nav-link ${view === 'causa-raiz' && location.pathname === '/dashboard' ? 'active' : ''}`
            }}
          >
            🔍 Análise de Causa Raiz
          </NavLink>
          
          {isAnalystOrAdmin && (
            <NavLink
              to="/settings"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              📋 Cadastro
            </NavLink>
          )}

          {/* Divider */}
          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)' }} />

          {/* Seletor de usina no canto superior direito */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.15)', padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>🏭 Usina:</span>
            <select
              value={usinaAtual || ''}
              onChange={e => setUsinaAtual(e.target.value)}
              style={{
                background: 'transparent', border: 'none', color: '#fff',
                fontSize: 13, fontWeight: 600, outline: 'none', cursor: 'pointer',
                fontFamily: 'inherit', maxWidth: 180,
              }}
            >
              <option value="" style={{ color: '#000' }}>-- Selecionar --</option>
              {usinas.map(u => <option key={u} value={u} style={{ color: '#000' }}>{u}</option>)}
            </select>
          </div>

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
