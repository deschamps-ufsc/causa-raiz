import { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useSeries } from '../hooks/useSeries'
import { useSeriesData } from '../hooks/useSeriesData'
import { fetchElementos, fetchUsinas } from '../services/api'
import { useUsina } from '../hooks/UsinaContext'
import { useChartSettings } from '../hooks/ChartSettingsContext'
import SeriesSelector from '../components/SeriesSelector'
import TimeSeriesChart from '../components/TimeSeriesChart'
import AnaliseIncertezasView from '../components/AnaliseIncertezasView'
import DataTable from '../components/DataTable'
import Heatmap from '../components/Heatmap'
import HeatmapYield from '../components/HeatmapYield'
import RankingTab from '../components/RankingTab'
import TrackerAnalysis from '../components/TrackerAnalysis'
import { SkeletonChart, SkeletonList, ErrorState, EmptyState } from '../components/StateComponents'
import SharedColorPicker from '../components/SharedColorPicker'
import { useAuth } from '../hooks/AuthContext'
import { fetchVisualizations, createVisualization, updateVisualization, deleteVisualization, fetchCampanhas, saveCampanha, deleteCampanha } from '../services/api'
import { SaveVisualizationModal, LoadVisualizationModal } from '../components/VisualizationModals'
import FluxogramaView from '../components/FluxogramaView'
import MapaView from '../components/MapaView'
import { exportTableToPdf, exportTableToPng } from '../utils/exportPdf'

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
  if (nameLower === 'potencia_ppc') return 'Potência PPC';
  if (nameLower === 'referencia_ppc') return 'Referência PPC';
  if (nameLower === 'simultaneidade') return 'Simultaneidade';
  if (nameLower === 'curtailment') return 'Curtailment';
  return name;
}

const TrackerSVGIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: 2, marginTop: -2, verticalAlign: 'middle' }}>
    <path d="M12 16V22M8 22H16" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <polygon points="3 14 15 5 22 9 10 18" fill="#3b82f6" stroke="#1e40af" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M9 9.5L16 13.5" stroke="#93c5fd" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M7 11L13 6.5" stroke="#93c5fd" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M11 16L17 11.5" stroke="#93c5fd" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M3.5 6.5C4.5 3.5 7.5 2 11 2" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round"/>
    <path d="M7.5 2H11V5.5" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const RootCauseSVGIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle', marginTop: -2 }}>
    {/* Tronco */}
    <path d="M9 21V5" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"/>
    <circle cx="9" cy="4" r="2.5" fill="#60a5fa" />
    
    {/* Galhos diagonais */}
    <path d="M9 9L4 12" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/>
    <path d="M9 15L4 18" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/>
    <path d="M9 9L14 12" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/>
    
    {/* Caixas */}
    <rect x="0" y="10" width="5" height="5" fill="#34d399" rx="1" />
    <rect x="0" y="16" width="5" height="5" fill="#f87171" rx="1" />
    <rect x="13" y="10" width="5" height="5" fill="#fbbf24" rx="1" />
    
    {/* Lupa grande */}
    <circle cx="16" cy="16" r="5" stroke="#60a5fa" strokeWidth="2.5" fill="white" />
    {/* Cabo da lupa */}
    <path d="M19.5 19.5L23 23" stroke="#d1d5db" strokeWidth="3" strokeLinecap="round" />
    
    {/* Exclamação vermelha/laranja dentro da lupa */}
    <path d="M16 13.5V16.5M16 18.5V18.6" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

// TABS removido: navegação principal movida para o App.jsx

