import { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useSeries } from '../hooks/useSeries'
import { useSeriesData } from '../hooks/useSeriesData'
import { fetchElementos, fetchUsinas } from '../services/api'
import { useUsina } from '../hooks/UsinaContext'
import SeriesSelector from '../components/SeriesSelector'
import TimeSeriesChart from '../components/TimeSeriesChart'
import DataTable from '../components/DataTable'
import Heatmap from '../components/Heatmap'
import HeatmapYield from '../components/HeatmapYield'
import RankingTab from '../components/RankingTab'
import DiagramTab from '../pages/DiagramPage'
import { SkeletonChart, SkeletonList, ErrorState, EmptyState } from '../components/StateComponents'
import SharedColorPicker from '../components/SharedColorPicker'
import { useAuth } from '../hooks/AuthContext'
import { fetchVisualizations, createVisualization, updateVisualization, deleteVisualization } from '../services/api'
import { SaveVisualizationModal, LoadVisualizationModal } from '../components/VisualizationModals'
import FluxogramaView from '../components/FluxogramaView'

export function formatSeriesName(name) {
  if (!name) return name;
  const nameLower = name.toLowerCase();
  if (nameLower === 'gpoa') return 'Gpoa';
  if (nameLower === 'grear') return 'Grear';
  if (nameLower === 'geff') return 'Geff';
  if (nameLower === 'tamb') return 'Tamb';
  if (nameLower === 'tmod') return 'Tmod';
  if (nameLower === 'tcel') return 'Tcel';
  if (nameLower === 'sujidade') return 'Sujidade';
  if (nameLower === 'energia') return 'Energia';
  return name;
}

const TABS = [
  { id: 'chart',   label: '📈 Gráfico' },
  { id: 'ranking', label: '🏆 Ranking' },
  { id: 'diagram', label: '🕸️ Diagrama' },
  { id: 'desempenho', label: '📊 Desempenho' },
  { id: 'heatmap', label: '🌡️ Análise de Causa Raiz' }
]

