import React, { useState, useEffect } from 'react'

export function SaveVisualizationModal({ isOpen, onClose, onSave, hasLoadedVis, currentName, existingNames = [] }) {
  const [name, setName] = useState('')
  const [saveAsNew, setSaveAsNew] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setName(currentName || '')
      setSaveAsNew(!hasLoadedVis) // Se não tem carregada, força 'novo'
      setError('')
    }
  }, [isOpen, currentName, hasLoadedVis])

  if (!isOpen) return null

  const handleSave = () => {
    const finalName = name.trim()
    if (!finalName) {
      setError('O nome não pode estar vazio.')
      return
    }

    // Se for salvar como novo, não permite nome duplicado
    if (saveAsNew && existingNames.includes(finalName)) {
      setError('Já existe uma visualização com este nome.')
      return
    }

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
        width: '400px', maxWidth: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
        animation: 'fadeIn 0.2s ease'
      }}>
        <h3 style={{ margin: '0 0 20px 0', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>Salvar Configurações</h3>
        
        {/* Toggle para escolha de modo */}
        {hasLoadedVis && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ 
              display: 'flex', background: 'var(--bg-secondary)', borderRadius: 10, padding: 4, 
              position: 'relative', height: 40, border: '1px solid var(--border)'
            }}>
              <div style={{
                position: 'absolute', top: 4, bottom: 4, left: saveAsNew ? 'calc(50% + 2px)' : 4,
                width: 'calc(50% - 6px)', background: 'var(--bg-card)', borderRadius: 6,
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)', transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
              }} />
              <button 
                onClick={() => setSaveAsNew(false)}
                style={{ 
                  flex: 1, zIndex: 1, background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: !saveAsNew ? 700 : 500, color: !saveAsNew ? 'var(--text-primary)' : 'var(--text-muted)',
                  transition: 'color 0.2s'
                }}
              >
                Sobrescrever
              </button>
              <button 
                onClick={() => setSaveAsNew(true)}
                style={{ 
                  flex: 1, zIndex: 1, background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: saveAsNew ? 700 : 500, color: saveAsNew ? 'var(--text-primary)' : 'var(--text-muted)',
                  transition: 'color 0.2s'
                }}
              >
                Salvar como Novo
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
              {saveAsNew ? 'Cria um novo registro na lista.' : 'Atualiza as configurações da visualização atual.'}
            </p>
          </div>
        )}

        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Nome da Visualização
          </label>
          <input 
            className="input" 
            style={{ width: '100%', borderColor: error ? 'var(--red)' : 'var(--border)' }}
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            placeholder="Ex: Análise de Causa Raiz - Skid 1..."
            autoFocus
          />
          {error && <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 6, fontWeight: 500 }}>⚠️ {error}</p>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button 
            className="btn btn-primary" 
            style={{ minWidth: 100 }}
            onClick={handleSave}
            disabled={!name.trim()}
          >
            Confirmar
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