export default function DashboardPage() {
  const location = useLocation()
  const initialDate = location.state?.date || ''
  const { usinaAtual, setUsinaAtual } = useUsina()
  // const [usinas, setUsinas] = useState([]) // Usinas state is now managed in App.jsx

  const view = new URLSearchParams(location.search).get('view') || 'dashboard'

  const [selectedDates, setSelectedDates] = useState(initialDate ? [initialDate] : [])
  const [selectedSeries, setSelectedSeries] = useState([])
  const [activeFilters, setActiveFilters] = useState([])
  const [visibleFilters, setVisibleFilters] = useState([])
  
  // Campanhas state
  const [campanhas, setCampanhas] = useState([])
  const [campanhaAtual, setCampanhaAtual] = useState(null)
  const [isCampanhaModalOpen, setIsCampanhaModalOpen] = useState(false)
  const [newCampanhaName, setNewCampanhaName] = useState('')
  const [addCampanhaModalOpen, setAddCampanhaModalOpen] = useState(false)
  const [selectedCampanhaToAdd, setSelectedCampanhaToAdd] = useState('')

  const [filterColors, setFilterColors] = useState({})
  const [colorPickerFilter, setColorPickerFilter] = useState(null)
  
  const [dashboardTab, setDashboardTab] = useState('chart')
  const [desempenhoTab, setDesempenhoTab] = useState('config')
  const [causaRaizTab, setCausaRaizTab] = useState('integralizacao')
  const [elementos, setElementos] = useState([])
  
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isDataOpen, setIsDataOpen] = useState(true)
  const [isFiltersOpen, setIsFiltersOpen] = useState(true)
  const [isSeriesOpen, setIsSeriesOpen] = useState(true)
  const [isSeriesModalOpen, setIsSeriesModalOpen] = useState(false)
  const [isSecondaryToolbarOpen, setIsSecondaryToolbarOpen] = useState(true)
  const [showEixosMenu, setShowEixosMenu] = useState(false)
  const [showSeriesMenu, setShowSeriesMenu] = useState(false)
  
  const tableRef = useRef(null)
  const [showTableExportMenu, setShowTableExportMenu] = useState(false)
  
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
  // fetchUsinas().then(setUsinas).catch(() => {}) // Removido, fetch é no App.jsx agora
  }, [])

  useEffect(() => {
    if (usinaAtual) {
      fetchVisualizations(usinaAtual).then(setSavedVisualizations).catch(() => {})
      fetchCampanhas(usinaAtual).then(setCampanhas).catch(() => {})
      setLoadedVisualization(null)
    }
  }, [usinaAtual])

  const handleSaveVisualization = async ({ name, saveAsNew, isShared }) => {
    try {
      const payload = {
        name,
        user: user?.email || "Desconhecido",
        selectedDates,
        selectedSeries,
        activeFilters,
        visibleFilters,
        filterColors,
        chartConfig,
        shared: isShared
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
    
    let effectiveDates = selectedDates;
    
    // Se não for uma visualização padrão do sistema, carregamos as datas dela
    if (!vis.shared) {
      effectiveDates = (vis.selectedDates || []).filter(d => filteredDates.includes(d));
      setSelectedDates(effectiveDates)
    }
    
    setPendingLoadVis({ ...vis, effectiveDates })
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

  const { elementSettings } = useChartSettings() || {}

  // Identifica séries de filtro pela coluna (começa com 'simultaneidade')
  // independentemente do Elemento 'Filtro' estar ou não cadastrado
  const isFilterSerie = (s) => {
    const col = s.coluna?.toLowerCase() || '';
    return col.startsWith('simultaneidade') || col === 'curtailment' || col === 'dados válidos' || col === 'tracker piranômetro';
  }

  const normalSeries = useMemo(() => {
    return series?.filter(s => !isFilterSerie(s)) || []
  }, [series])

  const filterSeries = useMemo(() => {
    const filters = series?.filter(s => isFilterSerie(s)) || []
    return filters.sort((a, b) => {
      const getOrder = (col) => {
        const c = col.toLowerCase()
        if (c === 'tracker piranômetro') return 0
        if (c.startsWith('simultaneidade')) return 1
        if (c === 'curtailment') return 2
        if (c === 'dados válidos') return 3
        return 99
      }
      return getOrder(a.coluna) - getOrder(b.coluna)
    })
  }, [series])

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
      
      if (vis.effectiveDates?.length && allQuerySeries.length && usinaAtual) {
        query({
          usina: usinaAtual,
          dates: vis.effectiveDates,
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
          const col = s.coluna.toLowerCase()
          if (col === 'curtailment') {
            newColors[s.coluna] = '#059669' // Green
          } else if (col === 'dados válidos') {
            newColors[s.coluna] = '#7c3aed' // Purple
          } else if (col === 'tracker piranômetro') {
            newColors[s.coluna] = '#f97316' // Orange
          } else if (col.startsWith('simultaneidade')) {
            newColors[s.coluna] = '#ef4444' // Red
          } else {
            newColors[s.coluna] = defaultPalette[idx % defaultPalette.length]
          }
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

  const filteredDates = useMemo(() => {
    if (!campanhaAtual) return dates;
    const c = campanhas.find(x => x.nome === campanhaAtual);
    return c ? dates.filter(d => c.dias.includes(d)) : dates;
  }, [dates, campanhas, campanhaAtual]);

  // Deselect dates not in campaign when campaign changes
  useEffect(() => {
    if (campanhaAtual && selectedDates.length > 0) {
      const validDates = selectedDates.filter(d => filteredDates.includes(d));
      if (validDates.length !== selectedDates.length) {
        if (data) {
          skipCleanup.current = true;
          pendingVisualize.current = true;
        }
        setSelectedDates(validDates);
      }
    }
  }, [campanhaAtual, filteredDates, selectedDates, data]);

  const handleCreateCampanha = () => {
    if (!newCampanhaName) return;
    saveCampanha(usinaAtual, { nome: newCampanhaName, dias: selectedDates })
      .then(res => {
        setCampanhas(prev => [...prev.filter(c => c.nome !== res.campanha.nome), res.campanha]);
        setCampanhaAtual(res.campanha.nome);
        setIsCampanhaModalOpen(false);
        setNewCampanhaName('');
        if (data) {
          skipCleanup.current = true;
          pendingVisualize.current = true;
        }
      })
      .catch(err => console.error("Erro ao criar campanha:", err));
  };

  const handleAddToCampanha = () => {
    if (!selectedCampanhaToAdd) return;
    const c = campanhas.find(x => x.nome === selectedCampanhaToAdd);
    if (!c) return;
    const newDias = [...new Set([...c.dias, ...selectedDates])];
    saveCampanha(usinaAtual, { nome: selectedCampanhaToAdd, dias: newDias })
      .then(res => {
        setCampanhas(prev => prev.map(x => x.nome === res.campanha.nome ? res.campanha : x));
        setAddCampanhaModalOpen(false);
        setSelectedCampanhaToAdd('');
        if (data) {
          skipCleanup.current = true;
          pendingVisualize.current = true;
        }
      });
  };

  const handleRemoveFromCampanha = () => {
    if (!campanhaAtual) return;
    const c = campanhas.find(x => x.nome === campanhaAtual);
    if (!c) return;
    const newDias = c.dias.filter(d => !selectedDates.includes(d));
    saveCampanha(usinaAtual, { nome: campanhaAtual, dias: newDias })
      .then(res => {
        setCampanhas(prev => prev.map(x => x.nome === res.campanha.nome ? res.campanha : x));
        if (data) {
          skipCleanup.current = true;
          pendingVisualize.current = true;
        }
        setSelectedDates([]); // Clear selection after remove
      });
  };

  const handleDeleteCampanha = (nome) => {
    if(!window.confirm(`Tem certeza que deseja excluir a campanha ${nome}?`)) return;
    deleteCampanha(usinaAtual, nome).then(() => {
        setCampanhas(prev => prev.filter(c => c.nome !== nome));
        if (campanhaAtual === nome) setCampanhaAtual(null);
    })
  }

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
                <span>📅 Data {filteredDates.length > 0 && <span className="badge badge-amber" style={{marginLeft: 8}}>{filteredDates.length} TOTAL</span>}</span>
                <span style={{ fontSize: '10px' }}>{isDataOpen ? '▼' : '▶'}</span>
              </div>
              {isDataOpen && (
                <>
                  {/* Seletor de Campanha */}
                  {usinaAtual && (
                    <div style={{ marginBottom: 12, padding: '0 4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-primary)', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>🎯</span>
                        <select
                          value={campanhaAtual || ''}
                          onChange={e => setCampanhaAtual(e.target.value || null)}
                          style={{
                            background: 'transparent', border: 'none', color: 'var(--text-primary)',
                            fontSize: 13, fontWeight: 600, outline: 'none', cursor: 'pointer',
                            fontFamily: 'inherit', flex: 1,
                          }}
                        >
                          <option value="">Todos os dias</option>
                          {campanhas.map(c => <option key={c.nome} value={c.nome}>{c.nome} ({c.dias.length} d)</option>)}
                        </select>
                        {campanhaAtual && (
                          <button 
                            onClick={() => handleDeleteCampanha(campanhaAtual)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#ef4444' }}
                            title="Excluir campanha"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {filteredDates.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, padding: '0 4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ color: '#d97706', fontSize: 11, fontWeight: 600, lineHeight: 1.2 }}>
                          {selectedDates.length}/{filteredDates.length} selecionadas
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button 
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: 14, padding: '4px 6px' }}
                            onClick={() => setSelectedDates([...filteredDates].sort((a,b) => a.localeCompare(b)))}
                            title="Selecionar todos"
                          >
                            ☑️
                          </button>
                          <button 
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: 14, padding: '4px 6px' }}
                            onClick={() => setSelectedDates([])}
                            title="Limpar seleção"
                          >
                            🧹
                          </button>
                          {selectedDates.length > 0 && !campanhaAtual && (
                            <>
                              <button 
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: 14, padding: '4px 6px' }}
                                onClick={() => setIsCampanhaModalOpen(true)}
                                title="Nova Campanha"
                              >
                                ➕
                              </button>
                              <button 
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: 14, padding: '4px 6px' }}
                                disabled={campanhas.length === 0}
                                onClick={() => setAddCampanhaModalOpen(true)}
                                title={campanhas.length === 0 ? "Nenhuma campanha existe ainda" : "Adicionar à Campanha"}
                              >
                                📥
                              </button>
                            </>
                          )}
                          {selectedDates.length > 0 && campanhaAtual && (
                            <button 
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: 14, padding: '4px 6px', color: '#b91c1c' }}
                              onClick={handleRemoveFromCampanha}
                              title="Remover Selecionados da Campanha"
                            >
                              ❌
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, maxHeight: 200, overflowY: 'auto', padding: '0 4px' }}>
                    {filteredDates.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhuma data</span>}
                  {filteredDates.map((d) => {
                    const isSelected = selectedDates.includes(d)
                    return (
                    <button 
                      key={d}
                      onClick={() => {
                        const checked = !isSelected
                        const nextDatesLength = checked ? selectedDates.length + 1 : selectedDates.length - 1;
                        if (data && nextDatesLength > 0) {
                          // Atualiza a visualização existente (adiciona ou remove dia): preserva séries e config
                          skipCleanup.current = true
                          pendingVisualize.current = true
                        }
                        setSelectedDates(prev => {
                          if (checked) return [...prev, d].sort((a,b) => a.localeCompare(b))
                          return prev.filter(x => x !== d)
                        })
                      }}
                      style={{
                        padding: '6px 8px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: isSelected ? 600 : 500,
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: isSelected ? '#fed7aa' : 'var(--border)',
                        color: isSelected ? '#ea580c' : 'var(--text-primary)',
                        background: isSelected ? '#fff7ed' : 'var(--bg-card)',
                        transition: 'all 0.2s',
                        textAlign: 'center'
                      }}
                    >
                      {d}
                    </button>
                  )})}
                </div>
                </>
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
                  <div style={{ padding: '0 4px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '240px' }}>
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
                      <>
                        <span className="badge badge-amber">{normalSeries.length.toLocaleString('pt-BR')} total</span>
                        <button 
                          className="btn btn-ghost btn-sm" 
                          style={{ padding: '4px', height: 'auto', minHeight: 'auto', marginLeft: '4px' }}
                          onClick={(e) => { e.stopPropagation(); setIsSeriesModalOpen(true); }}
                          title="Abrir em Tela Cheia"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                          </svg>
                        </button>
                      </>
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
        {/* Conteúdo das abas — todos os painéis permanecem montados, visibilidade controlada por display:none */}

        {/* ── Desempenho ───────────────────────────────────────── */}
        <div style={{ display: view === 'desempenho' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%', overflow: 'hidden', padding: '10px 20px 20px 20px' }}>
          <div style={{ display: 'flex', gap: 2, marginBottom: 8, borderBottom: '2px solid #e2e8f0', flexShrink: 0 }}>
            {[
              { id: 'config', icon: '⚙️', label: 'Fluxograma' },
              { id: 'validacao', icon: '📊', label: 'Resultados' },
              { id: 'incertezas', icon: <img src="/incertezas_icon.png" alt="Incertezas" style={{ width: 16, height: 16, objectFit: 'contain' }} />, label: 'Incertezas' },
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
          {/* Sub-abas de Desempenho — sempre montadas, cada uma com scroll independente */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <div style={{ display: desempenhoTab === 'config' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'auto' }}>
              <FluxogramaView elementos={elementos} selectedDates={selectedDates} showTitle={false} mode="config" />
            </div>
            <div style={{ display: desempenhoTab === 'validacao' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'auto' }}>
              <FluxogramaView elementos={elementos} selectedDates={selectedDates} showTitle={false} mode="validacao" />
            </div>
            <div style={{ display: desempenhoTab === 'incertezas' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'auto' }}>
              <AnaliseIncertezasView usinaAtual={usinaAtual} selectedDates={selectedDates} />
            </div>
          </div>
        </div>

        {/* ── Análise de Causa Raiz ────────────────────────────── */}
        <div style={{ display: view === 'causa-raiz' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%', overflow: 'hidden', padding: '10px 20px 20px 20px' }}>
          <div style={{ display: 'flex', gap: 2, marginBottom: 8, borderBottom: '2px solid #e2e8f0', flexShrink: 0 }}>
            {[
              { id: 'integralizacao', icon: '🌡️', label: 'Integralização' },
              { id: 'ranking', icon: '🏆', label: 'Ranking' },
              { id: 'trackers', icon: <TrackerSVGIcon />, label: 'Trackers' },
              { id: 'mapa', icon: '🗺️', label: 'Mapa' },
            ].map(tab => {
              const isActive = causaRaizTab === tab.id
              return (
                <button key={tab.id} onClick={() => setCausaRaizTab(tab.id)}
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
          {/* Sub-abas de Causa Raiz — sempre montadas, cada uma com scroll independente */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <div style={{ display: causaRaizTab === 'integralizacao' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'auto' }}>
              <HeatmapYield usina={usinaAtual} dates={selectedDates.join(',')} activeFilters={activeFilters} />
            </div>
            <div style={{ display: causaRaizTab === 'ranking' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'auto' }}>
              <RankingTab usina={usinaAtual} dates={selectedDates.join(',')} activeFilters={activeFilters} />
            </div>
            <div style={{ display: causaRaizTab === 'trackers' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'auto' }}>
              <TrackerAnalysis usina={usinaAtual} dates={selectedDates.join(',')} activeFilters={activeFilters} />
            </div>
            <div style={{ display: causaRaizTab === 'mapa' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'auto' }}>
              <MapaView usina={usinaAtual} dates={selectedDates.join(',')} activeFilters={activeFilters} />
            </div>
          </div>
        </div>

        {/* ── Gráfico + Tabela ─────────────────────────────────── */}
        <div style={{ display: view === 'dashboard' ? 'flex' : 'none', flex: 1, overflow: 'hidden', padding: '10px 20px 20px 20px', flexDirection: 'column' }}>

          {/* Cabeçalho do Dashboard: Abas + Controles */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8, borderBottom: '2px solid #e2e8f0', flexShrink: 0 }}>
            {/* Abas */}
            <div style={{ display: 'flex', gap: 2 }}>
              {[
                { id: 'chart', icon: '📈', label: 'Gráfico' },
                { id: 'table', icon: '📋', label: 'Tabela' }
              ].map(tab => {
                const isActive = dashboardTab === tab.id
                return (
                  <button key={tab.id} onClick={() => setDashboardTab(tab.id)}
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

            {/* Controles à direita */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 6 }}>
              {/* Badges de Dados */}
              {filteredData && (
                <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span className="badge badge-amber">
                    {filteredData.dates?.split(',').length} {filteredData.dates?.split(',').length === 1 ? 'dia' : 'dias'}
                  </span>
                  <span className="badge badge-blue">{Object.keys(filteredData.series).length} séries</span>
                  <span className="badge badge-gray">{filteredData.total_pontos.toLocaleString('pt-BR')} pts</span>
                </div>
              )}

              {/* Botão Nova Visualização */}
              <div style={{ position: 'relative', display: 'flex' }}>
                <button
                  className="btn btn-secondary"
                  style={{ height: 32, boxSizing: 'border-box', padding: '0 12px', flexShrink: 0, fontWeight: 600, background: '#f8fafc', color: '#1e293b', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px', cursor: 'pointer', fontSize: 13 }}
                  onClick={() => setIsVisDropdownOpen(!isVisDropdownOpen)}
                  title="Gerenciar Visualizações"
                >
                  <span style={{ fontSize: 14 }}>📄</span> 
                  <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {loadedVisualization ? loadedVisualization.nome : 'Nova Visualização'}
                  </span>
                  ▾
                </button>
                {isVisDropdownOpen && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setIsVisDropdownOpen(false)} />
                    <div style={{
                      position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50,
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

              {/* Controles de Gráfico */}
              {dashboardTab === 'chart' && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className={`btn btn-sm ${showEixosMenu ? 'btn-active' : ''}`}
                    style={{
                      background: showEixosMenu ? 'var(--bg-secondary)' : 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      padding: '4px 10px', fontSize: 13, display: 'flex', alignItems: 'center',
                      gap: 6, color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer',
                      boxShadow: showEixosMenu ? 'inset 0 2px 4px rgba(0,0,0,0.05)' : 'none', height: 32
                    }}
                    onClick={() => setShowEixosMenu(!showEixosMenu)}
                  >
                    <span style={{ fontSize: 13 }}>{showEixosMenu ? '🛠️' : '🔧'}</span> Eixos
                  </button>
                  <button
                    className={`btn btn-sm ${showSeriesMenu ? 'btn-active' : ''}`}
                    style={{
                      background: showSeriesMenu ? 'var(--bg-secondary)' : 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      padding: '4px 10px', fontSize: 13, display: 'flex', alignItems: 'center',
                      gap: 6, color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer',
                      boxShadow: showSeriesMenu ? 'inset 0 2px 4px rgba(0,0,0,0.05)' : 'none', height: 32
                    }}
                    onClick={() => setShowSeriesMenu(!showSeriesMenu)}
                  >
                    <span style={{ fontSize: 13 }}>{showSeriesMenu ? '📊' : '📈'}</span> Séries
                  </button>

                  {/* Bloco Legenda */}
                  <div style={{
                    backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: '6px', padding: '4px 8px', marginLeft: 4, height: 32, boxSizing: 'border-box',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Legenda</span>
                    <div style={{ 
                      width: 22, height: 22, 
                      border: '1.5px solid #475569', borderRadius: 4, 
                      overflow: 'hidden', background: '#ffffff',
                      display: 'flex', flexDirection: 'column',
                      flexShrink: 0
                    }}>
                      <div 
                        onClick={() => setChartConfig(p => ({...p, legendPosition: (p.legendPosition || 'right') === 'top' ? 'none' : 'top'}))}
                        title="Horizontal Acima"
                        style={{ height: '28%', background: (chartConfig.legendPosition || 'right') === 'top' ? '#3b82f6' : '#e2e8f0', cursor: 'pointer', transition: 'background 0.2s' }} 
                      />
                      <div style={{ display: 'flex', flex: 1, borderTop: '1.5px solid #475569', borderBottom: '1.5px solid #475569' }}>
                        <div 
                          onClick={() => setChartConfig(p => ({...p, legendPosition: (p.legendPosition || 'right') === 'left' ? 'none' : 'left'}))}
                          title="Vertical Esquerda"
                          style={{ flex: 1, background: (chartConfig.legendPosition || 'right') === 'left' ? '#3b82f6' : '#e2e8f0', cursor: 'pointer', borderRight: '1.5px solid #475569', transition: 'background 0.2s' }} 
                        />
                        <div 
                          onClick={() => setChartConfig(p => ({...p, legendPosition: (p.legendPosition || 'right') === 'right' ? 'none' : 'right'}))}
                          title="Vertical Direita"
                          style={{ flex: 1, background: (chartConfig.legendPosition || 'right') === 'right' ? '#3b82f6' : '#e2e8f0', cursor: 'pointer', transition: 'background 0.2s' }} 
                        />
                      </div>
                      <div 
                        onClick={() => setChartConfig(p => ({...p, legendPosition: (p.legendPosition || 'right') === 'bottom' ? 'none' : 'bottom'}))}
                        title="Horizontal Abaixo"
                        style={{ height: '28%', background: (chartConfig.legendPosition || 'right') === 'bottom' ? '#3b82f6' : '#e2e8f0', cursor: 'pointer', transition: 'background 0.2s' }} 
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Botão de Exportar - Tabela */}
              {dashboardTab === 'table' && filteredData && (
                <div style={{ position: 'relative', display: 'flex' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ height: 32, boxSizing: 'border-box', padding: '0 12px', flexShrink: 0, fontWeight: 600, background: '#e2e8f0', color: '#1e293b', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px', cursor: 'pointer', fontSize: 13 }}
                    onClick={() => setShowTableExportMenu(!showTableExportMenu)}
                    title="Opções de Exportação"
                  >
                    📥 Exportar ▾
                  </button>

                  {showTableExportMenu && (
                    <>
                      <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowTableExportMenu(false)} />
                      <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 8, zIndex: 50, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
                        <button 
                          onClick={() => {
                            setShowTableExportMenu(false);
                            if (!filteredData || !filteredData.timestamps) return;
                            const seriesNames = Object.keys(filteredData.series);
                            const headers = ['Timestamp'];
                            const headerMap = {};
                            seriesNames.forEach(name => {
                              const sinfo = seriesDict[name] || {};
                              const parts = [];
                              if (sinfo.elemento) parts.push(sinfo.elemento);
                              const equip = [sinfo.skid, sinfo.inversor, sinfo.estacao, sinfo.stringbox].filter(Boolean).join(' · ');
                              if (equip) parts.push(equip);
                              parts.push(formatSeriesName(name));
                              const colName = parts.join(' | ');
                              headers.push(colName);
                              headerMap[name] = colName;
                            });
                            const rows = filteredData.timestamps.map((ts, i) => {
                              const row = { 'Timestamp': ts.slice(0, 19).replace('T', ' ') };
                              seriesNames.forEach(name => {
                                let val = filteredData.series[name][i];
                                if (typeof val === 'number') val = Number(val.toFixed(3));
                                row[headerMap[name]] = val;
                              });
                              return row;
                            });
                            import('xlsx').then(XLSX => {
                              const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
                              const wb = XLSX.utils.book_new();
                              XLSX.utils.book_append_sheet(wb, ws, "Dados");
                              XLSX.writeFile(wb, `Exportacao_${usinaAtual || 'Usina'}.xlsx`);
                            });
                          }} 
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer', border: 'none', background: 'transparent', textAlign: 'left', color: '#334155', fontWeight: 500, borderRadius: 4 }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{ fontSize: 16 }}>📊</span> Excel (.xlsx)
                        </button>
                        <button 
                          onClick={() => { setShowTableExportMenu(false); exportTableToPng(tableRef.current, `Exportacao_${usinaAtual || 'Usina'}.png`, { scale: 2 }) }} 
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer', border: 'none', background: 'transparent', textAlign: 'left', color: '#334155', fontWeight: 500, borderRadius: 4 }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{ fontSize: 16 }}>🖼️</span> Imagem (PNG)
                        </button>
                        <button 
                          onClick={() => { setShowTableExportMenu(false); exportTableToPdf(tableRef.current, `Exportacao_${usinaAtual || 'Usina'}.pdf`, { forceOrientation: 'p', usinaName: usinaAtual || 'N/D', scale: 2 }) }} 
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer', border: 'none', background: 'transparent', textAlign: 'left', color: '#334155', fontWeight: 500, borderRadius: 4 }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{ fontSize: 16 }}>📄</span> PDF (Retrato)
                        </button>
                        <button 
                          onClick={() => { setShowTableExportMenu(false); exportTableToPdf(tableRef.current, `Exportacao_${usinaAtual || 'Usina'}.pdf`, { forceOrientation: 'l', usinaName: usinaAtual || 'N/D', scale: 2 }) }} 
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer', border: 'none', background: 'transparent', textAlign: 'left', color: '#334155', fontWeight: 500, borderRadius: 4 }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{ fontSize: 16 }}>🗎</span> PDF (Paisagem)
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Chart */}
          {dashboardTab === 'chart' && (
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

          {/* Table */}
          {dashboardTab === 'table' && (
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
                <div ref={tableRef} className="fade-in" style={{ height: '100%', overflow: 'hidden', padding: '16px', background: '#fff', borderRadius: '8px' }}>
                  <DataTable data={filteredData} seriesDict={seriesDict} />
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

      {/* Modals para Campanhas */}
      {isCampanhaModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-primary)', padding: '24px', borderRadius: '12px', width: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: 'var(--text-primary)' }}>Nova Campanha</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '8px', color: 'var(--text-secondary)' }}>Nome da Campanha</label>
              <input
                type="text"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}
                placeholder="Ex: Teste Desempenho 1"
                value={newCampanhaName}
                onChange={(e) => setNewCampanhaName(e.target.value)}
                autoFocus
              />
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}>Esta campanha será criada com {selectedDates.length} dias selecionados.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn btn-ghost" onClick={() => setIsCampanhaModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCreateCampanha} disabled={!newCampanhaName}>Criar</button>
            </div>
          </div>
        </div>
      )}

      {addCampanhaModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-primary)', padding: '24px', borderRadius: '12px', width: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: 'var(--text-primary)' }}>Adicionar à Campanha</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '8px', color: 'var(--text-secondary)' }}>Selecione a Campanha</label>
              <select
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}
                value={selectedCampanhaToAdd}
                onChange={(e) => setSelectedCampanhaToAdd(e.target.value)}
              >
                <option value="" disabled>-- Selecione --</option>
                {campanhas.map(c => <option key={c.nome} value={c.nome}>{c.nome}</option>)}
              </select>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}>Os {selectedDates.length} dias selecionados serão mesclados à campanha escolhida.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn btn-ghost" onClick={() => setAddCampanhaModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleAddToCampanha} disabled={!selectedCampanhaToAdd}>Adicionar</button>
            </div>
          </div>
        </div>
      )}

      <SaveVisualizationModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        onSave={handleSaveVisualization}
        hasLoadedVis={!!loadedVisualization}
        currentName={loadedVisualization?.name}
        currentShared={loadedVisualization?.shared}
        existingNames={savedVisualizations.map(v => v.name)}
      />
      
      <LoadVisualizationModal
        isOpen={isLoadModalOpen}
        onClose={() => setIsLoadModalOpen(false)}
        onLoad={handleLoadVisualization}
        onDelete={handleDeleteVisualization}
        visualizations={savedVisualizations}
      />

      {isSeriesModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-primary)', width: '90vw', height: '90vh', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)' }}>
            <div style={{ padding: '8px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-secondary)' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📡 Seleção de Séries
              </h2>
              <button 
                className="btn btn-ghost" 
                onClick={() => setIsSeriesModalOpen(false)}
                style={{ padding: '8px', fontSize: '20px', lineHeight: '1', color: 'var(--text-muted)', border: 'none', background: 'transparent', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>
            <div style={{ flex: 1, padding: '16px 24px 8px 24px', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
              <SeriesSelector
                series={normalSeries}
                selected={selectedSeries}
                onChange={setSelectedSeries}
                elementos={elementos}
                isKanban={true}
              />
            </div>
            <div style={{ padding: '8px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => setIsSeriesModalOpen(false)}>
                Concluído
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
