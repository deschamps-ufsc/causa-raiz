import { useState } from 'react'
import { updateUsinaDriveLink } from '../../services/api'

// Converte YYYY-MM-DD → DD/MM/YYYY para exibição
const toDisplay = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// Converte DD/MM/YYYY → YYYY-MM-DD para o backend
const toIso = (display) => {
  const parts = display.trim().split('/')
  if (parts.length === 3) {
    const [d, m, y] = parts
    if (d && m && y && y.length === 4) return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
  }
  return null
}

export default function DriveImportModal({ usina, usinaObj, onClose, onSuccess }) {
  const [driveLink, setDriveLink] = useState(usinaObj?.drive_link || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  const [breadcrumbs, setBreadcrumbs] = useState([])
  const [currentItems, setCurrentItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(false)
  
  const [selectedFiles, setSelectedFiles] = useState({})
  const [skipUnmapped, setSkipUnmapped] = useState(false)
  const [importProgress, setImportProgress] = useState(null)

  // ── Passo de confirmação de data ──────────────────────────────────
  const [confirmStep, setConfirmStep] = useState(false) // true = mostra o painel de confirmação
  const [detectedFiles, setDetectedFiles] = useState([]) // [{ file_id, filename, detected_date, confirmed_date_display }]

  // 1. Check link and get root folder metadata
  const handleCheckLink = async () => {
    if (!driveLink) return;
    setLoading(true)
    setError(null)
    setBreadcrumbs([])
    setCurrentItems([])
    setSelectedFiles({})
    
    try {
      const res = await fetch('http://localhost:8000/api/drive/check-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: driveLink })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Erro ao carregar link do Drive')
      
      const rootFolder = data.data.rootFolder
      setBreadcrumbs([{ id: rootFolder.id, name: rootFolder.name || 'Raiz' }])
      await loadFolderContents(rootFolder.id)
      
      const usinaName = usina.nome || usina
      try {
        await updateUsinaDriveLink(usinaName, driveLink)
        if (usinaObj) usinaObj.drive_link = driveLink
      } catch (err) {
        console.error('Failed to save drive link:', err)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadFolderContents = async (folderId) => {
    setItemsLoading(true)
    setError(null)
    try {
      const res = await fetch(`http://localhost:8000/api/drive/folder/${folderId}/files`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Erro ao carregar arquivos')
      setCurrentItems(data.files || [])
    } catch(err) {
      setError(err.message)
      setCurrentItems([])
    } finally {
      setItemsLoading(false)
    }
  }

  const handleFolderClick = (folder) => {
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }])
    loadFolderContents(folder.id)
  }

  const handleBreadcrumbClick = (index) => {
    const target = breadcrumbs[index]
    setBreadcrumbs(prev => prev.slice(0, index + 1))
    loadFolderContents(target.id)
  }

  const toggleFile = (id) => {
    setSelectedFiles(prev => ({ ...prev, [id]: !prev[id] }))
  }
  
  const toggleAllFiles = () => {
    const filesOnly = currentItems.filter(i => i.mimeType !== 'application/vnd.google-apps.folder')
    const allSelected = filesOnly.every(f => selectedFiles[f.id])
    const newSelection = { ...selectedFiles }
    filesOnly.forEach(f => { newSelection[f.id] = !allSelected })
    setSelectedFiles(newSelection)
  }

  const handleExportSeriesNames = async () => {
    const fileIds = Object.keys(selectedFiles).filter(id => selectedFiles[id])
    if (fileIds.length === 0) { alert("Nenhum arquivo selecionado!"); return }
    
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('http://localhost:8000/api/drive/export-series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_ids: fileIds })
      })
      if (!res.ok) {
         const data = await res.json().catch(() => ({}))
         throw new Error(data.detail || 'Erro ao exportar séries')
      }
      
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = "series_mapeadas.xlsx"
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Passo 1: Preview (detectar datas antes de importar) ──────────
  const handlePreview = async () => {
    const fileIds = Object.keys(selectedFiles).filter(id => selectedFiles[id])
    if (fileIds.length === 0) { alert("Nenhum arquivo selecionado!"); return }
    
    setLoading(true)
    setError(null)
    
    try {
      const res = await fetch('http://localhost:8000/api/drive/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_ids: fileIds })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Erro ao pré-visualizar arquivos')
      
      // Enriquece cada arquivo com a data em formato ISO nativo editável
      const enriched = data.files.map(f => ({
        ...f,
        confirmed_iso_date: f.detected_date || '',
      }))
      setDetectedFiles(enriched)
      setConfirmStep(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Passo 2: Importação real com as datas confirmadas e STREAMING DE PROGRESSO ──
  const handleImport = async () => {
    setLoading(true)
    setError(null)
    setImportProgress({ status: 'starting', message: 'Iniciando...', progress: 0, total: 0, file_idx: 1, total_files: detectedFiles.length })
    
    let total_series = 0
    try {
      let idx = 1
      for (const f of detectedFiles) {
        const override_date = f.confirmed_iso_date
        if (!override_date) {
          throw new Error(`Data inválida para "${f.filename}". Selecione uma data válida.`)
        }
        
        const res = await fetch('http://localhost:8000/api/drive/import-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            usina: usina.id || usina.nome || usina,
            file_ids: [f.file_id],
            skip_unmapped: skipUnmapped,
            override_date: override_date,
          })
        })
        
        if (!res.ok) {
           const errData = await res.json().catch(() => ({}))
           throw new Error(errData.detail || `Erro ao importar "${f.filename}"`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        
        while(true) {
          const { done, value } = await reader.read()
          if (done) break
          
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const msg = JSON.parse(line)
              if (msg.status === 'error') throw new Error(msg.message)
              if (msg.status === 'success') {
                total_series += msg.total_series || 0
              } else {
                setImportProgress({ ...msg, file_idx: idx, total_files: detectedFiles.length })
              }
            } catch (e) {
              if (e.message && !e.message.includes('JSON')) throw e
            }
          }
        }
        idx++
      }
      
      if (onSuccess) {
        onSuccess(`Foram importadas ${total_series} séries do Google Drive.`)
      } else {
        alert(`Importação concluída! ${total_series} séries importadas.`)
        onClose()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setImportProgress(null)
    }
  }

  const folders = currentItems.filter(i => i.mimeType === 'application/vnd.google-apps.folder')
  const files = currentItems.filter(i => i.mimeType !== 'application/vnd.google-apps.folder')
  const selectedCount = Object.values(selectedFiles).filter(v => v).length

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}>
      <div className="card fade-in" style={{ width: '90%', maxWidth: 700, background: 'var(--bg-card)', padding: '24px', borderRadius: '12px', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        
        {/* ── HEADER ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>
            {confirmStep ? '📅 Confirmar Datas da Importação' : '☁️ Importar do Google Drive'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 24, lineHeight: 1 }}>&times;</button>
        </div>

        {/* ── PAINEL DE CONFIRMAÇÃO DE DATA ── */}
        {confirmStep ? (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              Verifique as datas detectadas nos arquivos. <strong>Corrija se necessário</strong> antes de confirmar a importação.
              Os dados serão importados para a data que você definir abaixo.
            </p>

            {detectedFiles.map((f, idx) => {
              const isValid = !!f.confirmed_iso_date
              const isChanged = f.confirmed_iso_date !== f.detected_date

              const applyToAll = () => {
                 if (!f.confirmed_iso_date) return
                 if (window.confirm(`Aplicar a data ${toDisplay(f.confirmed_iso_date)} para todos os arquivos listados?`)) {
                    setDetectedFiles(prev => prev.map(p => ({ ...p, confirmed_iso_date: f.confirmed_iso_date })))
                 }
              }

              return (
                <div key={f.file_id} style={{
                  border: `1.5px solid ${isChanged ? 'var(--amber)' : 'var(--border)'}`,
                  borderRadius: 10, padding: '14px 16px', marginBottom: 14,
                  background: isChanged ? 'rgba(245,158,11,0.06)' : 'var(--bg-secondary)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 4, wordBreak: 'break-all' }}>
                        📄 {f.filename}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Data detectada nos dados: <strong>{toDisplay(f.detected_date) || '⚠️ Não detectada'}</strong>
                      </div>
                      {detectedFiles.length > 1 && isValid && (
                         <button 
                            onClick={applyToAll} 
                            style={{ background: 'none', border: 'none', color: 'var(--amber)', fontSize: 11, fontWeight: 600, padding: 0, marginTop: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                         >
                            <span>↳</span> Aplicar esta data a todos os arquivos
                         </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>DATA CORRETA</label>
                      <input
                        type="date"
                        value={f.confirmed_iso_date}
                        onChange={e => setDetectedFiles(prev => prev.map((p, i) =>
                          i === idx ? { ...p, confirmed_iso_date: e.target.value } : p
                        ))}
                        style={{
                          border: `1.5px solid ${!isValid ? '#ef4444' : isChanged ? 'var(--amber)' : 'var(--border)'}`,
                          borderRadius: 6, padding: '5px 8px', fontSize: 14, fontWeight: 600,
                          background: 'var(--bg-input)', color: 'var(--text-primary)',
                          width: 140, cursor: 'pointer', fontFamily: 'inherit'
                        }}
                      />
                      {isChanged && isValid && (
                        <span style={{ fontSize: 11, color: 'var(--amber)' }}>✏️ Alterada pelo usuário</span>
                      )}
                      {!isValid && (
                        <span style={{ fontSize: 11, color: '#ef4444' }}>Campo obrigatório</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

            {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>⚠️ {error}</div>}

            {importProgress && (
              <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', fontWeight: 600 }}>
                  <span style={{ color: 'var(--text-primary)' }}>{importProgress.message}</span>
                  <span style={{ color: 'var(--text-muted)' }}>Arquivo {importProgress.file_idx} de {importProgress.total_files}</span>
                </div>
                {importProgress.total > 0 && (
                  <>
                    <div style={{ height: '8px', background: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
                      <div style={{ 
                        height: '100%', 
                        background: 'var(--amber)', 
                        width: `${(importProgress.progress / importProgress.total) * 100}%`,
                        transition: 'width 0.1s linear' 
                      }} />
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right' }}>
                      {importProgress.progress} / {importProgress.total} séries processadas
                    </div>
                  </>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={() => { setConfirmStep(false); setError(null) }}>
                ← Voltar
              </button>
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={loading || detectedFiles.some(f => !f.confirmed_iso_date)}
              >
                {loading ? '⏳ Importando...' : `✅ Confirmar e Importar (${detectedFiles.length} arquivo${detectedFiles.length > 1 ? 's' : ''})`}
              </button>
            </div>
          </div>

        ) : (
          /* ── PAINEL PRINCIPAL (NAVEGAÇÃO) ── */
          <>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, flexShrink: 0 }}>
              Cole o link público (ou compartilhado com você) da pasta do Google Drive contendo os dados da usina <b>{usina.nome}</b>. Você poderá navegar pelas pastas e escolher quais arquivos quer importar.
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexShrink: 0 }}>
              <input 
                type="text" 
                className="input-field" 
                placeholder="https://drive.google.com/drive/folders/..." 
                value={driveLink}
                onChange={e => setDriveLink(e.target.value)}
                style={{ flex: 1 }}
                onKeyDown={e => e.key === 'Enter' && handleCheckLink()}
              />
              <button className="btn btn-secondary" onClick={handleCheckLink} disabled={loading || !driveLink}>
                {loading ? '⏳' : 'Buscar Pasta'}
              </button>
            </div>

            {error && <div className="alert alert-error" style={{ marginBottom: 16, flexShrink: 0 }}>⚠️ {error}</div>}

            {/* BREADCRUMBS */}
            {breadcrumbs.length > 0 && (
              <div style={{ padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 13, flexShrink: 0 }}>
                {breadcrumbs.map((b, index) => (
                  <span key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span 
                      onClick={() => handleBreadcrumbClick(index)}
                      style={{ 
                        cursor: index === breadcrumbs.length - 1 ? 'default' : 'pointer', 
                        color: index === breadcrumbs.length - 1 ? 'var(--text-primary)' : 'var(--amber)',
                        fontWeight: index === breadcrumbs.length - 1 ? 600 : 400
                      }}
                      className={index < breadcrumbs.length - 1 ? 'hover-underline' : ''}
                    >
                      {b.name}
                    </span>
                    {index < breadcrumbs.length - 1 && <span style={{ color: 'var(--text-muted)' }}>/</span>}
                  </span>
                ))}
              </div>
            )}

            {/* FILE BROWSER */}
            {breadcrumbs.length > 0 && (
              <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-input)', borderRadius: 8, border: '1px solid var(--border)', minHeight: 200, display: 'flex', flexDirection: 'column' }}>
                {itemsLoading ? (
                  <div style={{ margin: 'auto', padding: 40, color: 'var(--text-secondary)', fontSize: 14 }}>
                    ⏳ Carregando conteúdo da pasta...
                  </div>
                ) : currentItems.length === 0 ? (
                  <div style={{ margin: 'auto', padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>
                    Esta pasta está vazia.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {(files.length > 0 || folders.length > 0) && (
                      <div style={{ display: 'flex', padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)', fontWeight: 600, fontSize: 12, color: 'var(--text-muted)' }}>
                        <div style={{ flex: 1 }}>Nome</div>
                        <div style={{ width: 150, textAlign: 'right' }}>Salvo no Drive em</div>
                      </div>
                    )}
                    
                    {folders.map(folder => (
                      <div 
                        key={folder.id} 
                        onClick={() => handleFolderClick(folder)}
                        style={{ 
                          display: 'flex', padding: '10px 14px', borderBottom: '1px solid var(--border)33', 
                          cursor: 'pointer', alignItems: 'center', transition: 'background 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                          <span style={{ fontSize: 18 }}>📁</span>
                          <span style={{ color: 'var(--text-primary)' }}>{folder.name}</span>
                        </div>
                        <div style={{ width: 150, textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
                          {folder.modifiedTime ? new Date(folder.modifiedTime).toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}) : '—'}
                        </div>
                      </div>
                    ))}
                    
                    {files.length > 0 && (
                      <div style={{ padding: '8px 14px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>ARQUIVOS</span>
                        <button onClick={toggleAllFiles} style={{ background: 'none', border: 'none', color: 'var(--amber)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                          Selecionar Todos
                        </button>
                      </div>
                    )}
                    {files.map(file => (
                      <label 
                        key={file.id} 
                        style={{ 
                          display: 'flex', padding: '10px 14px', borderBottom: '1px solid var(--border)33', 
                          cursor: 'pointer', alignItems: 'center', background: selectedFiles[file.id] ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                          transition: 'background 0.2s'
                        }}
                      >
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                          <input 
                            type="checkbox" 
                            checked={selectedFiles[file.id] || false} 
                            onChange={() => toggleFile(file.id)} 
                            style={{ accentColor: 'var(--amber)', width: 16, height: 16 }}
                          />
                          <span style={{ fontSize: 16 }}>📄</span>
                          <span style={{ color: selectedFiles[file.id] ? 'var(--amber)' : 'var(--text-primary)' }}>{file.name}</span>
                        </div>
                        <div style={{ width: 150, textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
                          {file.modifiedTime ? new Date(file.modifiedTime).toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}) : '—'}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, flexShrink: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 16, alignItems: 'center' }}>
                {selectedCount > 0 ? <span><strong>{selectedCount}</strong> arquivo(s) selecionado(s)</span> : <span>Nenhum arquivo selecionado</span>}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', paddingLeft: 16, borderLeft: '1px solid var(--border)' }}>
                  <input type="checkbox" checked={skipUnmapped} onChange={(e) => setSkipUnmapped(e.target.checked)} style={{ accentColor: 'var(--amber)' }} />
                  <span style={{ color: 'var(--text-primary)' }}>Pular séries não mapeadas</span>
                </label>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancelar</button>
                <button 
                  className="btn btn-ghost" 
                  onClick={handleExportSeriesNames} 
                  disabled={selectedCount === 0 || loading}
                  style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {loading ? '⏳' : '📥'} Extrair Nomes de Séries
                </button>
                <button className="btn btn-primary" onClick={handlePreview} disabled={selectedCount === 0 || loading}>
                  {loading ? '⏳ Analisando...' : 'Próximo →'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .hover-underline:hover { text-decoration: underline; }
      `}} />
    </div>
  )
}
