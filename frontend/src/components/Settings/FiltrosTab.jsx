import { useState } from 'react'
import { useChartSettings } from '../../hooks/ChartSettingsContext'

function FilterRow({ setting, updateFilterSetting, removeFilterElement, readOnly = false }) {
  const [isHovered, setIsHovered] = useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)

  const handleNumChange = (field, val) => {
    if (val === '') {
      updateFilterSetting(setting.element, field, null)
    } else {
      updateFilterSetting(setting.element, field, Number(val))
    }
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: readOnly ? '#f1f5f9' : '#fff', border: '1px solid #e2e8f0',
    borderRadius: 6, color: '#0f172a', padding: '6px 10px',
    fontSize: 13, fontFamily: 'inherit', outline: 'none',
    transition: 'border-color 0.2s', textAlign: 'right'
  }

  return (
    <tr style={{ borderTop: '1px solid #f1f5f9' }}
      onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; setIsHovered(true) }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; setIsHovered(false); setIsConfirmingDelete(false) }}
    >
      <td style={{ padding: '10px 16px', color: '#1e293b', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {setting.element}
          {isHovered && !readOnly && (
            <button
              onClick={() => setIsConfirmingDelete(true)}
              title="Remover filtro"
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
                Tem certeza que deseja remover as configurações de filtro para <strong>{setting.element}</strong>?
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setIsConfirmingDelete(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancelar</button>
                <button onClick={() => removeFilterElement(setting.element)} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Remover</button>
              </div>
            </div>
          </div>
        )}
      </td>
      <td style={{ padding: '10px 12px' }}>
        <input 
          type="number" 
          value={setting.min_value ?? ''} 
          onChange={e => handleNumChange('min_value', e.target.value)} 
          disabled={readOnly}
          placeholder="Ilimitado"
          style={inputStyle} 
          onFocus={e => !readOnly && (e.target.style.borderColor = '#f59e0b')}
          onBlur={e => !readOnly && (e.target.style.borderColor = '#e2e8f0')}
        />
      </td>
      <td style={{ padding: '10px 12px' }}>
        <input 
          type="number" 
          value={setting.max_value ?? ''} 
          onChange={e => handleNumChange('max_value', e.target.value)} 
          disabled={readOnly}
          placeholder="Ilimitado"
          style={inputStyle} 
          onFocus={e => !readOnly && (e.target.style.borderColor = '#f59e0b')}
          onBlur={e => !readOnly && (e.target.style.borderColor = '#e2e8f0')}
        />
      </td>
      <td style={{ padding: '10px 12px' }}>
        <input 
          type="number" 
          value={setting.max_variation ?? ''} 
          onChange={e => handleNumChange('max_variation', e.target.value)} 
          disabled={readOnly}
          placeholder="Ilimitado"
          style={inputStyle} 
          onFocus={e => !readOnly && (e.target.style.borderColor = '#f59e0b')}
          onBlur={e => !readOnly && (e.target.style.borderColor = '#e2e8f0')}
        />
      </td>
    </tr>
  )
}

export default function FiltrosTab({ readOnly = false }) {
  const { elementSettings, filterSettings, addFilterElement, updateFilterSetting, removeFilterElement, loading } = useChartSettings()
  const [selectedElement, setSelectedElement] = useState('')

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Carregando filtros...</div>

  const availableElements = elementSettings
    .map(s => s.element)
    .filter(name => !filterSettings.some(f => f.element === name))
    .sort()

  const handleAdd = (e) => {
    e.preventDefault()
    if (!selectedElement) return
    addFilterElement(selectedElement)
    setSelectedElement('')
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
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Configurações de Filtro de Dados</h2>
        <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>
          Defina os limites padrão de qualidade para os dados brutos importados no sistema. Deixe vazio para não restringir.
        </p>
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <colgroup>
          <col style={{ width: '40%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '20%' }} />
        </colgroup>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {[
              ['Elemento', 'left'],
              ['Valor Mínimo', 'right'],
              ['Valor Máximo', 'right'],
              ['Variação Máxima', 'right'],
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
          {filterSettings.length === 0 ? (
            <tr>
              <td colSpan="4" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                Nenhum filtro configurado. Adicione um elemento abaixo.
              </td>
            </tr>
          ) : (
            filterSettings.map(setting => (
              <FilterRow 
                key={setting.element} 
                setting={setting} 
                updateFilterSetting={updateFilterSetting} 
                removeFilterElement={removeFilterElement} 
                readOnly={readOnly} 
              />
            ))
          )}
        </tbody>
      </table>

      {/* Formulário para Novo Filtro (Apenas Admin) */}
      {!readOnly && (
        <div style={{ padding: '16px 18px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', borderRadius: '0 0 14px 14px' }}>
          <form onSubmit={handleAdd} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <select
              value={selectedElement}
              onChange={e => setSelectedElement(e.target.value)}
              style={{
                flex: 1, padding: '9px 14px', borderRadius: 8, border: '1px solid #cbd5e1',
                fontSize: 13, color: selectedElement ? '#0f172a' : '#94a3b8', outline: 'none',
                background: '#fff', appearance: 'none'
              }}
              onFocus={e => e.target.style.borderColor = '#94a3b8'}
              onBlur={e => e.target.style.borderColor = '#cbd5e1'}
            >
              <option value="" disabled>Selecione um elemento para adicionar regras de filtro...</option>
              {availableElements.map(name => (
                <option key={name} value={name} style={{ color: '#0f172a' }}>{name}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!selectedElement}
              style={{
                padding: '9px 18px', borderRadius: 8, border: 'none', background: '#0f172a',
                color: '#fff', fontSize: 13, fontWeight: 600, cursor: selectedElement ? 'pointer' : 'not-allowed',
                opacity: selectedElement ? 1 : 0.5
              }}
            >
              + Adicionar Filtro
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
