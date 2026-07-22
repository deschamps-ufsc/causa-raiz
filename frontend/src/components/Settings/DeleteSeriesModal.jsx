import { useState, useEffect } from 'react'
import { fetchSeries, deleteSeries, fetchMappingData } from '../../services/api'
import { useChartSettings } from '../../hooks/ChartSettingsContext'

export default function DeleteSeriesModal({ usina, datesList, onClose, onSuccess }) {
  const [scope, setScope] = useState('all') // 'all' or 'specific'
  const [selectedDates, setSelectedDates] = useState([]) // array of date strings
  const [seriesList, setSeriesList] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // Selection of series
  const [selectedSeries, setSelectedSeries] = useState({})
  
  // Filters
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all') // all, nativas, processadas
  const [filterElemento, setFilterElemento] = useState('all') // all, NAO_MAPEADA, or specific element
  const [mappingData, setMappingData] = useState({})
  const [showConfirm, setShowConfirm] = useState(false)

  const { elementSettings } = useChartSettings() || {}

  useEffect(() => {
    fetchMappingData(usina.nome || usina).then(data => setMappingData(data || {})).catch(() => {})
  }, [usina])

  const uniqueElements = Array.from(new Set(
    Object.values(mappingData).map(m => m.elemento).filter(e => {
      if (!e || e === 'nan') return false;
      return e.toLowerCase() === 'pvsyst' || elementSettings?.some(es => es.element.toLowerCase() === e.toLowerCase());
    })
  )).sort()

  // Helper to load series
  const loadSeries = async (datesToLoad) => {
    setLoading(true)
    setError(null)
    setSeriesList([])
    setSelectedSeries({})
    try {
      const datesParam = datesToLoad.length > 0 ? datesToLoad.join(',') : 'all'
      const data = await fetchSeries(usina.nome || usina, datesParam)
      // Remove sintéticas, pois elas não ficam no parquet
      const filterSynth = data.filter(s => !s.sintetica)
      setSeriesList(filterSynth)
    } catch (err) {
      setError('Erro ao carregar séries. ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Effect to load series when scope or dates change
  useEffect(() => {
    if (scope === 'all') {
      loadSeries([])
    } else {
      if (selectedDates.length > 0) {
        loadSeries(selectedDates)
      } else {
        setSeriesList([])
      }
    }
  }, [scope, selectedDates])

  const toggleDate = (date) => {
    setSelectedDates(prev => 
      prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]
    )
  }

  const toggleSeries = (col) => {
    setSelectedSeries(prev => ({ ...prev, [col]: !prev[col] }))
  }

  const toggleAllSeries = () => {
    const visible = filteredSeries
    const allSelected = visible.every(s => selectedSeries[s.coluna])
    const newSelection = { ...selectedSeries }
    visible.forEach(s => {
      newSelection[s.coluna] = !allSelected
    })
    setSelectedSeries(newSelection)
  }

  const executeDelete = async () => {
    const seriesToDelete = Object.keys(selectedSeries).filter(k => selectedSeries[k])
    if (seriesToDelete.length === 0) return

    setLoading(true)
    setError(null)
    setShowConfirm(false)
    try {
      const datesParam = scope === 'all' ? ['all'] : selectedDates
      const res = await deleteSeries(usina.nome || usina, seriesToDelete, datesParam)
      if (onSuccess) {
        onSuccess(res.message)
      } else {
        alert(res.message)
        onClose()
      }
    } catch (err) {
      setError(err.message || 'Erro ao excluir séries')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = () => {
    const seriesToDelete = Object.keys(selectedSeries).filter(k => selectedSeries[k])
    if (seriesToDelete.length === 0) return
    setShowConfirm(true)
  }

  // Filter series based on search and type
  const filteredSeries = seriesList.filter(s => {
    if (search && !s.coluna.toLowerCase().includes(search.toLowerCase())) return false
    if (filterType === 'processadas' && !s.processada) return false
    if (filterType === 'nativas' && s.processada) return false
    
    if (filterElemento !== 'all') {
      const mapping = mappingData[s.coluna]
      let el = mapping?.elemento;
      if (el && el !== 'nan') {
        const isRegistered = el.toLowerCase() === 'pvsyst' || elementSettings?.some(es => es.element.toLowerCase() === el.toLowerCase());
        if (!isRegistered) el = 'Outros';
      } else {
        el = mapping ? 'Outros' : 'NAO_MAPEADA';
      }

      if (filterElemento === 'NAO_MAPEADA') {
        if (el !== 'NAO_MAPEADA') return false
      } else if (filterElemento === 'Outros') {
        if (el !== 'Outros') return false
      } else {
        if (el !== filterElemento) return false
      }
    }
    return true
  })

  const selectedCount = Object.values(selectedSeries).filter(Boolean).length

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}>
      <div className="card fade-in" style={{ position: 'relative', width: '90%', maxWidth: 700, background: 'var(--bg-card)', padding: '24px', borderRadius: '12px', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: 'var(--red)' }}>🗑️ Gerenciar Séries Importadas</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 24, lineHeight: 1 }}>&times;</button>
        </div>
        
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, flexShrink: 0 }}>
          Selecione as séries que deseja remover permanentemente dos arquivos de dados (Parquet).
          Séries sintéticas não aparecem aqui pois são calculadas sob demanda.
        </p>

        {/* SCOPE SELECTION */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexShrink: 0 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} style={{ accentColor: 'var(--red)' }}/>
            <span style={{ fontSize: 14, color: scope === 'all' ? 'var(--text-primary)' : 'var(--text-muted)' }}>Todos os Dias</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="radio" checked={scope === 'specific'} onChange={() => setScope('specific')} style={{ accentColor: 'var(--red)' }}/>
            <span style={{ fontSize: 14, color: scope === 'specific' ? 'var(--text-primary)' : 'var(--text-muted)' }}>Dias Específicos</span>
          </label>
        </div>

        {/* DATES SELECTION (IF SPECIFIC) */}
        {scope === 'specific' && (
          <div style={{ marginBottom: 16, flexShrink: 0, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, maxHeight: 120, overflowY: 'auto' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {datesList.map(d => (
                <button 
                  key={d.date} 
                  className={`badge ${selectedDates.includes(d.date) ? 'badge-primary' : 'badge-gray'}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => toggleDate(d.date)}
                >
                  {d.date}
                </button>
              ))}
              {datesList.length === 0 && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhum dia importado.</span>}
            </div>
          </div>
        )}

        {/* FILTERS */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexShrink: 0 }}>
          <input 
            type="text" 
            placeholder="Buscar série..." 
            className="input-field" 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            style={{ flex: 1 }}
          />
          <select className="input-field" value={filterElemento} onChange={e => setFilterElemento(e.target.value)} style={{ width: 180 }}>
            <option value="all">Todos os Elementos</option>
            <option value="NAO_MAPEADA">Séries Não Mapeadas</option>
            <option value="Outros">Outros</option>
            {uniqueElements.map(el => (
              <option key={el} value={el}>{el}</option>
            ))}
          </select>
          <select className="input-field" value={filterType} onChange={e => setFilterType(e.target.value)} style={{ width: 160 }}>
            <option value="all">Todas as Séries</option>
            <option value="nativas">Apenas Nativas</option>
            <option value="processadas">Apenas Processadas</option>
          </select>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 16, flexShrink: 0 }}>⚠️ {error}</div>}

        {/* SERIES LIST */}
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-input)', borderRadius: 8, border: '1px solid var(--border)', minHeight: 200, display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ margin: 'auto', padding: 40, color: 'var(--text-secondary)', fontSize: 14 }}>
              ⏳ Carregando séries...
            </div>
          ) : seriesList.length === 0 ? (
            <div style={{ margin: 'auto', padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>
              Nenhuma série encontrada para a seleção atual.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)', fontWeight: 600, fontSize: 12, color: 'var(--text-muted)' }}>
                <div style={{ flex: 1 }}>Série ({filteredSeries.length})</div>
                <button onClick={toggleAllSeries} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  Selecionar Todos
                </button>
              </div>
              {filteredSeries.map(s => (
                <label 
                  key={s.coluna} 
                  style={{ 
                    display: 'flex', padding: '8px 14px', borderBottom: '1px solid var(--border)33', 
                    cursor: 'pointer', alignItems: 'center', background: selectedSeries[s.coluna] ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                    transition: 'background 0.2s'
                  }}
                >
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                    <input 
                      type="checkbox" 
                      checked={selectedSeries[s.coluna] || false} 
                      onChange={() => toggleSeries(s.coluna)} 
                      style={{ accentColor: 'var(--red)', width: 16, height: 16 }}
                    />
                    <span style={{ color: selectedSeries[s.coluna] ? 'var(--red)' : 'var(--text-primary)' }}>{s.coluna}</span>
                    {s.processada && <span className="badge badge-gray" style={{ fontSize: 10, padding: '2px 6px' }}>Processada</span>}
                  </div>
                </label>
              ))}
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, flexShrink: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {selectedCount > 0 ? <span><strong>{selectedCount}</strong> série(s) selecionada(s) para exclusão</span> : <span>Nenhuma série selecionada</span>}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancelar</button>
            <button className="btn" style={{ background: 'var(--red)', color: '#fff', border: 'none' }} onClick={handleDelete} disabled={selectedCount === 0 || loading}>
              {loading ? '⏳ Excluindo...' : '🗑️ Excluir Selecionadas'}
            </button>
          </div>
        </div>

        {/* CUSTOM CONFIRMATION OVERLAY */}
        {showConfirm && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
            borderRadius: '12px'
          }}>
            <div className="card fade-in" style={{ width: '90%', maxWidth: 400, background: 'var(--bg-card)', padding: '32px 24px', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border)', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 20, color: 'var(--text-primary)' }}>Tem certeza?</h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.5 }}>
                Você está prestes a excluir permanentemente <strong>{selectedCount}</strong> série(s).<br/>Esta ação é irreversível e os dados serão removidos dos arquivos originais.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="btn btn-ghost" onClick={() => setShowConfirm(false)}>Cancelar</button>
                <button className="btn" style={{ background: 'var(--red)', color: '#fff', border: 'none' }} onClick={executeDelete}>
                  Sim, Excluir Definitivamente
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