export default function DashboardPage() {
  const location = useLocation()
  const initialDate = location.state?.date || ''
  const { usinaAtual, setUsinaAtual } = useUsina()
  const [usinas, setUsinas] = useState([])

  const [selectedDates, setSelectedDates] = useState(initialDate ? [initialDate] : [])
  const [selectedSeries, setSelectedSeries] = useState([])
  const [activeFilters, setActiveFilters] = useState([])
  const [visibleFilters, setVisibleFilters] = useState([])
  const [filterColors, setFilterColors] = useState({})
  const [colorPickerFilter, setColorPickerFilter] = useState(null)
  
  const [activeTab, setActiveTab] = useState('chart')
  const [desempenhoTab, setDesempenhoTab] = useState('config')
  const [elementos, setElementos] = useState([])
  
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isDataOpen, setIsDataOpen] = useState(true)
  const [isFiltersOpen, setIsFiltersOpen] = useState(true)
  const [isSeriesOpen, setIsSeriesOpen] = useState(true)
  const [isSecondaryToolbarOpen, setIsSecondaryToolbarOpen] = useState(true)
  const [showEixosMenu, setShowEixosMenu] = useState(false)
  const [showSeriesMenu, setShowSeriesMenu] = useState(false)
  
  const { user } = useAuth()
  
  // ── ESTADO DAS VISUALIZAÇÕES ──────────────────────────
  const [chartConfig, setChartConfig] = useState({
    gridX: true, gridY1: true, gridY2: false, gridY3: false, gridY4: false,
    xGridSpacing: '',
    xLimits: { min: '', max: '' },
    y1Limits: { min: '', max: '' },
    y2Limits: { min: '', max: '' },
    y3Limits: { min: '', max: '' },
    y4Limits: { min: '', max: '' },
    appliedRanges: { x: undefined, y1: undefined, y2: undefined, y3: undefined, y4: undefined },
    seriesAxisMap: {},
    seriesColors: {},
    seriesWidths: {},
    seriesDashes: {},
    seriesFills: {},
    legendPosition: 'right',
  })

  const [loadedVisualization, setLoadedVisualization] = useState(null)
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false)
  const [savedVisualizations, setSavedVisualizations] = useState([])
  const [pendingLoadVis, setPendingLoadVis] = useState(null)
  const [isVisDropdownOpen, setIsVisDropdownOpen] = useState(false)
  const skipCleanup = useRef(false)
  const pendingVisualize = useRef(false)

  // ── VISUALIZAÇÕES LOGIC ──────────────────────────────────────────
  useEffect(() => {
    fetchUsinas().then(setUsinas).catch(() => {})
  }, [])

  useEffect(() => {
    if (usinaAtual) {
      fetchVisualizations(usinaAtual).then(setSavedVisualizations).catch(() => {})
      setLoadedVisualization(null)
    }
  }, [usinaAtual])

  const handleSaveVisualization = async ({ name, saveAsNew }) => {
    try {
      const payload = {
        name,
        user: user?.email || "Desconhecido",
        selectedDates,
        selectedSeries,
        activeFilters,
        visibleFilters,
        filterColors,
        chartConfig
      }
      
      let saved;
      if (loadedVisualization && !saveAsNew) {
        saved = await updateVisualization(usinaAtual, loadedVisualization.id, payload)
      } else {
        saved = await createVisualization(usinaAtual, payload)
      }
      
      setLoadedVisualization(saved)
      fetchVisualizations(usinaAtual).then(setSavedVisualizations).catch(() => {})
    } catch (err) {
      console.error("Erro ao salvar visualização:", err)
      alert("Erro ao salvar visualização.")
    }
  }

  const handleLoadVisualization = (vis) => {
    skipCleanup.current = true
    setLoadedVisualization(vis)
    setSelectedDates(vis.selectedDates || [])
    setPendingLoadVis(vis)
    setShowEixosMenu(true)
    setShowSeriesMenu(true)
    // A query será disparada pelo useEffect quando filterSeries estiver pronto
  }

  const handleDeleteVisualization = async (visId) => {
    try {
      await deleteVisualization(usinaAtual, visId)
      fetchVisualizations(usinaAtual).then(setSavedVisualizations).catch(() => {})
      if (loadedVisualization?.id === visId) setLoadedVisualization(null)
    } catch (err) {
      console.error("Erro ao excluir visualização:", err)
      alert("Erro ao excluir visualização.")
    }
  }


  const { series, dates, loading: seriesLoading } = useSeries(selectedDates, usinaAtual)
  const { data, loading: dataLoading, error: dataError, query, clear } = useSeriesData()

  // Separa as séries normais dos filtros
  const normalSeries = useMemo(() => series?.filter(s => s.elemento?.toLowerCase() !== 'filtro') || [], [series])
  const filterSeries = useMemo(() => series?.filter(s => s.elemento?.toLowerCase() === 'filtro') || [], [series])

  useEffect(() => {
    if (pendingLoadVis && filterSeries.length > 0) {
      const vis = pendingLoadVis
      setPendingLoadVis(null)

      setSelectedSeries(vis.selectedSeries || [])
      setActiveFilters(vis.activeFilters || [])
      setVisibleFilters(vis.visibleFilters || [])
      setFilterColors(vis.filterColors || {})
      if (vis.chartConfig) setChartConfig(vis.chartConfig)

      const availableFilters = filterSeries.map(s => s.coluna)
      const allQuerySeries = Array.from(new Set([...(vis.selectedSeries || []), ...availableFilters]))
      
      if (vis.selectedDates?.length && allQuerySeries.length && usinaAtual) {
        query({
          usina: usinaAtual,
          dates: vis.selectedDates,
          series: allQuerySeries,
        })
      }
    }
  }, [pendingLoadVis, filterSeries, usinaAtual, query])

  useEffect(() => {
    fetchElementos(usinaAtual)
      .then(els => setElementos(els.filter(e => e.toLowerCase() !== 'filtro')))
      .catch(() => {})
  }, [usinaAtual])

  useEffect(() => {
    if (skipCleanup.current) {
      skipCleanup.current = false
      return
    }
    setSelectedSeries([])
    setActiveFilters([])
    setVisibleFilters([])
    clear()
  }, [selectedDates, usinaAtual])

  // Auto-re-visualiza quando um novo dia é adicionado a uma visualização existente
  useEffect(() => {
    if (pendingVisualize.current && !seriesLoading) {
      pendingVisualize.current = false
      handleVisualize()
    }
  }, [seriesLoading])

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
    if (!selectedDates.length || !allQuerySeries.length || !usinaAtual) return
    query({
      usina: usinaAtual,
      dates: selectedDates,
      series: allQuerySeries,
    })
    setShowEixosMenu(true)
    setShowSeriesMenu(true)
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
      return { ...data, series: cleanSeries, filterData: extractedFilters }
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
    }
  }, [data, activeFilters, filterSeries])

  // Guard: usina não selecionada — mostrar mensagem inline na barra lateral, não bloqueia a página

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
          <div style={{ overflowY: 'auto', flex: 1, padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ flexShrink: 0 }}>
              <div 
                className="card-title"
                style={{ cursor: 'pointer', justifyContent: 'space-between', marginBottom: isDataOpen ? 14 : 0, background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: '8px' }}
                onClick={() => setIsDataOpen(!isDataOpen)}
                title="Clique para expandir/recolher"
              >
                <span>📅 Data {selectedDates.length > 0 && <span className="badge badge-amber" style={{marginLeft: 8}}>{selectedDates.length} selecionados</span>}</span>
                <span style={{ fontSize: '10px' }}>{isDataOpen ? '▼' : '▶'}</span>
              </div>
              {isDataOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto', padding: '0 4px' }}>
                  {dates.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhuma data</span>}
                  {dates.map((d) => (
                    <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, background: 'var(--bg-card)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedDates.includes(d)} 
                        onChange={(e) => {
                          if (e.target.checked && data) {
                            // Adicionar dia a visualização existente: preserva séries e config
                            skipCleanup.current = true
                            pendingVisualize.current = true
                          }
                          setSelectedDates(prev => {
                            if (e.target.checked) return [...prev, d].sort((a,b) => a.localeCompare(b))
                            return prev.filter(x => x !== d)
                          })
                        }}
                      />
                      <span>{d}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* FILTROS DE QUALIDADE */}
            {selectedDates.length > 0 && filterSeries.length > 0 && (
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                <div 
                  className="card-title" 
                  style={{ cursor: 'pointer', justifyContent: 'space-between', marginBottom: isFiltersOpen ? 14 : 0, background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: '8px' }}
                  onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                  title="Clique para expandir/recolher"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🛡️ Filtros</span>
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
                            <span style={{ fontWeight: 600, color: isActive ? '#dc2626' : 'var(--text-secondary)' }}>{formatSeriesName(s.coluna)}</span>
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
            {selectedDates.length > 0 && (
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

        {/* Botões de Ação */}
        {!sidebarCollapsed && (
          <div style={{ padding: 14, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              className="btn btn-primary btn-full"
              onClick={handleVisualize}
              disabled={selectedDates.length === 0 || !selectedSeries.length || dataLoading}
              style={{ justifyContent: 'center', gap: 8 }}
            >
              {dataLoading ? '⏳ Carregando...' : `📊 Visualizar (${selectedSeries.length} séries)`}
            </button>
          </div>
        )}
      </div>

      {/* ── ÁREA PRINCIPAL ──────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-primary)' }}>
        {/* Barra superior: Abas + info + sub-barra de visualizações */}
        <div style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-card)', flexShrink: 0,
        }}>
          {/* Linha 1: abas + seletor de usina */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div className="tabs" style={{ flex: '0 0 auto' }}>
                {TABS.map((tab) => (
                  <button key={tab.id} className={`tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Toggle Secondary Toolbar */}
              {(activeTab === 'chart' || activeTab === 'table') && (
                <button 
                  onClick={() => setIsSecondaryToolbarOpen(!isSecondaryToolbarOpen)}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '4px', borderRadius: '50%',
                    transform: isSecondaryToolbarOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                    transition: 'transform 0.2s',
                  }}
                  title={isSecondaryToolbarOpen ? "Ocultar Controles" : "Mostrar Controles"}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {filteredData && (
                <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span className="badge badge-amber">
                    {filteredData.dates?.split(',').length} {filteredData.dates?.split(',').length === 1 ? 'dia' : 'dias'}
                  </span>
                  <span className="badge badge-blue">{Object.keys(filteredData.series).length} séries</span>
                  <span className="badge badge-gray">{filteredData.total_pontos.toLocaleString('pt-BR')} pts</span>
                </div>
              )}
              {/* Seletor de usina */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-secondary)', padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>🏭 Usina:</span>
                <select
                  value={usinaAtual || ''}
                  onChange={e => setUsinaAtual(e.target.value)}
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--text-primary)',
                    fontSize: 13, fontWeight: 600, outline: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', maxWidth: 180,
                  }}
                >
                  <option value="">-- Selecionar --</option>
                  {usinas.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Linha 2: botões de Carregar/Salvar — só nas abas Gráfico e Tabela */}
          {(activeTab === 'chart' || activeTab === 'table') && isSecondaryToolbarOpen && (
            <div style={{ padding: '0 20px 12px', display: 'flex', gap: '12px' }}>
              <div style={{ position: 'relative' }}>
                <button
                  className="btn btn-sm"
                  style={{ 
                    background: 'var(--bg-card)', border: '1px solid var(--border)', 
                    padding: '6px 12px', fontSize: 13, display: 'flex', alignItems: 'center', 
                    gap: 8, color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer' 
                  }}
                  onClick={() => setIsVisDropdownOpen(!isVisDropdownOpen)}
                  title="Gerenciar Visualizações"
                >
                  📄 {loadedVisualization ? loadedVisualization.name : 'Nova Visualização'} <span style={{ fontSize: 10 }}>▼</span>
                </button>

                {isVisDropdownOpen && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setIsVisDropdownOpen(false)} />
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50,
                      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)', padding: 6, minWidth: 200,
                    display: 'flex', flexDirection: 'column', gap: 2
                  }}>
                    <button 
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, borderRadius: 4, color: 'var(--text-primary)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      onClick={() => { setIsSaveModalOpen(true); setIsVisDropdownOpen(false); }}
                    >
                      💾 Salvar alterações
                    </button>
                    <button 
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, borderRadius: 4, color: 'var(--text-primary)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      onClick={() => { setIsLoadModalOpen(true); setIsVisDropdownOpen(false); }}
                    >
                      📁 Abrir visualização
                    </button>
                    <button 
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, borderRadius: 4, color: 'var(--text-primary)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      onClick={() => { 
                        setLoadedVisualization(null);
                        setSelectedSeries([]);
                        setActiveFilters([]);
                        setVisibleFilters([]);
                        clear();
                        setIsVisDropdownOpen(false); 
                      }}
                    >
                      ➕ Nova visualização
                    </button>
                  </div>
                </>
              )}
              </div>

              {activeTab === 'chart' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className={`btn btn-sm ${showEixosMenu ? 'btn-active' : ''}`}
                    style={{
                      background: showEixosMenu ? 'var(--bg-secondary)' : 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      padding: '6px 12px', fontSize: 13, display: 'flex', alignItems: 'center',
                      gap: 8, color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer',
                      boxShadow: showEixosMenu ? 'inset 0 2px 4px rgba(0,0,0,0.05)' : 'none'
                    }}
                    onClick={() => setShowEixosMenu(!showEixosMenu)}
                  >
                    <span style={{ fontSize: 14 }}>{showEixosMenu ? '🛠️' : '🔧'}</span> Eixos
                  </button>
                  <button
                    className={`btn btn-sm ${showSeriesMenu ? 'btn-active' : ''}`}
                    style={{
                      background: showSeriesMenu ? 'var(--bg-secondary)' : 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      padding: '6px 12px', fontSize: 13, display: 'flex', alignItems: 'center',
                      gap: 8, color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer',
                      boxShadow: showSeriesMenu ? 'inset 0 2px 4px rgba(0,0,0,0.05)' : 'none'
                    }}
                    onClick={() => setShowSeriesMenu(!showSeriesMenu)}
                  >
                    <span style={{ fontSize: 14 }}>{showSeriesMenu ? '📊' : '📈'}</span> Séries
                  </button>

                  {/* Bloco Legenda */}
                  <div style={{
                    backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: '6px', padding: '6px 12px', marginLeft: 'auto',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Legenda</span>
                    <div style={{ 
                      width: 26, height: 26, 
                      border: '1.5px solid #475569', borderRadius: 6, 
                      overflow: 'hidden', background: '#ffffff',
                      display: 'flex', flexDirection: 'column',
                      flexShrink: 0
                    }}>
                      <div 
                        onClick={() => setChartConfig(p => ({...p, legendPosition: (p.legendPosition || 'right') === 'top' ? 'none' : 'top'}))}
                        title="Horizontal Acima"
                        style={{ 
                          height: '28%', background: (chartConfig.legendPosition || 'right') === 'top' ? '#3b82f6' : '#e2e8f0', 
                          cursor: 'pointer', transition: 'background 0.2s'
                        }} 
                      />
                      
                      <div style={{ display: 'flex', flex: 1, borderTop: '1.5px solid #475569', borderBottom: '1.5px solid #475569' }}>
                        <div 
                          onClick={() => setChartConfig(p => ({...p, legendPosition: (p.legendPosition || 'right') === 'left' ? 'none' : 'left'}))}
                          title="Vertical Esquerda"
                          style={{ 
                            flex: 1, background: (chartConfig.legendPosition || 'right') === 'left' ? '#3b82f6' : '#e2e8f0', 
                            cursor: 'pointer', borderRight: '1.5px solid #475569', transition: 'background 0.2s'
                          }} 
                        />
                        <div 
                          onClick={() => setChartConfig(p => ({...p, legendPosition: (p.legendPosition || 'right') === 'right' ? 'none' : 'right'}))}
                          title="Vertical Direita"
                          style={{ 
                            flex: 1, background: (chartConfig.legendPosition || 'right') === 'right' ? '#3b82f6' : '#e2e8f0', 
                            cursor: 'pointer', transition: 'background 0.2s'
                          }} 
                        />
                      </div>

                      <div 
                        onClick={() => setChartConfig(p => ({...p, legendPosition: (p.legendPosition || 'right') === 'bottom' ? 'none' : 'bottom'}))}
                        title="Horizontal Abaixo"
                        style={{ 
                          height: '28%', background: (chartConfig.legendPosition || 'right') === 'bottom' ? '#3b82f6' : '#e2e8f0', 
                          cursor: 'pointer', transition: 'background 0.2s'
                        }} 
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Conteúdo das abas */}
        {activeTab === 'diagram' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 20 }}>
            {/* Cabeçalho Fixo do Diagrama */}
            <div style={{ 
              paddingBottom: '12px', 
              borderBottom: '1px solid var(--border)', 
              marginBottom: '0px',
              flexShrink: 0
            }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🕸️ Diagrama
              </h2>
            </div>
            {/* Bloco de conteúdo rolável do Diagrama */}
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
              <DiagramTab />
            </div>
          </div>
        ) : activeTab === 'desempenho' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 20 }}>
            {/* Cabeçalho Fixo do Desempenho */}
            <div style={{ display: 'flex', gap: 2, marginBottom: 16, borderBottom: '2px solid #e2e8f0', flexShrink: 0 }}>
              {[
                { id: 'config', icon: '⚙️', label: 'Configurações' },
                { id: 'validacao', icon: '✅', label: 'Validação de Dados' },
                { id: 'epi', icon: '📈', label: 'EPI' },
              ].map(tab => {
                const isActive = desempenhoTab === tab.id
                return (
                  <button key={tab.id} onClick={() => setDesempenhoTab(tab.id)}
                    style={{ padding: '7px 18px', fontSize: 13, fontWeight: 600,
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: isActive ? '#0f172a' : '#94a3b8',
                      borderBottom: isActive ? '2px solid #0f172a' : '2px solid transparent',
                      marginBottom: -2, transition: 'color 0.15s', display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </div>
            {/* Bloco de conteúdo */}
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>

              {/* Configurações e Validação: FluxogramaView com mode controla o que exibir */}
              {(desempenhoTab === 'config' || desempenhoTab === 'validacao') && (
                <FluxogramaView elementos={elementos} showTitle={false} mode={desempenhoTab} />
              )}

              {desempenhoTab === 'epi' && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  Aba EPI - Em construção
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
            {/* Heatmap Yield — independente de séries selecionadas */}
            {activeTab === 'heatmap' && (
              <HeatmapYield usina={usinaAtual} dates={selectedDates.join(',')} activeFilters={activeFilters} />
            )}

            {/* Ranking — independente de séries selecionadas */}
            {activeTab === 'ranking' && (
              <RankingTab usina={usinaAtual} dates={selectedDates.join(',')} activeFilters={activeFilters} />
            )}

            {/* Chart — dependem de dados carregados */}
            {activeTab === 'chart' && (
              <>
                {dataLoading && <SkeletonChart />}
                {dataError && !dataLoading && <ErrorState message={dataError} onRetry={handleVisualize} />}

                {!dataLoading && !dataError && !filteredData && (
                  <EmptyState
                    icon="☀️"
                    title="Selecione séries e clique em Visualizar"
                    subtitle="Escolha uma data, selecione as séries no painel esquerdo e clique no botão"
                    action={
                      <button 
                        className="btn btn-secondary" 
                        onClick={() => setIsLoadModalOpen(true)}
                        style={{ gap: 8 }}
                      >
                        📂 Carregar Visualização Salva
                      </button>
                    }
                  />
                )}

                {!dataLoading && !dataError && filteredData && (
                  <div className="fade-in" style={{ height: '100%' }}>
                    <TimeSeriesChart data={filteredData} usina={usinaAtual} seriesDict={seriesDict} filterColors={filterColors} chartConfig={chartConfig} setChartConfig={setChartConfig} showEixosMenu={showEixosMenu} showSeriesMenu={showSeriesMenu} visibleFilters={visibleFilters} />
                  </div>
                )}
              </>
            )}
          </div>
        )}
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

      <SaveVisualizationModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        onSave={handleSaveVisualization}
        hasLoadedVis={!!loadedVisualization}
        currentName={loadedVisualization?.name}
        existingNames={savedVisualizations.map(v => v.name)}
      />
      
      <LoadVisualizationModal
        isOpen={isLoadModalOpen}
        onClose={() => setIsLoadModalOpen(false)}
        onLoad={handleLoadVisualization}
        onDelete={handleDeleteVisualization}
        visualizations={savedVisualizations}
      />
    </div>
  )
}
