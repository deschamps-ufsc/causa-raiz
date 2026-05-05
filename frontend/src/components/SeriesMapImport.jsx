import { useState, useRef, useEffect } from 'react'
import { importMappingExcel, getMappingTemplateUrl, fetchMappingSummary } from '../services/api'
import { ErrorState } from './StateComponents'

/**
 * Componente completo de importação do Excel DE-PARA.
 * Inclui: drag-drop, preview de estatísticas, download de template.
 */
export default function SeriesMapImport({ onImported, usina }) {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  const handleFile = (f) => {
    if (!f) return
    setFile(f)
    setResult(null)
    setError(null)
  }

  useEffect(() => {
    if (!usina) return
    
    let isMounted = true
    const loadSummary = async () => {
      try {
        const res = await fetchMappingSummary(usina)
        if (isMounted && res.total_mapeamentos > 0) {
          setResult(res)
        }
      } catch (e) {
        console.error("Erro ao carregar resumo do mapeamento:", e)
      }
    }
    loadSummary()

    return () => { isMounted = false }
  }, [usina])

  const handleImport = async () => {
    if (!file || !usina) return
    setLoading(true)
    setError(null)
    try {
      const res = await importMappingExcel(usina, file)
      setResult(res)
      onImported?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const templateUrl = getMappingTemplateUrl(usina)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Zona de drop */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--amber)' : 'var(--border)'}`,
          borderRadius: 'var(--r-lg)', padding: '30px 20px', textAlign: 'center',
          cursor: 'pointer', transition: 'all 0.2s',
          background: dragging ? 'var(--amber-glow)' : 'transparent',
        }}
      >
        <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files[0])} />
        <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          {file ? file.name : 'Arraste o Excel DE-PARA aqui'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          Colunas: coluna_excel | elemento | skid | estacao | inversor | stringbox
        </div>
      </div>

      {/* Ações */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleImport} disabled={!file || loading}>
          {loading ? '⏳ Importando...' : '📥 Importar DE-PARA'}
        </button>
        <a className="btn btn-secondary" href={templateUrl} download>
          📄 Template
        </a>
      </div>

      {error && <ErrorState message={error} />}

      {/* Resultado da importação */}
      {result && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="alert alert-success">
            ✅ <strong>{result.total_mapeamentos.toLocaleString('pt-BR')}</strong> séries mapeadas com sucesso!
            {result.linhas_invalidas > 0 && <span style={{ marginLeft: 8, opacity: 0.8 }}> ({result.linhas_invalidas} linhas inválidas ignoradas)</span>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="stat-card" style={{ height: '100%' }}>
              <div className="stat-label">Elementos</div>
              <div className="stat-value" style={{ fontSize: 20 }}>{result.elementos_encontrados?.length || 0}</div>
              <div className="stat-sub" style={{ whiteSpace: 'normal', lineHeight: 1.4, marginTop: 4 }}>
                {result.elementos_encontrados?.map((el, i) => {
                  const isMissing = result.elementos_nao_cadastrados?.includes(el)
                  return (
                    <span key={el}>
                      {isMissing ? (
                        <span style={{ color: '#dc2626', fontWeight: 600 }}>
                          {el} <span style={{ fontSize: 10 }}>(Não cadastrado)</span>
                        </span>
                      ) : el}
                      {i < result.elementos_encontrados.length - 1 ? ', ' : ''}
                    </span>
                  )
                })}
              </div>
            </div>
            <div className="stat-card" style={{ height: '100%' }}>
              <div className="stat-label">SKIDs</div>
              <div className="stat-value" style={{ fontSize: 20 }}>{result.skids_encontrados?.length || 0}</div>
              <div className="stat-sub" style={{ whiteSpace: 'normal', lineHeight: 1.4, marginTop: 4 }}>
                {result.skids_encontrados?.join(', ')}
              </div>
            </div>
            {(result.estacoes_encontradas?.length > 0) && (
              <div className="stat-card" style={{ height: '100%' }}>
                <div className="stat-label">Estações</div>
                <div className="stat-value" style={{ fontSize: 20 }}>{result.estacoes_encontradas.length}</div>
                <div className="stat-sub" style={{ whiteSpace: 'normal', lineHeight: 1.4, marginTop: 4 }}>
                  {result.estacoes_encontradas.join(', ')}
                </div>
              </div>
            )}
            {(result.inversores_encontrados?.length > 0) && (
              <div className="stat-card" style={{ height: '100%' }}>
                <div className="stat-label">Inversores</div>
                <div className="stat-value" style={{ fontSize: 20 }}>{result.inversores_encontrados.length}</div>
                <div className="stat-sub" style={{ whiteSpace: 'normal', lineHeight: 1.4, marginTop: 4 }}>
                  {result.inversores_encontrados.join(', ')}
                </div>
              </div>
            )}
            {(result.stringboxes_encontrados?.length > 0) && (
              <div className="stat-card" style={{ height: '100%' }}>
                <div className="stat-label">Stringboxes</div>
                <div className="stat-value" style={{ fontSize: 20 }}>{result.stringboxes_encontrados.length}</div>
                <div className="stat-sub" style={{ whiteSpace: 'normal', lineHeight: 1.4, marginTop: 4 }}>
                  {result.stringboxes_encontrados.join(', ')}
                </div>
              </div>
            )}
            {(result.strings_encontradas?.length > 0) && (
              <div className="stat-card" style={{ height: '100%' }}>
                <div className="stat-label">STRINGS</div>
                <div className="stat-value" style={{ fontSize: 20 }}>{result.strings_encontradas.length}</div>
                <div className="stat-sub" style={{ whiteSpace: 'normal', lineHeight: 1.4, marginTop: 4 }}>
                  {result.strings_encontradas.join(', ')}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
