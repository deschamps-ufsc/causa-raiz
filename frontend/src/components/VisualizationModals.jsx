import React, { useState, useEffect } from 'react'

export function SaveVisualizationModal({ isOpen, onClose, onSave, hasLoadedVis, currentName }) {
  const [name, setName] = useState('')
  const [saveAsNew, setSaveAsNew] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setName(saveAsNew ? '' : (currentName || ''))
      setSaveAsNew(false)
    }
  }, [isOpen, currentName])

  if (!isOpen) return null

  const handleSave = () => {
    const finalName = saveAsNew ? name : (currentName || name)
    if (!finalName.trim()) return
    onSave({ name: finalName, saveAsNew })
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: 'var(--bg-card)', padding: '24px', borderRadius: '12px',
        width: '400px', maxWidth: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
      }}>
        <h3 style={{ margin: '0 0 16px 0' }}>Salvar Visualização</h3>
        
        {hasLoadedVis && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={saveAsNew} 
                onChange={(e) => setSaveAsNew(e.target.checked)} 
              />
              <span style={{ fontSize: 14 }}>Salvar como nova visualização</span>
            </label>
            {!saveAsNew && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, marginLeft: 22 }}>
                Isso sobrescreverá a visualização atual.
              </p>
            )}
          </div>
        )}

        {(!hasLoadedVis || saveAsNew) && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 6, fontWeight: 600 }}>
              Nome da Visualização
            </label>
            <input 
              className="input" 
              style={{ width: '100%' }}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Análise Inversor 3..."
              autoFocus
            />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button 
            className="btn btn-primary" 
            onClick={handleSave}
            disabled={(!hasLoadedVis || saveAsNew) && !name.trim()}
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

export function LoadVisualizationModal({ isOpen, onClose, onLoad, onDelete, visualizations }) {
  const [deleteRequest, setDeleteRequest] = useState(null)

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: 'var(--bg-card)', padding: '24px', borderRadius: '12px',
        width: '1000px', maxWidth: '95%', maxHeight: '85vh',
        boxShadow: '0 10px 25px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column'
      }}>
        <h3 style={{ margin: '0 0 16px 0' }}>Carregar Visualização</h3>
        
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', border: '1px solid var(--border)', borderRadius: 8 }}>
          {visualizations.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
              Nenhuma visualização salva para esta usina.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', width: '45%' }}>Nome</th>
                  <th style={{ padding: '8px 12px', width: '25%' }}>Usuário</th>
                  <th style={{ padding: '8px 12px', width: '12%' }}>Data</th>
                  <th style={{ padding: '8px 12px', width: '18%' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {visualizations.map(v => (
                  <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.name}>{v.name}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.user}>{v.user}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>
                      {new Date(v.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <button 
                          className="btn btn-sm btn-primary" 
                          style={{ padding: '4px 12px' }}
                          onClick={() => { onLoad(v); onClose() }}
                        >
                          Carregar
                        </button>
                        <button 
                          className="btn btn-sm btn-ghost" 
                          style={{ padding: '4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          onClick={() => setDeleteRequest({ id: v.id, name: v.name })}
                          title="Excluir"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
        </div>
      </div>

      {/* Modal Confirmação Exclusão */}
      {deleteRequest && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', width: '100%', maxWidth: 360, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', border: '1px solid #e2e8f0', animation: 'fadeIn 0.2s ease' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Confirmar Exclusão</h3>
                <p style={{ margin: '0 0 24px 0', fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
                    Tem certeza que deseja excluir a visualização <strong>{deleteRequest.name}</strong>? Esta ação não pode ser desfeita.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={() => setDeleteRequest(null)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancelar</button>
                    <button onClick={() => { onDelete(deleteRequest.id); setDeleteRequest(null) }} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Excluir</button>
                </div>
            </div>
        </div>
      )}
    </div>
  )
}
