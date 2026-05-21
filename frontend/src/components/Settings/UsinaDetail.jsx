import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  uploadExcel,
  fetchUsinaInfo, importUsinaInfo, getUsinaInfoTemplateUrl,
  fetchSynthetics, importSyntheticExcel, saveBatchConfig, deleteBatch,
} from '../../services/api'
import { ErrorState } from '../StateComponents'
import SeriesMapImport from '../SeriesMapImport'

const TABS = [
  { id: 'dados',     label: '📤 Dados Diários' },
  { id: 'depara',   label: '🗂️ Mapeamento de Séries' },
  { id: 'infos',    label: '⚡ Infos Usina' },
  { id: 'sintetica', label: '🧪 Séries Sintéticas' },
]

const tdStyle = {
  padding: '6px 12px',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
}

export default function UsinaDetail({ usina }) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('dados')

  // Reset states when the selected usina switches
  useEffect(() => {
    setFile(null)
    setUploading(false)
    setProgress(0)
    setResult(null)
    setUploadError(null)
    setInfoFile(null)
    setInfoResult(null)
    setInfoError(null)
    setSynthFile(null)
    setSynthNomeGrupo('')
    setSynthResult(null)
    setSynthError(null)
  }, [usina])

  // ── Tab 1: Dados Diários ─────────────────────────────────────────────────
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [uploadError, setUploadError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  const handleFile = (f) => {
    if (!f) return
    if (!f.name.match(/\.(xlsx|xls)$/i)) { setUploadError('Apenas .xlsx ou .xls'); return }
    setFile(f); setUploadError(null); setResult(null)
  }
  const handleUpload = async () => {
    if (!file || !usina) return
    setUploading(true); setProgress(0); setUploadError(null)
    try {
      const res = await uploadExcel(usina, file, setProgress)
      setResult(res)
    } catch (e) { setUploadError(e.message) }
    finally { setUploading(false) }
  }
  const formatBytes = (b) => b < 1024*1024 ? `${(b/1024).toFixed(0)} KB` : `${(b/1024/1024).toFixed(1)} MB`

  // ── Tab 3: Infos Usina ───────────────────────────────────────────────────
  const [infoFile, setInfoFile] = useState(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [infoResult, setInfoResult] = useState(null)
  const [infoError, setInfoError] = useState(null)
  const [infoData, setInfoData] = useState({})
  const [infoDragging, setInfoDragging] = useState(false)
  const [infoPage, setInfoPage] = useState(1)
  const infoInputRef = useRef()

  useEffect(() => {
    if (usina && activeTab === 'infos') {
      fetchUsinaInfo(usina).then(setInfoData).catch(() => {})
    }
  }, [usina, activeTab])

  const handleInfoImport = async () => {
    if (!infoFile || !usina) return
    setInfoLoading(true); setInfoError(null)
    try {
      const res = await importUsinaInfo(usina, infoFile)
      setInfoResult(res)
      const updated = await fetchUsinaInfo(usina)
      setInfoData(updated)
    } catch (e) { setInfoError(e.message) }
    finally { setInfoLoading(false) }
  }

  // ── Tab 4: Séries Sintéticas ─────────────────────────────────────────
  const [synthFile, setSynthFile] = useState(null)
  const [synthNomeGrupo, setSynthNomeGrupo] = useState('')
  const [synthLoading, setSynthLoading] = useState(false)
  const [synthResult, setSynthResult] = useState(null)
  const [synthError, setSynthError] = useState(null)
  const [synthData, setSynthData] = useState({})
  const [synthDragging, setSynthDragging] = useState(false)
  const [batchEdits, setBatchEdits] = useState({})
  const [batchSaving, setBatchSaving] = useState({})
  const synthInputRef = useRef()

  const reloadSynths = (u) =>
    fetchSynthetics(u).then(d => {
      setSynthData(d)
      const edits = {}
      Object.entries(d).forEach(([id, b]) => { edits[id] = { formula: b.formula || '', nome: b.nome || '' } })
      setBatchEdits(edits)
    }).catch(() => {})

  useEffect(() => {
    if (usina && activeTab === 'sintetica') reloadSynths(usina)
  }, [usina, activeTab])

  const handleSynthImport = async () => {
    if (!synthFile || !usina) return
    setSynthLoading(true); setSynthError(null)
    try {
      const res = await importSyntheticExcel(usina, synthFile, synthNomeGrupo)
      setSynthResult(res)
      await reloadSynths(usina)
      setSynthFile(null); setSynthNomeGrupo('')
    } catch (e) { setSynthError(e.message) }
    finally { setSynthLoading(false) }
  }

  const handleBatchSave = async (batchId) => {
    setBatchSaving(p => ({ ...p, [batchId]: true }))
    try {
      const { formula, nome } = batchEdits[batchId] || {}
      await saveBatchConfig(usina, batchId, formula || '', nome || '')
      await reloadSynths(usina)
    } catch (e) { setSynthError(e.message) }
    finally { setBatchSaving(p => ({ ...p, [batchId]: false })) }
  }

  const handleBatchDelete = async (batchId, nome) => {
    if (!window.confirm(`Remover o grupo "${nome}" e todas as suas ${synthData[batchId]?.series?.length} séries?`)) return
    try {
      await deleteBatch(usina, batchId)
      await reloadSynths(usina)
    } catch (e) { setSynthError(e.message) }
  }

  return (
    <div style={{ background: 'var(--bg-primary)', padding: '4px 0 24px' }}>
      <div style={{ maxWidth: '100%', margin: '0 auto' }}>
        {/* Tabs */}
        <div className="tabs" style={{ marginBottom: 20 }}>
          {TABS.map(t => (
            <button key={t.id} className={`tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TAB 1: Dados Diários ────────────────────────────────────────────── */}
        {activeTab === 'dados' && (
          <div className="card">
            <div className="card-title">📤 Upload de Excel Diário</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Envie o Excel diário da usina. Resolução de 1 minuto · até 10.000 séries.
            </p>

            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
              onClick={() => !uploading && inputRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? 'var(--amber)' : file ? 'var(--green)' : 'var(--border)'}`,
                background: dragging ? 'var(--amber-glow)' : file ? 'rgba(16,185,129,0.05)' : 'var(--gradient-card)',
                cursor: uploading ? 'default' : 'pointer',
                textAlign: 'center', padding: '36px 24px', borderRadius: 8, transition: 'all 0.3s', marginBottom: 14,
              }}
            >
              <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
              {file ? (
                <div className="fade-in">
                  <div style={{ fontSize: 42, marginBottom: 8 }}>📊</div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{file.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatBytes(file.size)}</div>
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={e => { e.stopPropagation(); setFile(null); setResult(null) }}>Trocar</button>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 48, opacity: 0.5, marginBottom: 12 }}>📤</div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Arraste o Excel aqui</div>
                  <span className="badge badge-gray">.xlsx · .xls</span>
                </>
              )}
            </div>

            {uploading && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  <span>⚙️ Processando...</span><span>{progress}%</span>
                </div>
                <div style={{ height: 5, background: 'var(--bg-input)', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: 'var(--gradient-solar)', borderRadius: 3, transition: 'width 0.3s' }} />
                </div>
              </div>
            )}

            <button className="btn btn-primary btn-full" onClick={handleUpload} disabled={!file || uploading}>
              {uploading ? `⏳ ${progress}%` : '🚀 Processar e Converter para Parquet'}
            </button>

            {uploadError && <div className="alert alert-error fade-in" style={{ marginTop: 12 }}>⚠️ {uploadError}</div>}

            {result && (
              <div className="card fade-in" style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 22 }}>{result.cached ? '⚡' : '✅'}</span>
                  <div>
                    <div style={{ fontWeight: 700 }}>{result.cached ? 'Cache hit' : 'Processado com sucesso!'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{result.filename}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  <div className="stat-card"><div className="stat-label">Data</div><div style={{ fontWeight: 800 }}>{result.date}</div></div>
                  <div className="stat-card"><div className="stat-label">Séries</div><div className="stat-value">{result.series_count?.toLocaleString('pt-BR')}</div></div>
                </div>
                <button className="btn btn-primary btn-full" onClick={() => navigate('/dashboard', { state: { date: result.date } })}>
                  📊 Ver Dashboard
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: Mapeamento de Séries ──────────────────────────────────────── */}
        {activeTab === 'depara' && (
          <div>
            <div className="card">
              <div className="card-title">📥 Importar Mapeamento de Séries</div>
              <SeriesMapImport usina={usina} />
            </div>
          </div>
        )}

        {/* ── TAB 3: Infos Usina ──────────────────────────────────────────────── */}
        {activeTab === 'infos' && (
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">⚡ Importar Infos Usina (Configuração de Hardware)</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
                Faça upload do Excel com: <strong>skid | inversor | stringbox | string | Qtde Módulos | Wp</strong>.
                Estes dados definem o kWp natural de cada divisão.
              </p>

              <div
                onDragOver={e => { e.preventDefault(); setInfoDragging(true) }}
                onDragLeave={() => setInfoDragging(false)}
                onDrop={e => { e.preventDefault(); setInfoDragging(false); setInfoFile(e.dataTransfer.files[0]) }}
                onClick={() => infoInputRef.current?.click()}
                style={{
                  border: `2px dashed ${infoDragging ? 'var(--amber)' : infoFile ? 'var(--green)' : 'var(--border)'}`,
                  background: infoDragging ? 'var(--amber-glow)' : 'transparent',
                  cursor: 'pointer', textAlign: 'center', padding: '28px 20px',
                  borderRadius: 8, transition: 'all 0.2s', marginBottom: 12,
                }}
              >
                <input ref={infoInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => setInfoFile(e.target.files[0])} />
                <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{infoFile ? infoFile.name : 'Arraste o Excel aqui'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>skid | inversor | stringbox | string | Qtde Módulos | Wp</div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleInfoImport} disabled={!infoFile || infoLoading}>
                  {infoLoading ? '⏳ Importando...' : '📥 Importar Infos'}
                </button>
                <a className="btn btn-secondary" href={getUsinaInfoTemplateUrl()} download>📄 Template</a>
              </div>

              {infoError && <ErrorState message={infoError} style={{ marginTop: 12 }} />}

              {infoResult && (
                <div className="alert alert-success fade-in" style={{ marginTop: 12 }}>
                  ✅ <strong>{infoResult.total_series}</strong> séries importadas
                </div>
              )}
            </div>

            {Object.keys(infoData).length > 0 && (
              <div className="card">
                <div className="card-title">📊 Dados Cadastrados ({Object.keys(infoData).length} séries)</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {['SKID', 'Inversor', 'Stringbox', 'String', 'Qtde Módulos', 'Wp', 'kWp'].map(h => (
                          <th key={h} style={{ background: 'var(--bg-secondary)', padding: '7px 12px', textAlign: 'left', fontWeight: 700, fontSize: 12, color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(infoData).slice((infoPage - 1) * 20, infoPage * 20).map(([serie, row], i) => {
                        const parts = serie.split('|');
                        return (
                          <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                            <td style={tdStyle}>{parts[0] || '—'}</td>
                            <td style={tdStyle}>{parts[1] || '—'}</td>
                            <td style={tdStyle}>{parts[2] || '—'}</td>
                            <td style={tdStyle}>{parts[3] || '—'}</td>
                            <td style={tdStyle}>{row.qtde_modulos ?? '—'}</td>
                            <td style={tdStyle}>{row.wp != null ? `${row.wp} Wp` : '—'}</td>
                            <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--amber)' }}>{row.kwp != null ? `${row.kwp.toFixed(3)} kWp` : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {Object.keys(infoData).length > 20 && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, padding: '12px 10px', fontSize: 13, color: 'var(--text-secondary)' }}>
                      <button onClick={() => setInfoPage(p => Math.max(1, p - 1))} disabled={infoPage === 1} style={{ padding: '6px 14px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: infoPage === 1 ? 'transparent' : 'var(--bg-secondary)', color: infoPage === 1 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: infoPage === 1 ? 'not-allowed' : 'pointer' }}>Anterior</button>
                      <span style={{ fontWeight: 500 }}>Página {infoPage} de {Math.ceil(Object.keys(infoData).length / 20)}</span>
                      <button onClick={() => setInfoPage(p => Math.min(Math.ceil(Object.keys(infoData).length / 20), p + 1))} disabled={infoPage >= Math.ceil(Object.keys(infoData).length / 20)} style={{ padding: '6px 14px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: infoPage >= Math.ceil(Object.keys(infoData).length / 20) ? 'transparent' : 'var(--bg-secondary)', color: infoPage >= Math.ceil(Object.keys(infoData).length / 20) ? 'var(--text-muted)' : 'var(--text-primary)', cursor: infoPage >= Math.ceil(Object.keys(infoData).length / 20) ? 'not-allowed' : 'pointer' }}>Próxima</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 4: Séries Sintéticas ──────────────────────────────────────── */}
        {activeTab === 'sintetica' && (
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">🧪 Novo Grupo de Séries Sintéticas</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
                Cada upload cria um <strong>grupo</strong> compartilhando uma única fórmula (ex: <code>S1 * S2</code>).<br />
                Vários grupos podem coexistir com fórmulas distintas.
              </p>

              <input
                value={synthNomeGrupo}
                onChange={e => setSynthNomeGrupo(e.target.value)}
                placeholder="Nome descritivo do grupo (opcional)"
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10, background: 'var(--bg-input, #1e293b)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13 }}
              />

              <div
                onDragOver={e => { e.preventDefault(); setSynthDragging(true) }}
                onDragLeave={() => setSynthDragging(false)}
                onDrop={e => { e.preventDefault(); setSynthDragging(false); setSynthFile(e.dataTransfer.files[0]) }}
                onClick={() => synthInputRef.current?.click()}
                style={{ border: `2px dashed ${synthDragging ? 'var(--amber)' : synthFile ? 'var(--green)' : 'var(--border)'}`, background: synthDragging ? 'var(--amber-glow)' : 'transparent', cursor: 'pointer', textAlign: 'center', padding: '24px 20px', borderRadius: 8, transition: 'all 0.2s', marginBottom: 12 }}
              >
                <input ref={synthInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => setSynthFile(e.target.files[0])} />
                <div style={{ fontSize: 32, marginBottom: 6 }}>🧪</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{synthFile ? synthFile.name : 'Arraste o Excel aqui'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Série Sintética | Série 1 | Série 2 | Série 3</div>
              </div>

              <button className="btn btn-primary btn-full" onClick={handleSynthImport} disabled={!synthFile || synthLoading}>
                {synthLoading ? '⏳ Importando...' : '📥 Criar Grupo'}
              </button>

              {synthError && <div className="alert alert-error fade-in" style={{ marginTop: 12 }}>⚠️ {synthError}</div>}
              {synthResult && (
                <div className="alert alert-success fade-in" style={{ marginTop: 12 }}>
                  ✅ Grupo <strong>"{synthResult.nome}"</strong> criado com <strong>{synthResult.total_series}</strong> séries
                </div>
              )}
            </div>

            {Object.keys(synthData).length > 0 && (
              <div className="card">
                <div className="card-title">⚙️ Grupos Cadastrados ({Object.keys(synthData).length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
                  {Object.entries(synthData).map(([batchId, batch]) => {
                    const edit = batchEdits[batchId] || { formula: '', nome: '' }
                    const totalSeries = batch.series?.length || 0
                    return (
                      <div key={batchId} style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '14px 16px', border: `1px solid ${batch.formula ? 'var(--green, #22c55e)33' : 'var(--amber)44'}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 18 }}>{batch.formula ? '✅' : '⚠️'}</span>
                            <input value={edit.nome} onChange={e => setBatchEdits(p => ({ ...p, [batchId]: { ...p[batchId], nome: e.target.value } }))} style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)', fontWeight: 700, fontSize: 14, padding: '2px 4px', minWidth: 180 }} />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-primary)', borderRadius: 20, padding: '2px 8px' }}>{totalSeries} séries</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(batch.criado_em).toLocaleDateString('pt-BR')}</span>
                            <button onClick={() => handleBatchDelete(batchId, batch.nome)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }} title="Remover grupo">🗑️</button>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Fórmula (S1, S2, S3):</div>
                          <input value={edit.formula} onChange={e => setBatchEdits(p => ({ ...p, [batchId]: { ...p[batchId], formula: e.target.value } }))} placeholder="ex: S1 * S2   ou   (S1 + S2) / 2" style={{ flex: 1, background: 'var(--bg-input, #1e293b)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'monospace' }} />
                          <button className="btn btn-primary" style={{ whiteSpace: 'nowrap', padding: '6px 14px' }} onClick={() => handleBatchSave(batchId)} disabled={batchSaving[batchId]}>
                            {batchSaving[batchId] ? '⏳' : '💾 Salvar'}
                          </button>
                        </div>
                        {totalSeries > 0 && (
                          <details style={{ marginTop: 10 }}>
                            <summary style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>Ver séries ({totalSeries})</summary>
                            <div style={{ marginTop: 6, maxHeight: 160, overflowY: 'auto', fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                              {batch.series.slice(0, 50).map((s, i) => (
                                <div key={i} style={{ padding: '2px 0', borderBottom: '1px solid var(--border)22' }}>
                                  <strong>{s.nome_sintetico}</strong> = {edit.formula || '?'} &nbsp;
                                  <span style={{ color: 'var(--text-muted)' }}>[{s.serie_1}{s.serie_2 ? `, ${s.serie_2}` : ''}{s.serie_3 ? `, ${s.serie_3}` : ''}]</span>
                                </div>
                              ))}
                              {totalSeries > 50 && <div style={{ color: 'var(--text-muted)', padding: '4px 0' }}>...e mais {totalSeries - 50}</div>}
                            </div>
                          </details>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
