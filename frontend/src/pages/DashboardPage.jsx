import { useState, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useSeries } from '../hooks/useSeries'
import { useSeriesData } from '../hooks/useSeriesData'
import { fetchElementos } from '../services/api'
import { useUsina } from '../hooks/UsinaContext'
import SeriesSelector from '../components/SeriesSelector'
import TimeRangeFilter from '../components/TimeRangeFilter'
import TimeSeriesChart from '../components/TimeSeriesChart'
import DataTable from '../components/DataTable'
import Heatmap from '../components/Heatmap'
import HeatmapYield from '../components/HeatmapYield'
import RankingTab from '../components/RankingTab'
import DiagramTab from '../pages/DiagramPage'
import { SkeletonChart, SkeletonList, ErrorState, EmptyState } from '../components/StateComponents'
import SharedColorPicker from '../components/SharedColorPicker'

const TABS = [
  { id: 'chart',   label: '📈 Gráfico' },
  { id: 'table',   label: '📋 Tabela' },
  { id: 'heatmap', label: '🌡️ Mapa de Calor' },
  { id: 'ranking', label: '🏆 Ranking' },
  { id: 'diagram', label: '🕸️ Diagrama' }
]

export default function DashboardPage() {
  const location = useLocation()
  const initialDate = location.state?.date || ''
  const { usinaAtual } = useUsina()

  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [selectedSeries, setSelectedSeries] = useState([])
  const [activeFilters, setActiveFilters] = useState([])
  const [visibleFilters, setVisibleFilters] = useState([])
  const [filterColors, setFilterColors] = useState({})
  const [colorPickerFilter, setColorPickerFilter] = useState(null)
  
  const [timeRange, setTimeRange] = useState({ start: '00:00', end: '23:59' })
  const [activeTab, setActiveTab] = useState('chart')
  const [elementos, setElementos] = useState([])
  
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isDataOpen, setIsDataOpen] = useState(true)
  const [isFiltersOpen, setIsFiltersOpen] = useState(true)
  const [isSeriesOpen, setIsSeriesOpen] = useState(true)

  const { series, dates, loading: seriesLoading } = useSeries(selectedDate, usinaAtual)
  const { data, loading: dataLoading, error: dataError, query, clear } = useSeriesData()

  // Separa as séries normais dos filtros
  const normalSeries = useMemo(() => series?.filter(s => s.elemento?.toLowerCase() !== 'filtro') || [], [series])
  const filterSeries = useMemo(() => series?.filter(s => s.elemento?.toLowerCase() === 'filtro') || [], [series])

  useEffect(() => {
    fetchElementos(usinaAtual)
      .then(els => setElementos(els.filter(e => e.toLowerCase() !== 'filtro')))
      .catch(() => {})
  }, [usinaAtual])

  useEffect(() => {
    setSelectedSeries([])
    setActiveFilters([])
    setVisibleFilters([])
    clear()
  }, [selectedDate, usinaAtual])

  // Define cores iniciais sincronizadas para os filtros
  useEffect(() => {
    if (!filterSeries || filterSeries.length === 0) return
    const defaultPalette = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6']
    
    setFilterColors(prev => {
      let changed = false
      const newColors = { ...prev }
      filterSeries.forEach((s, idx) => {
        if (!newColors[s.coluna]) {
          newColors[s.coluna] = defaultPalette[idx % defaultPalette.length]
          changed = true
        }
      })
      return changed ? newColors : prev
    })
  }, [filterSeries])

  const handleVisualize = () => {
    // Busca sempre todas as séries de filtro disponíveis junto com as normais selecionadas
    const availableFilters = filterSeries.map(s => s.coluna)
    const allQuerySeries = Array.from(new Set([...selectedSeries, ...availableFilters]))
    if (!selectedDate || !allQuerySeries.length || !usinaAtual) return
    query({
      usina: usinaAtual,
      date: selectedDate,
      series: allQuerySeries,
      start: timeRange.start !== '00:00' ? timeRange.start : undefined,
      end: timeRange.end !== '23:59' ? timeRange.end : undefined,
    })
  }

  const seriesDict = useMemo(() => {
    const d = {}
    if (series) {
      series.forEach(s => { d[s.coluna] = s })
    }
    return d
  }, [series])

  const filteredData = useMemo(() => {
    if (!data || !data.series) return null
    
    // Identifica quais filtros ativados efetivamente voltaram do backend
    const activeDataFilters = activeFilters.filter(f => data.series[f])
    
    // Extrai os filtros para um objeto separado para não poluir os blocos dos eixos Y principais
    const extractedFilters = {}
    
    if (activeDataFilters.length === 0) {
      const cleanSeries = {}
      Object.entries(data.series).forEach(([k, vals]) => {
         if (filterSeries.find(fs => fs.coluna === k)) extractedFilters[k] = vals
         else cleanSeries[k] = vals
      })
      return { ...data, series: cleanSeries, filterData: extractedFilters, visibleFilters }
    }

    // Cria a mascara multiplicativa baseada em todos os filtros ativos
    const length = data.series[Object.keys(data.series)[0]].length
    const combinedMask = new Array(length).fill(1)
    
    activeDataFilters.forEach(f => {
      const fVals = data.series[f]
      for (let i = 0; i < length; i++) {
         const v = fVals[i]
         // Tolera dados binarios sendo expressos como 1, 1.0, "1", "1.0", ou booleanos.
         if (v !== 1 && v !== 1.0 && v !== "1" && v !== "1.0" && v !== true) {
            combinedMask[i] = 0
         }
      }
    })

    let validCount = 0
    for (let i = 0; i < length; i++) { if (combinedMask[i] === 1) validCount++ }

    // Aplica a mascara nas series normais (ignora mascarar os poprios filtros e os move para filterData)
    const newSeries = {}
    Object.entries(data.series).forEach(([k, vals]) => {
      if (filterSeries.find(fs => fs.coluna === k)) {
         extractedFilters[k] = vals
      } else {
         newSeries[k] = vals.map((v, i) => combinedMask[i] === 1 ? v : null)
      }
    })

    return {
      ...data,
      series: newSeries,
      filterData: extractedFilters,
      total_pontos: validCount,
      visibleFilters // Injecao para repasse ao Grafico
    }
  }, [data, activeFilters, visibleFilters, filterSeries])

  const totalPoints = (() => {
    if (!timeRange.start || !timeRange.end) return 1440
    const [sh, sm] = timeRange.start.split(':').map(Number)
    const [eh, em] = timeRange.end.split(':').map(Number)
    return Math.max(0, (eh * 60 + em) - (sh * 60 + sm) + 1)
  })()

  // Guard: usina não selecionada
  if (!usinaAtual) {
    return (
      <div style={{
        flex: 1,
        background: 'var(--bg-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16, padding: '40px 20px',
        color: 'var(--text-secondary)', textAlign: 'center',
      }}>
        <span style={{ fontSize: 56 }}>🏭</span>
        <strong style={{ fontSize: 20, color: 'var(--text-primary)' }}>Nenhuma usina selecionada</strong>
        <p style={{ fontSize: 14 }}>Selecione ou crie uma usina no menu superior para continuar.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>
      {/* ── SIDEBAR ────────────────────────────────────────────── */}
      <div style={{
        width: sidebarCollapsed ? 48 : 300,
        flexShrink: 0, background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.25s ease', overflow: 'hidden',
      }}>
        {/* Toggle collapse */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'space-between',
          padding: '12px 14px', borderBottom: '1px solid var(--border)',
        }}>
          {!sidebarCollapsed && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Controles</span>}
          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            {sidebarCollapsed ? '→' : '←'}
          </button>
        </div>

        {!sidebarCollapsed && (
          <div style={{ overflow: 'hidden', flex: 1, padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ flexShrink: 0 }}>
              <div 
                className="card-title"
                style={{ cursor: 'pointer', justifyContent: 'space-between', marginBottom: isDataOpen ? 14 : 0, background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: '8px' }}
                onClick={() => setIsDataOpen(!isDataOpen)}
                title="Clique para expandir/recolher"
              >
                <span>📅 Data</span>
                <span style={{ fontSize: '10px' }}>{isDataOpen ? '▼' : '▶'}</span>
              </div>
              {isDataOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <select className="input" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}>
                    <option value="">-- Selecione uma data --</option>
                    {dates.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  {selectedDate && (
                    <TimeRangeFilter
                      start={timeRange.start}
                      end={timeRange.end}
                      onChange={setTimeRange}
                      totalPoints={totalPoints}
                    />
                  )}
                </div>
              )}
            </div>

            {/* FILTROS DE QUALIDADE */}
            {selectedDate && filterSeries.length > 0 && (
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                <div 
                  className="card-title" 
                  style={{ cursor: 'pointer', justifyContent: 'space-between', marginBottom: isFiltersOpen ? 14 : 0, background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: '8px' }}
                  onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                  title="Clique para expandir/recolher"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🛡️ Filtros de Qualidade</span>
                  </div>
                  <span style={{ fontSize: '10px' }}>{isFiltersOpen ? '▼' : '▶'}</span>
                </div>
                
                {isFiltersOpen && (
                  <div style={{ padding: '0 4px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '150px' }}>
                    {filterSeries.map((s, idx) => {
                      const isActive = activeFilters.includes(s.coluna)
                      const isVisible = visibleFilters.includes(s.coluna)
                      
                      return (
                        <div key={idx} style={{ 
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                          padding: '6px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: 13
                        }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', WebkitUserSelect: 'none', userSelect: 'none' }}>
                            <input 
                              type="checkbox" 
                              checked={isActive} 
                              onChange={(e) => setActiveFilters(prev => e.target.checked ? [...prev, s.coluna] : prev.filter(c => c !== s.coluna))}
                              style={{ accentColor: '#dc2626' }}
                            />
                            <span style={{ fontWeight: 600, color: isActive ? '#dc2626' : 'var(--text-secondary)' }}>{s.coluna}</span>
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ position: 'relative' }}>
                              <div
                                style={{
                                  width: 14, height: 14, borderRadius: '50%', cursor: 'pointer',
                                  background: filterColors[s.coluna],
                                  border: '1px solid rgba(0,0,0,0.2)'
                                }}
                                title="Alterar a cor do filtro"
                                onClick={(e) => {
                                  if (colorPickerFilter?.name === s.coluna) {
                                    setColorPickerFilter(null)
                                  } else {
                                    const rect = e.currentTarget.getBoundingClientRect()
                                    setColorPickerFilter({ name: s.coluna, top: rect.bottom, left: rect.left + rect.width / 2 })
                                  }
                                }}
                              />
                            </div>

                            <div 
                              style={{ 
                                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                cursor: 'pointer', WebkitUserSelect: 'none', userSelect: 'none',
                                opacity: isVisible ? 1 : 0.3, transition: 'opacity 0.2s', padding: '0 4px'
                              }} 
                              title="Exibir no Gráfico"
                              onClick={() => setVisibleFilters(prev => isVisible ? prev.filter(c => c !== s.coluna) : [...prev, s.coluna])}
                            >
                              <span style={{ fontSize: 16 }}>👁️</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Seleção de Séries */}
            {selectedDate && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div 
                  className="card-title" 
                  style={{ cursor: 'pointer', justifyContent: 'space-between', marginBottom: isSeriesOpen ? 14 : 0, background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: '8px', flexShrink: 0 }}
                  onClick={() => setIsSeriesOpen(!isSeriesOpen)}
                  title="Clique para expandir/recolher"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>📡 Séries</span>
                    {seriesLoading && <span style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'lowercase' }}>carregando...</span>}
                    {!seriesLoading && normalSeries.length > 0 && (
                      <span className="badge badge-amber">{normalSeries.length.toLocaleString('pt-BR')} total</span>
                    )}
                  </div>
                  <span style={{ fontSize: '10px' }}>{isSeriesOpen ? '▼' : '▶'}</span>
                </div>
                
                {isSeriesOpen && (
                  seriesLoading ? <SkeletonList rows={5} /> : (
                    <SeriesSelector
                      series={normalSeries}
                      selected={selectedSeries}
                      onChange={setSelectedSeries}
                      elementos={elementos}
                    />
                  )
                )}
              </div>
            )}
          </div>
        )}

        {/* Botão Visualizar */}
        {!sidebarCollapsed && (
          <div style={{ padding: 14, borderTop: '1px solid var(--border)' }}>
            <button
              className="btn btn-primary btn-full"
              onClick={handleVisualize}
              disabled={!selectedDate || !selectedSeries.length || dataLoading}
            >
              {dataLoading ? '⏳ Carregando...' : `📊 Visualizar (${selectedSeries.length} séries)`}
            </button>
          </div>
        )}
      </div>

      {/* ── ÁREA PRINCIPAL ──────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-primary)' }}>
        {/* Barra superior: Abas + info */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-card)', flexShrink: 0,
        }}>
          <div className="tabs" style={{ flex: '0 0 auto' }}>
            {TABS.map((tab) => (
              <button key={tab.id} className={`tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* O Toggle de Flag global foi removido a pedido. Substituido pelo painel Filtros de Qualidade local */}

          {filteredData && (
            <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
              <span className="badge badge-amber">{filteredData.date}</span>
              <span className="badge badge-blue">{Object.keys(filteredData.series).length} séries</span>
              <span className="badge badge-gray">{filteredData.total_pontos.toLocaleString('pt-BR')} pts</span>
            </div>
          )}
        </div>

        {/* Conteúdo das abas */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {/* Heatmap Yield — independente de séries selecionadas */}
          {activeTab === 'heatmap' && (
            <HeatmapYield usina={usinaAtual} date={selectedDate || ''} activeFilters={activeFilters} />
          )}

          {/* Ranking — independente de séries selecionadas */}
          {activeTab === 'ranking' && (
            <RankingTab usina={usinaAtual} date={selectedDate || ''} activeFilters={activeFilters} />
          )}

          {/* Diagrama da Usina — independente de data e séries */}
          {activeTab === 'diagram' && (
            <DiagramTab />
          )}

          {/* Chart e Table — dependem de dados carregados */}
          {activeTab !== 'heatmap' && activeTab !== 'ranking' && activeTab !== 'diagram' && (
            <>
              {dataLoading && <SkeletonChart />}
              {dataError && !dataLoading && <ErrorState message={dataError} onRetry={handleVisualize} />}

              {!dataLoading && !dataError && !filteredData && (
                <EmptyState
                  icon="☀️"
                  title="Selecione séries e clique em Visualizar"
                  subtitle="Escolha uma data, selecione as séries no painel esquerdo e clique no botão"
                />
              )}

              {!dataLoading && !dataError && filteredData && (
                <div className="fade-in" style={{ height: '100%' }}>
                  {activeTab === 'chart' && <TimeSeriesChart data={filteredData} usina={usinaAtual} seriesDict={seriesDict} filterColors={filterColors} />}
                  {activeTab === 'table' && <DataTable data={filteredData} seriesDict={seriesDict} />}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {colorPickerFilter && (
        <div style={{
          position: 'fixed',
          top: colorPickerFilter.top,
          left: colorPickerFilter.left,
          width: 0, height: 0,
          zIndex: 99999
        }}>
          <SharedColorPicker
            color={filterColors[colorPickerFilter.name] || '#dc2626'}
            onChange={c => setFilterColors(prev => ({ ...prev, [colorPickerFilter.name]: c }))}
            onClose={() => setColorPickerFilter(null)}
          />
        </div>
      )}
    </div>
  )
}
