import { useState, useRef, useEffect } from 'react'
import { useChartSettings } from '../hooks/ChartSettingsContext'
import { LINE_WIDTHS, LINE_DASHES, DEFAULT_LINE_WIDTH, DEFAULT_LINE_DASH } from '../constants/palette'
import SharedColorPicker from '../components/SharedColorPicker'
import { fetchAuthUsers, createAuthUser, updateAuthUser, deleteAuthUser } from '../services/api'
import { useAuth } from '../hooks/AuthContext'
import UsinasTab from '../components/Settings/UsinasTab'
import FiltrosTab from '../components/Settings/FiltrosTab'

// ── Linha de elemento ─────────────────────────────────────────────────────────
const MAX_COLORS = 5

function ElementRow({ setting, index, updateElementSetting, removeCustomElement, readOnly = false }) {
  const [pickerFor, setPickerFor] = useState(null) // index in colors array that has picker open
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [isHovered, setIsHovered] = useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const hoverTimersRef = useRef({})

  const colors  = setting.colors ?? (setting.color ? [setting.color] : ['#000000'])
  const firstColor = colors[0] || '#000000'

  const AXES = ['y1', 'y2', 'y3', 'y4']
  const cycleAxis = () => {
    const next = AXES[(AXES.indexOf(setting.axis) + 1) % AXES.length]
    updateElementSetting(index, 'axis', next)
  }

  const currentWidth = setting.width ?? DEFAULT_LINE_WIDTH
  const currentDash  = setting.dash  ?? DEFAULT_LINE_DASH

  const updateColor = (colorIdx, hex) => {
    const next = [...colors]
    next[colorIdx] = hex
    updateElementSetting(index, 'colors', next)
  }

  const addColor = () => {
    if (colors.length >= MAX_COLORS) return
    updateElementSetting(index, 'colors', [...colors, '#999999'])
  }

  const removeColor = (colorIdx) => {
    if (colors.length <= 1) return
    updateElementSetting(index, 'colors', colors.filter((_, i) => i !== colorIdx))
    setDeleteTarget(null)
  }

  const startDeleteTimer = (idx) => {
    if (colors.length <= 1) return
    hoverTimersRef.current[idx] = setTimeout(() => setDeleteTarget(idx), 2000)
  }
  const cancelDeleteTimer = (idx) => {
    clearTimeout(hoverTimersRef.current[idx])
    delete hoverTimersRef.current[idx]
  }

  return (
    <tr style={{ borderTop: '1px solid #f1f5f9' }}
      onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; setIsHovered(true) }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; setIsHovered(false); setIsConfirmingDelete(false) }}
    >
      {/* Elemento */}
      <td style={{ padding: '10px 16px', color: '#1e293b', fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 9, height: 9, borderRadius: '50%', background: firstColor, flexShrink: 0, boxShadow: `0 0 0 2px ${firstColor}33` }} />
          {setting.element}
          {isHovered && !readOnly && (
            <button
              onClick={() => setIsConfirmingDelete(true)}
              title="Excluir elemento"
              style={{
                marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer',
                color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '4px', opacity: 0.7, transition: 'all 0.15s',
                borderRadius: 4
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.background = '#fee2e2' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = 0.7; e.currentTarget.style.background = 'none' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>
        
        {isConfirmingDelete && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', width: '100%', maxWidth: 360, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', border: '1px solid #e2e8f0', animation: 'fadeIn 0.2s ease' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Confirmar Exclusão</h3>
              <p style={{ margin: '0 0 24px 0', fontSize: 14, color: '#64748b', lineHeight: 1.5, whiteSpace: 'normal' }}>
                Tem certeza que deseja excluir o elemento <strong>{setting.element}</strong>? Esta ação não pode ser desfeita.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setIsConfirmingDelete(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancelar</button>
                <button onClick={() => removeCustomElement(setting.element)} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Excluir</button>
              </div>
            </div>
          </div>
        )}
      </td>

      {/* Eixo — botão único que cicla Y1→Y2→Y3 */}
      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
        <button
          onClick={readOnly ? undefined : cycleAxis}
          title={readOnly ? setting.axis.toUpperCase() : 'Clique para alternar eixo'}
          style={{
            minWidth: 38, padding: '4px 10px', fontSize: 12, fontWeight: 700,
            borderRadius: 5, border: '1.5px solid #cbd5e1', background: '#fff',
            color: '#334155', cursor: readOnly ? 'default' : 'pointer', transition: 'border-color 0.12s, background 0.12s',
            letterSpacing: 0.3,
          }}
          onMouseEnter={readOnly ? undefined : (e => { e.currentTarget.style.borderColor = '#94a3b8'; e.currentTarget.style.background = '#f8fafc' })}
          onMouseLeave={readOnly ? undefined : (e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#fff' })}
        >
          {setting.axis.toUpperCase()}
        </button>
      </td>

      {/* Cores — até 5 chips com picker individual */}
      <td style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' }}>
          {colors.map((c, ci) => {
            const isTarget = !readOnly && deleteTarget === ci
            return (
              <div 
                key={ci} 
                style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
                onMouseEnter={readOnly ? undefined : () => { if (!isTarget) startDeleteTimer(ci) }}
                onMouseLeave={readOnly ? undefined : () => { cancelDeleteTimer(ci); setDeleteTarget(null) }}
              >
                {/* Chip de cor */}
                <button
                  onClick={readOnly ? undefined : () => (isTarget ? removeColor(ci) : setPickerFor(pickerFor === ci ? null : ci))}
                  title={isTarget ? 'Clique para remover' : `Cor ${ci + 1}: ${c}`}
                  style={{
                    width: 22, height: 22, borderRadius: 5, background: c,
                    border: '2px solid rgba(0,0,0,0.12)', cursor: readOnly ? 'default' : 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)', transition: 'transform 0.1s',
                    flexShrink: 0,
                  }}
                  onMouseEnter={readOnly ? undefined : (e => e.currentTarget.style.transform = 'scale(1.12)')}
                  onMouseLeave={readOnly ? undefined : (e => e.currentTarget.style.transform = 'scale(1)')}
                />
                
                {/* Overlay de remoção */}
                {isTarget && (
                  <div
                    onClick={() => removeColor(ci)}
                    title="Remover cor"
                    style={{
                      position: 'absolute', inset: 0, borderRadius: 5,
                      background: 'rgba(220,38,38,0.90)',
                      color: '#fff', fontSize: 13, fontWeight: 900,
                      cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                      animation: 'fadeIn 0.15s ease',
                      bottom: pickerFor === ci ? 'auto' : 0 // Don't cover picker dropdown
                    }}
                  >
                    ×
                  </div>
                )}
                
                {/* Picker popup */}
                {!readOnly && pickerFor === ci && (
                  <SharedColorPicker
                    color={c}
                    onChange={(hex) => { updateColor(ci, hex) }}
                    onClose={() => setPickerFor(null)}
                  />
                )}
              </div>
            )
          })}

          {/* Botão + para adicionar cor */}
          {!readOnly && colors.length < MAX_COLORS && (
            <button
              onClick={addColor}
              title="Adicionar cor"
              style={{
                width: 22, height: 22, borderRadius: 5, background: '#f1f5f9',
                border: '1.5px dashed #cbd5e1', cursor: 'pointer', padding: 0,
                fontSize: 14, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'border-color 0.1s, color 0.1s', flexShrink: 0, lineHeight: 1,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.color = '#6366f1' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#94a3b8' }}
            >
              +
            </button>
          )}
        </div>
      </td>

      {/* Espessura */}
      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
          background: '#f8fafc', borderRadius: 5, border: '1px solid #e2e8f0', padding: '3px 6px' }}>
          {LINE_WIDTHS.map(w => (
            <button key={w} onClick={readOnly ? undefined : () => updateElementSetting(index, 'width', w)} title={`Espessura: ${w}`}
              style={{ width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: currentWidth === w ? '#0f172a' : 'transparent',
                border: 'none', cursor: readOnly ? 'default' : 'pointer', padding: 0 }}
            >
              <div style={{ width: 11, height: w, background: currentWidth === w ? '#fff' : '#64748b', borderRadius: w / 2 }} />
            </button>
          ))}
        </div>
      </td>

      {/* Tipo de Linha */}
      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
          background: '#f8fafc', borderRadius: 5, border: '1px solid #e2e8f0', padding: '3px 6px' }}>
          {LINE_DASHES.map(type => (
            <button key={type.id} onClick={readOnly ? undefined : () => updateElementSetting(index, 'dash', type.id)} title={type.label}
              style={{ width: 28, height: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: currentDash === type.id ? '#0f172a' : 'transparent',
                border: 'none', cursor: readOnly ? 'default' : 'pointer', padding: 0 }}
            >
              <svg width="16" height="4" xmlns="http://www.w3.org/2000/svg">
                <line x1="0" y1="2" x2="16" y2="2"
                  stroke={currentDash === type.id ? '#fff' : '#64748b'}
                  strokeWidth="2" strokeDasharray={type.dashArray} strokeLinecap="round" />
              </svg>
            </button>
          ))}
        </div>
      </td>
    </tr>
  )
}

// ── Aba Elementos ──────────────────────────────────────────────────────────────
function ElementosTab({ readOnly = false }) {
  const { elementSettings, updateElementSetting, addCustomElement, removeCustomElement, loading } = useChartSettings()
  const [newElementName, setNewElementName] = useState('')

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Carregando elementos...</div>

  const handleAdd = (e) => {
    e.preventDefault()
    if (!newElementName.trim()) return
    // Previne duplicidade case-insensitive
    if (elementSettings.some(s => s.element.toLowerCase() === newElementName.trim().toLowerCase())) {
      alert("Elemento já cadastrado.")
      return
    }
    addCustomElement(newElementName.trim())
    setNewElementName('')
  }

  return (
    <div style={{
      background: 'white', borderRadius: 14, border: '1px solid #e2e8f0',
      boxShadow: '0 2px 10px rgba(0,0,0,0.06)', overflow: 'visible',
    }}>
      {/* Banner leitura */}
      {readOnly && (
        <div style={{
          margin: '14px 18px 0', padding: '10px 14px',
          background: '#fffbeb', border: '1px solid #fde68a',
          borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: '#92400e', fontWeight: 500,
        }}>
          🔒 Você está em modo leitura. Apenas administradores podem editar as configurações.
        </div>
      )}

      {/* Card header */}
      <div style={{
        padding: '14px 18px', borderBottom: '1px solid #f1f5f9',
        background: 'linear-gradient(to right, #f8fafc, #fff)', borderRadius: '14px 14px 0 0',
      }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Defaults por Elemento</h2>
        <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>
          Eixo, cor e estilo de linha padrão por tipo de elemento. Clique no eixo para alternar.
        </p>
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <colgroup>
          <col style={{ width: '28%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '24%' }} />
          <col style={{ width: '22%' }} />
          <col style={{ width: '16%' }} />
        </colgroup>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {[
              ['Elemento', 'left'],
              ['Eixo', 'center'],
              ['Cores', 'left'],
              ['Espessura', 'center'],
              ['Tipo de Linha', 'center'],
            ].map(([label, align]) => (
              <th key={label} style={{ padding: '8px 12px 8px', textAlign: align, fontWeight: 700,
                color: '#94a3b8', fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase',
                borderBottom: '1px solid #f1f5f9' }}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {elementSettings.map((setting, idx) => (
            <ElementRow key={setting.element} setting={setting} index={idx} updateElementSetting={updateElementSetting} removeCustomElement={removeCustomElement} readOnly={readOnly} />
          ))}
        </tbody>
      </table>

      {/* Formulário para Novo Elemento (Apenas Admin) */}
      {!readOnly && (
        <div style={{ padding: '16px 18px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', borderRadius: '0 0 14px 14px' }}>
          <form onSubmit={handleAdd} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Nome do novo elemento (ex: Potência Bateria)"
              value={newElementName}
              onChange={e => setNewElementName(e.target.value)}
              style={{
                flex: 1, padding: '9px 14px', borderRadius: 8, border: '1px solid #cbd5e1',
                fontSize: 13, color: '#0f172a', outline: 'none'
              }}
              onFocus={e => e.target.style.borderColor = '#94a3b8'}
              onBlur={e => e.target.style.borderColor = '#cbd5e1'}
            />
            <button
              type="submit"
              disabled={!newElementName.trim()}
              style={{
                padding: '9px 18px', borderRadius: 8, border: 'none', background: '#0f172a',
                color: '#fff', fontSize: 13, fontWeight: 600, cursor: newElementName.trim() ? 'pointer' : 'not-allowed',
                opacity: newElementName.trim() ? 1 : 0.5
              }}
            >
              + Adicionar
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

// ── Aba Usuários ──────────────────────────────────────────────────────────────
const ROLE_LABELS = { admin: 'Admin', analyst: 'Analista', user: 'Usuário' }
const ROLE_COLORS = {
  admin:   { bg: '#fef3c7', color: '#b45309' },
  analyst: { bg: '#f0fdf4', color: '#15803d' },
  user:    { bg: '#eff6ff', color: '#2563eb' },
}

function UserBadge({ role }) {
  const s = ROLE_COLORS[role] || ROLE_COLORS.user
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 10px',
      borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: s.bg, color: s.color,
    }}>
      {ROLE_LABELS[role] || role}
    </span>
  )
}

function NewUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ email: '', name: '', role: 'user', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const u = await createAuthUser(form)
      onCreated(u)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: '#f8fafc', border: '1.5px solid #e2e8f0',
    borderRadius: 8, color: '#0f172a', padding: '9px 12px',
    fontSize: 13, fontFamily: 'inherit', outline: 'none',
    transition: 'border-color 0.2s',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '28px 28px 24px',
        width: '100%', maxWidth: 420, boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
        border: '1px solid #e2e8f0', animation: 'fadeIn 0.2s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Novo Usuário</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          {[{ label: 'Nome', key: 'name', type: 'text', placeholder: 'Nome completo' },
            { label: 'E-mail', key: 'email', type: 'email', placeholder: 'email@dominio.com' },
            { label: 'Senha', key: 'password', type: 'password', placeholder: '••••••••' },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
              <input
                type={type} value={form[key]} required placeholder={placeholder}
                onChange={e => set(key, e.target.value)}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = '#f59e0b'}
                onBlur={e => e.target.style.borderColor = '#e2e8f0'}
              />
            </div>
          ))}

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Perfil</label>
            <select value={form.role} onChange={e => set('role', e.target.value)} style={{ ...inputStyle, appearance: 'none' }}>
              <option value="user">Usuário — visualização e gráficos</option>
              <option value="analyst">Analista — upload e configurações (leitura)</option>
              <option value="admin">Admin — acesso completo</option>
            </select>
          </div>

          {error && (
            <div style={{ marginBottom: 14, padding: '9px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>Cancelar</button>
            <button type="submit" disabled={loading} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#f59e0b,#f97316)', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Criando...' : 'Criar Usuário'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function UsuariosTab({ readOnly = false }) {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [feedback, setFeedback] = useState(null) // { type: 'success'|'error', msg }

  const loadUsers = async () => {
    try {
      setLoading(true)
      const data = await fetchAuthUsers()
      setUsers(data)
    } catch (err) {
      setFeedback({ type: 'error', msg: err.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  const showFeedback = (type, msg) => {
    setFeedback({ type, msg })
    setTimeout(() => setFeedback(null), 4000)
  }

  const handleDelete = async (email) => {
    try {
      await deleteAuthUser(email)
      setUsers(u => u.filter(x => x.email !== email))
      showFeedback('success', `Usuário ${email} removido.`)
    } catch (err) {
      showFeedback('error', err.message)
    } finally {
      setDeleteConfirm(null)
    }
  }

  return (
    <div>
      {/* Header da aba */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>Gerencie os usuários com acesso ao sistema.</p>
        </div>
        {!readOnly && (
          <button
            id="btn-new-user"
            onClick={() => setShowModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg,#f59e0b,#f97316)',
              color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', boxShadow: '0 2px 8px rgba(245,158,11,0.3)',
              transition: 'transform 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            + Novo Usuário
          </button>
        )}
      </div>

      {/* Feedback */}
      {feedback && (
        <div style={{
          marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13,
          background: feedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${feedback.type === 'success' ? '#86efac' : '#fecaca'}`,
          color: feedback.type === 'success' ? '#065f46' : '#991b1b',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {feedback.type === 'success' ? '✅' : '⚠️'} {feedback.msg}
        </div>
      )}

      {/* Tabela de usuários */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', background: 'linear-gradient(to right,#f8fafc,#fff)' }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Usuários Cadastrados</h2>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Carregando...</div>
        ) : users.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Nenhum usuário encontrado.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {[['Usuário', 'left'], ['E-mail', 'left'], ['Perfil', 'center'], ['Ações', 'center']].map(([l, a]) => (
                  <th key={l} style={{ padding: '9px 16px', textAlign: a, fontWeight: 700, color: '#94a3b8', fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', borderBottom: '1px solid #f1f5f9' }}>{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isSelf = u.email === currentUser?.email
                return (
                  <tr key={u.email}
                    style={{ borderTop: '1px solid #f1f5f9', transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0f172a' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: u.role === 'admin' ? 'linear-gradient(135deg,#f59e0b,#f97316)' : 'linear-gradient(135deg,#2563eb,#7c3aed)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 800, color: '#fff', flexShrink: 0,
                        }}>
                          {(() => { const p = (u.name || u.email || '').split(' ').filter(Boolean); return ((p[0]?.[0] || '') + (p[p.length - 1]?.[0] || '')).toUpperCase() || '?' })()} 
                        </div>
                        <span>{u.name || '—'}</span>
                        {isSelf && <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>(você)</span>}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>{u.email}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}><UserBadge role={u.role} /></td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {!isSelf && !readOnly && (
                        <button
                          onClick={() => setDeleteConfirm(u.email)}
                          title="Remover usuário"
                          style={{
                            margin: '0 auto', background: 'none', border: '1px solid #fee2e2', cursor: 'pointer',
                            color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '6px', transition: 'all 0.15s', borderRadius: 6
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#fecaca' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = '#fee2e2' }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && <NewUserModal onClose={() => setShowModal(false)} onCreated={u => setUsers(prev => [...prev, u])} />}

      {/* Modal Confirmação Exclusão Usuário */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', width: '100%', maxWidth: 360, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', border: '1px solid #e2e8f0', animation: 'fadeIn 0.2s ease' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Confirmar Exclusão</h3>
                <p style={{ margin: '0 0 24px 0', fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
                    Tem certeza que deseja remover o usuário <strong>{deleteConfirm}</strong>? O acesso dele será revogado imediatamente.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={() => setDeleteConfirm(null)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancelar</button>
                    <button onClick={() => handleDelete(deleteConfirm)} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Remover Usuário</button>
                </div>
            </div>
        </div>
      )}
    </div>
  )
}

// ── Página de Configurações ───────────────────────────────────────────────────
const TABS = [
  { id: 'usinas',    icon: '🏭', label: 'Usinas' },
  { id: 'elementos', icon: '📊', label: 'Elementos' },
  { id: 'filtros',   icon: '🎛️', label: 'Filtros' },
  { id: 'usuarios',  icon: '👥', label: 'Usuários' },
]

export default function SettingsPage() {
  const { isAdmin } = useAuth()
  const [activeTab, setActiveTab] = useState('usinas')
  const readOnly = !isAdmin

  return (
    <div style={{ flex: 1, background: '#f1f5f9', minHeight: '100%', padding: '32px 20px', boxSizing: 'border-box' }}>
      {/* Centered container */}
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 26, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'linear-gradient(135deg, #0f172a, #334155)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(15,23,42,0.25)',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: -0.3 }}>
              Cadastro
            </h1>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '2px solid #e2e8f0' }}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{ padding: '7px 18px', fontSize: 13, fontWeight: 600,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: isActive ? '#0f172a' : '#94a3b8',
                  borderBottom: isActive ? '2px solid #0f172a' : '2px solid transparent',
                  marginBottom: -2, transition: 'color 0.15s', display: 'flex', alignItems: 'center', gap: 6,
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#475569' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#94a3b8' }}
              >
                <span>{tab.icon}</span><span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Content */}
        {activeTab === 'elementos' && <ElementosTab readOnly={readOnly} />}
        {activeTab === 'usinas'    && <UsinasTab readOnly={readOnly} />}
        {activeTab === 'filtros'   && <FiltrosTab readOnly={readOnly} />}
        {activeTab === 'usuarios'  && <UsuariosTab readOnly={readOnly} />}
      </div>
    </div>
  )
}
