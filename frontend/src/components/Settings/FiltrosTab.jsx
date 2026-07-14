import { useState } from 'react'
import { useChartSettings } from '../../hooks/ChartSettingsContext'

function FilterRow({ setting, index, updateFilterSetting, removeFilterRule, reorderFilterSettings, allElements = [], readOnly = false, draggedIndex, setDraggedIndex, draggedOverIndex, setDraggedOverIndex }) {
  const [isEditing, setIsEditing] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const handleNumChange = (field, val) => {
    if (val === '') {
      updateFilterSetting(setting.name, field, null)
    } else {
      updateFilterSetting(setting.name, field, Number(val))
    }
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: readOnly ? '#f1f5f9' : '#fff', border: '1px solid #e2e8f0',
    borderRadius: 6, color: '#0f172a', padding: '6px 10px',
    fontSize: 13, fontFamily: 'inherit', outline: 'none',
    transition: 'border-color 0.2s'
  }

  const handleDragStart = (e) => {
    if (readOnly) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
    setDraggedIndex(index);
    setTimeout(() => setIsDragging(true), 0);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setDraggedIndex(null);
    setDraggedOverIndex(null);
  };

  const handleDragOver = (e) => {
    if (readOnly) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedOverIndex !== index) {
      setDraggedOverIndex(index);
    }
  };

  const handleDrop = (e) => {
    if (readOnly) return;
    e.preventDefault();
    setDraggedIndex(null);
    setDraggedOverIndex(null);
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!isNaN(dragIndex) && dragIndex !== index) {
      reorderFilterSettings(dragIndex, index);
    }
  };

  const isDragOver = draggedOverIndex === index;
  let dragBorderTop = '1px solid #f1f5f9';
  let dragBorderBottom = 'none';

  if (isDragOver && draggedIndex !== null && draggedIndex !== index) {
    if (draggedIndex > index) {
      dragBorderTop = '2px solid #0ea5e9';
    } else {
      dragBorderBottom = '2px solid #0ea5e9';
    }
  }

  return (
    <tr style={{ 
        borderTop: dragBorderTop,
        borderBottom: dragBorderBottom,
        background: isDragging ? '#f8fafc' : 'transparent',
        opacity: isDragging ? 0.4 : 1,
        transition: 'background 0.15s, opacity 0.15s'
      }}
      draggable={!readOnly}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onMouseEnter={e => { if (!isDragging) e.currentTarget.style.background = '#f8fafc'; setIsHovered(true) }}
      onMouseLeave={e => { if (!isDragging) e.currentTarget.style.background = 'transparent'; setIsHovered(false); setIsConfirmingDelete(false) }}
    >
      {/* Nome - FIXO após criado */}
      <td style={{ padding: '10px 16px', color: '#0f172a', fontWeight: 700, fontSize: 13, background: isDragging ? 'transparent' : '#f8fafc' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!readOnly && (
            <div
              title="Arraste para reordenar"
              style={{
                cursor: 'grab',
                color: isHovered ? '#94a3b8' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: -8,
                marginRight: -4,
                padding: '0 4px',
                transition: 'color 0.15s'
              }}
            >
              <svg width="10" height="14" viewBox="0 0 12 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <circle cx="4" cy="4" r="1.5" />
                <circle cx="8" cy="4" r="1.5" />
                <circle cx="4" cy="8" r="1.5" />
                <circle cx="8" cy="8" r="1.5" />
                <circle cx="4" cy="12" r="1.5" />
                <circle cx="8" cy="12" r="1.5" />
              </svg>
            </div>
          )}
          {setting.name}
        </div>
      </td>

      {/* Elemento */}
      <td style={{ padding: '10px 16px', color: '#1e293b', fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap' }}>
        {isEditing ? (
          <select
            value={setting.element}
            onChange={e => updateFilterSetting(setting.name, 'element', e.target.value)}
            style={{ ...inputStyle, textAlign: 'left', background: '#fff' }}
          >
            {allElements.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        ) : (
          setting.element
        )}
      </td>
      <td style={{ padding: '10px 12px' }}>
        <input 
          type="number" 
          value={setting.min_value ?? ''} 
          onChange={e => handleNumChange('min_value', e.target.value)} 
          disabled={readOnly || !isEditing}
          placeholder={isEditing ? "Ilimitado" : ""}
          style={{ ...inputStyle, textAlign: 'right', opacity: (readOnly || !isEditing) ? 0.7 : 1, cursor: isEditing ? 'text' : 'default' }} 
          onFocus={e => isEditing && !readOnly && (e.target.style.borderColor = '#f59e0b')}
          onBlur={e => isEditing && !readOnly && (e.target.style.borderColor = '#e2e8f0')}
        />
      </td>
      <td style={{ padding: '10px 6px' }}>
        <select
          value={setting.min_action || 'excluir'}
          onChange={e => updateFilterSetting(setting.name, 'min_action', e.target.value)}
          disabled={readOnly || !isEditing}
          style={{ ...inputStyle, padding: '6px 4px', fontSize: 11, textAlign: 'center', opacity: (readOnly || !isEditing) ? 0.7 : 1, cursor: isEditing ? 'pointer' : 'default' }}
        >
          <option value="excluir">Excluir</option>
          <option value="substituir">Substituir</option>
        </select>
      </td>
      <td style={{ padding: '10px 12px' }}>
        <input 
          type="number" 
          value={setting.max_value ?? ''} 
          onChange={e => handleNumChange('max_value', e.target.value)} 
          disabled={readOnly || !isEditing}
          placeholder={isEditing ? "Ilimitado" : ""}
          style={{ ...inputStyle, textAlign: 'right', opacity: (readOnly || !isEditing) ? 0.7 : 1, cursor: isEditing ? 'text' : 'default' }} 
          onFocus={e => isEditing && !readOnly && (e.target.style.borderColor = '#f59e0b')}
          onBlur={e => isEditing && !readOnly && (e.target.style.borderColor = '#e2e8f0')}
        />
      </td>
      <td style={{ padding: '10px 6px' }}>
        <select
          value={setting.max_action || 'excluir'}
          onChange={e => updateFilterSetting(setting.name, 'max_action', e.target.value)}
          disabled={readOnly || !isEditing}
          style={{ ...inputStyle, padding: '6px 4px', fontSize: 11, textAlign: 'center', opacity: (readOnly || !isEditing) ? 0.7 : 1, cursor: isEditing ? 'pointer' : 'default' }}
        >
          <option value="excluir">Excluir</option>
          <option value="substituir">Substituir</option>
        </select>
      </td>
      <td style={{ padding: '10px 12px' }}>
        <input 
          type="number" 
          value={setting.min_variation ?? ''} 
          onChange={e => handleNumChange('min_variation', e.target.value)} 
          disabled={readOnly || !isEditing}
          placeholder={isEditing ? "Nenhuma" : ""}
          style={{ ...inputStyle, textAlign: 'right', opacity: (readOnly || !isEditing) ? 0.7 : 1, cursor: isEditing ? 'text' : 'default' }} 
          onFocus={e => isEditing && !readOnly && (e.target.style.borderColor = '#f59e0b')}
          onBlur={e => isEditing && !readOnly && (e.target.style.borderColor = '#e2e8f0')}
        />
      </td>
      <td style={{ padding: '10px 12px' }}>
        <input 
          type="number" 
          value={setting.min_time ?? ''} 
          onChange={e => handleNumChange('min_time', e.target.value)} 
          disabled={readOnly || !isEditing}
          placeholder={isEditing ? "Imediato" : ""}
          style={{ ...inputStyle, textAlign: 'right', opacity: (readOnly || !isEditing) ? 0.7 : 1, cursor: isEditing ? 'text' : 'default' }} 
          onFocus={e => isEditing && !readOnly && (e.target.style.borderColor = '#f59e0b')}
          onBlur={e => isEditing && !readOnly && (e.target.style.borderColor = '#e2e8f0')}
        />
      </td>
      <td style={{ padding: '10px 12px' }}>
        <input 
          type="number" 
          value={setting.max_variation ?? ''} 
          onChange={e => handleNumChange('max_variation', e.target.value)} 
          disabled={readOnly || !isEditing}
          placeholder={isEditing ? "Ilimitado" : ""}
          style={{ ...inputStyle, textAlign: 'right', opacity: (readOnly || !isEditing) ? 0.7 : 1, cursor: isEditing ? 'text' : 'default' }} 
          onFocus={e => isEditing && !readOnly && (e.target.style.borderColor = '#f59e0b')}
          onBlur={e => isEditing && !readOnly && (e.target.style.borderColor = '#e2e8f0')}
        />
      </td>
      <td style={{ padding: '10px 12px' }}>
        <input 
          type="number" 
          value={setting.median_window ?? ''} 
          onChange={e => handleNumChange('median_window', e.target.value)} 
          disabled={readOnly || !isEditing}
          placeholder={isEditing ? "Padrão" : ""}
          style={{ ...inputStyle, textAlign: 'right', opacity: (readOnly || !isEditing) ? 0.7 : 1, cursor: isEditing ? 'text' : 'default' }} 
          onFocus={e => isEditing && !readOnly && (e.target.style.borderColor = '#f59e0b')}
          onBlur={e => isEditing && !readOnly && (e.target.style.borderColor = '#e2e8f0')}
        />
      </td>

      {/* Ações */}
      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {!readOnly && (
            <>
              <button
                onClick={() => setIsEditing(!isEditing)}
                title={isEditing ? "Salvar alterações" : "Editar filtro"}
                style={{
                  background: isEditing ? 'var(--amber)' : '#fff', 
                  border: isEditing ? 'none' : '1px solid #e2e8f0', 
                  cursor: 'pointer',
                  color: isEditing ? '#000' : '#64748b', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '5px 8px', transition: 'all 0.15s', borderRadius: 6,
                  boxShadow: isEditing ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                }}
                onMouseEnter={e => { 
                  if (!isEditing) {
                    e.currentTarget.style.background = '#f8fafc'; 
                    e.currentTarget.style.borderColor = '#94a3b8';
                  }
                }}
                onMouseLeave={e => { 
                  if (!isEditing) {
                    e.currentTarget.style.background = '#fff'; 
                    e.currentTarget.style.borderColor = '#e2e8f0';
                  }
                }}
              >
                {isEditing ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : '✏️'}
              </button>
              <button
                onClick={() => setIsConfirmingDelete(true)}
                title="Remover filtro"
                style={{
                  background: 'none', border: '1px solid #fee2e2', cursor: 'pointer',
                  color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '5px 8px', transition: 'all 0.15s', borderRadius: 6
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#fecaca' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = '#fee2e2' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </>
          )}
        </div>

        {isConfirmingDelete && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', width: '100%', maxWidth: 360, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', border: '1px solid #e2e8f0', animation: 'fadeIn 0.2s ease' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Confirmar Exclusão</h3>
              <p style={{ margin: '0 0 24px 0', fontSize: 14, color: '#64748b', lineHeight: 1.5, whiteSpace: 'normal', textAlign: 'left' }}>
                Tem certeza que deseja remover o filtro <strong>{setting.name}</strong>?
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setIsConfirmingDelete(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancelar</button>
                <button onClick={() => removeFilterRule(setting.name)} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Remover</button>
              </div>
            </div>
          </div>
        )}
      </td>
    </tr>
  )
}

export default function FiltrosTab({ readOnly = false }) {
  const { elementSettings, filterSettings, addFilterRule, updateFilterSetting, removeFilterRule, reorderFilterSettings, loading } = useChartSettings()
  const [selectedElement, setSelectedElement] = useState('')
  const [newName, setNewName] = useState('')
  const [draggedIndex, setDraggedIndex] = useState(null)
  const [draggedOverIndex, setDraggedOverIndex] = useState(null)
  const [showHelp, setShowHelp] = useState(false)

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Carregando filtros...</div>

  const allElements = [...new Set(elementSettings.map(s => s.element))].sort()

  const handleAdd = (e) => {
    e.preventDefault()
    if (!selectedElement || !newName.trim()) return
    
    if (filterSettings.some(f => f.name.toLowerCase() === newName.trim().toLowerCase())) {
      alert("Já existe um filtro com este nome.")
      return
    }

    addFilterRule(newName.trim(), selectedElement)
    setSelectedElement('')
    setNewName('')
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Configurações de Filtro de Dados</h2>
          <button 
            onClick={() => setShowHelp(true)}
            title="Como funcionam os filtros?"
            style={{ 
              background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </button>
        </div>
        <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>
          Defina os limites padrão de qualidade para os dados brutos importados no sistema. Deixe vazio para não restringir.
        </p>
      </div>

      {/* Modal de Ajuda */}
      {showHelp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', width: '100%', maxWidth: 750, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.2)', border: '1px solid #e2e8f0', animation: 'fadeIn 0.2s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Entendendo os Filtros</h3>
              <button onClick={() => setShowHelp(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
              <p style={{ marginBottom: 12 }}><strong>Valor Mínimo / Máximo:</strong> Detecta qualquer valor que esteja abaixo do mínimo ou acima do máximo configurado. Útil para limites físicos (ex: Irradiação não pode ser negativa).</p>
              <p style={{ marginBottom: 12 }}><strong>Ação Mín. / Máx.:</strong> Define o que fazer quando o limite mínimo ou máximo é ultrapassado. A opção "Excluir" remove o ponto do gráfico por ser inválido. Já a opção "Substituir" força o valor corrompido a se tornar o limite exato que você definiu na caixa ao lado.</p>
              <p style={{ marginBottom: 12 }}><strong>Variação Mín. (Dado Travado):</strong> Se a diferença entre o ponto atual e o anterior for MENOR que esse valor, o dado é candidato a ser excluído.</p>
              <p style={{ marginBottom: 12 }}><strong>Tempo Mín.:</strong> Trabalha em conjunto com a Variação Mín. Define por quantos minutos o dado precisa ficar "travado" antes de ser deletado. Se deixar vazio, deleta imediatamente.</p>
              <p style={{ marginBottom: 12 }}><strong>Variação Máx. (Picos/Anomalias):</strong> Usado para detectar <em>Saltos ou Quedas Bruscas</em>. Se a variação for MAIOR que esse valor, o dado é excluído.</p>
              <p style={{ marginBottom: 12 }}><strong>Janela Med.:</strong> Trabalha em conjunto com a Variação Máx. Se preenchido (ex: 11 minutos), a variação passa a ser calculada contra a <em>Mediana Móvel</em> da janela. Isso protege saltos legítimos do sensor (degraus/rampas) e corta apenas picos temporários e anomalias rápidas.</p>
            </div>
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowHelp(false)} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Entendi</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <colgroup>
          <col style={{ width: '15%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
        </colgroup>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {[
              ['Nome', 'left'],
              ['Elemento', 'left'],
              ['Valor Mínimo', 'right'],
              ['Ação Mín.', 'center'],
              ['Valor Máximo', 'right'],
              ['Ação Máx.', 'center'],
              ['Variação Mín.', 'right'],
              ['Tempo Mín.', 'right'],
              ['Variação Máx.', 'right'],
              ['Janela Med.', 'right'],
              ['Ações', 'center'],
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
              <td colSpan="11" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                Nenhum filtro configurado. Adicione um elemento abaixo.
              </td>
            </tr>
          ) : (
            filterSettings.map((setting, idx) => (
              <FilterRow 
                key={setting.element + setting.name} 
                setting={setting}
                index={idx}
                updateFilterSetting={updateFilterSetting} 
                removeFilterRule={removeFilterRule} 
                reorderFilterSettings={reorderFilterSettings}
                allElements={allElements}
                readOnly={readOnly}
                draggedIndex={draggedIndex}
                setDraggedIndex={setDraggedIndex}
                draggedOverIndex={draggedOverIndex}
                setDraggedOverIndex={setDraggedOverIndex}
              />
            ))
          )}
        </tbody>
      </table>

      {/* Formulário para Novo Filtro (Apenas Admin) */}
      {!readOnly && (
        <div style={{ padding: '16px 18px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', borderRadius: '0 0 14px 14px' }}>
          <form onSubmit={handleAdd} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input 
              type="text"
              placeholder="Nome do novo filtro..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              style={{
                flex: 1, padding: '9px 14px', borderRadius: 8, border: '1px solid #cbd5e1',
                fontSize: 13, color: '#0f172a', outline: 'none', background: '#fff'
              }}
              onFocus={e => e.target.style.borderColor = '#94a3b8'}
              onBlur={e => e.target.style.borderColor = '#cbd5e1'}
            />
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
              <option value="" disabled>Vincular ao elemento...</option>
              {allElements.map(name => (
                <option key={name} value={name} style={{ color: '#0f172a' }}>{name}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!selectedElement || !newName.trim()}
              style={{
                padding: '9px 18px', borderRadius: 8, border: 'none', background: '#0f172a',
                color: '#fff', fontSize: 13, fontWeight: 600, cursor: (selectedElement && newName.trim()) ? 'pointer' : 'not-allowed',
                opacity: (selectedElement && newName.trim()) ? 1 : 0.5,
                whiteSpace: 'nowrap'
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
