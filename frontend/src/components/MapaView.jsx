import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { fetchMapaHeatmap, fetchMapaLayout, fetchMapaTimes, fetchMapaInstant } from '../services/api'
import { exportTableToPdf, exportTableToPng } from '../utils/exportPdf'
import { ErrorState } from './StateComponents'
import GIF from 'gif.js'
import html2canvas from 'html2canvas'
import PlotWrapper from 'react-plotly.js'
const Plot = PlotWrapper.default || PlotWrapper
import { useSeriesData } from '../hooks/useSeriesData'

export default function MapaView({ usina, dates, activeFilters = [] }) {
  const tableRef = useRef(null)
  const [data, setData] = useState(null)
  const [layout, setLayout] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedDates, setSelectedDates] = useState([])
  const [fetchedDates, setFetchedDates] = useState([])
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [draftDates, setDraftDates] = useState([])
  const [metricType, setMetricType] = useState('integral') // 'integral', 'yield', 'desvio', 'kwp'
  const [showExportMenu, setShowExportMenu] = useState(false)
  
  // Instant mode states
  const [mapMode, setMapMode] = useState('integral') // 'integral' ou 'instant'
  const [availableTimes, setAvailableTimes] = useState([])
  const [currentTimeIndex, setCurrentTimeIndex] = useState(0)
  const [instantData, setInstantData] = useState(null)
  const [loadingInstant, setLoadingInstant] = useState(false)
  const [timeInput, setTimeInput] = useState("")
  const [fixedMin, setFixedMin] = useState("")
  const [fixedMax, setFixedMax] = useState("")
  const [highlights, setHighlights] = useState({ skid: false, inversor: false, stringbox: false, string: true })
  const [showGridMenu, setShowGridMenu] = useState(false)
  
  // Cores personalizadas
  const [colorMin, setColorMin] = useState("#63be7b")
  const [colorMid, setColorMid] = useState("#ffeb84")
  const [colorMax, setColorMax] = useState("#f8696b")

  // GIF Export states
  const [showGifMenu, setShowGifMenu] = useState(false)
  const [isGeneratingGif, setIsGeneratingGif] = useState(false)
  const [gifProgress, setGifProgress] = useState({ current: 0, total: 0, rendering: false })
  const [gifConfig, setGifConfig] = useState({ delay: 500, startIdx: 0, endIdx: 0 })
  const [selectedChartSeries, setSelectedChartSeries] = useState("")
  const [histogramRange, setHistogramRange] = useState(null)
  const [histogramBinSize, setHistogramBinSize] = useState(1000)

  const { data: chartData, loading: chartLoading, query: queryChartData } = useSeriesData()

  useEffect(() => {
    if (!selectedChartSeries || selectedDates.length !== 1 || !usina) {
        return
    }
    queryChartData({ usina, dates: selectedDates[0], series: [selectedChartSeries] })
  }, [usina, selectedDates, selectedChartSeries, queryChartData])

  useEffect(() => {
    if (availableTimes.length > 0) {
      setTimeInput(availableTimes[currentTimeIndex] || "")
    }
  }, [currentTimeIndex, availableTimes])
  
  useEffect(() => {
    if (!usina) return
    fetchMapaLayout(usina).then(setLayout).catch(e => setError("Erro ao carregar layout do mapa: " + e.message))
  }, [usina])

  const load = async () => {
    if (!usina || !dates) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetchMapaHeatmap(usina, dates, activeFilters)
      setData(res.records)
      const dArr = dates.split(',').map(d => d.trim()).filter(Boolean).sort()
      setFetchedDates(dArr)
      if (dArr.length > 0) setSelectedDates([dArr[0]])
      else setSelectedDates([])
    } catch (e) {
      setError(e.message)
      setData(null)
      setFetchedDates([])
      setSelectedDates([])
    } finally {
      setLoading(false)
    }
  }

  // Load only when user clicks Processar. Reset if usina changes.
  useEffect(() => {
    setData(null)
    setFetchedDates([])
    setSelectedDates([])
    setMapMode('integral')
    setAvailableTimes([])
    setCurrentTimeIndex(0)
    setInstantData(null)
    setHistogramRange(null)
  }, [usina])
  
  // Efeito para carregar horários disponíveis quando entra no modo instantâneo
  useEffect(() => {
    if (mapMode === 'instant' && selectedDates.length === 1) {
      setLoadingInstant(true)
      fetchMapaTimes(usina, selectedDates[0])
        .then(res => {
          if (res.times && res.times.length > 0) {
            setAvailableTimes(res.times)
            const idx = res.times.findIndex(t => t >= '06:00')
            setCurrentTimeIndex(idx !== -1 ? idx : 0)
          } else {
            setAvailableTimes([])
            setInstantData(null)
          }
        })
        .catch(e => setError("Erro ao carregar horários: " + e.message))
        .finally(() => setLoadingInstant(false))
    } else {
      setAvailableTimes([])
      setInstantData(null)
    }
  }, [mapMode, selectedDates, usina])

  // Efeito para buscar os dados do minuto exato
  useEffect(() => {
    if (mapMode === 'instant' && availableTimes.length > 0 && selectedDates.length === 1) {
      const time = availableTimes[currentTimeIndex]
      if (!time) return
      setLoadingInstant(true)
      fetchMapaInstant(usina, selectedDates[0], time, activeFilters)
        .then(res => {
          setInstantData(res.records || [])
        })
        .catch(e => setError("Erro ao carregar dados instantâneos: " + e.message))
        .finally(() => setLoadingInstant(false))
    }
  }, [currentTimeIndex, availableTimes, mapMode, selectedDates, usina, activeFilters])

  // 1. Filter and Aggregate data (depends on mapMode, data, instantData)
  const aggregatedStats = useMemo(() => {
    if (mapMode === 'integral') {
      if (!data) return null;
      const filteredData = selectedDates.length > 0 ? data.filter(r => selectedDates.includes(r.date)) : data
      
      const seriesStats = {}
      filteredData.forEach(r => {
        const s = r.serie
        if (!seriesStats[s]) seriesStats[s] = { serie: s, integral: 0, avg_sum: 0, kwp: 0, count: 0, inversor: r.inversor, skid: r.skid, stringbox: r.stringbox }
        seriesStats[s].integral += r.integral || 0
        seriesStats[s].avg_sum += r.avg_val || 0
        seriesStats[s].kwp += r.kwp || 0
        seriesStats[s].count += 1
      })

      let allYields = []
      Object.keys(seriesStats).forEach(s => {
        const st = seriesStats[s]
        if (st.kwp > 0) {
           st.yield = st.integral / st.kwp
           allYields.push(st.yield)
        } else st.yield = null
      })

      const globalAvgYield = allYields.length > 0 ? allYields.reduce((a,b)=>a+b,0) / allYields.length : 0
      const globalMaxYield = allYields.length > 0 ? Math.max(...allYields) : 0

      const statLookup = {}
      Object.keys(seriesStats).forEach(key => {
          statLookup[key] = seriesStats[key]
          const parts = key.split('.')
          for (let i = 1; i < parts.length; i++) {
              const suffix = parts.slice(i).join('.')
              if (!statLookup[suffix]) statLookup[suffix] = seriesStats[key]
          }
      })
      
      const allStatsArr = Object.values(seriesStats)
      const metricRanges = {}
      ;['yield', 'kwp', 'integral'].forEach(m => {
          const validVals = allStatsArr.map(s => s[m]).filter(v => v != null && !isNaN(v))
          if (validVals.length) {
              metricRanges[m] = { min: Math.min(...validVals), max: Math.max(...validVals) }
              metricRanges[m].mid = (metricRanges[m].min + metricRanges[m].max) / 2
          }
      })

      return { statLookup, globalAvgYield, globalMaxYield, metricRanges, allStatsArr }
      
    } else {
      // Modo Instantâneo
      if (!instantData) return null;
      
      const seriesStats = {}
      let allYields = []
      
      instantData.forEach(r => {
        const s = r.serie
        seriesStats[s] = { serie: s, integral: r.val, kwp: r.kwp, inversor: r.inversor, skid: r.skid, stringbox: r.stringbox } // integral no modo instantâneo é apenas o valor val!
        if (r.kwp > 0 && r.val != null) {
            seriesStats[s].yield = r.val / r.kwp
            allYields.push(seriesStats[s].yield)
        } else {
            seriesStats[s].yield = null
        }
      })
      
      const globalAvgYield = allYields.length > 0 ? allYields.reduce((a,b)=>a+b,0) / allYields.length : 0
      const globalMaxYield = allYields.length > 0 ? Math.max(...allYields) : 0
      
      const statLookup = {}
      Object.keys(seriesStats).forEach(key => {
          statLookup[key] = seriesStats[key]
          const parts = key.split('.')
          for (let i = 1; i < parts.length; i++) {
              const suffix = parts.slice(i).join('.')
              if (!statLookup[suffix]) statLookup[suffix] = seriesStats[key]
          }
      })
      
      const allStatsArr = Object.values(seriesStats)
      const metricRanges = {}
      
      const fMin = fixedMin !== "" && !isNaN(parseFloat(fixedMin)) ? parseFloat(fixedMin) : null;
      const fMax = fixedMax !== "" && !isNaN(parseFloat(fixedMax)) ? parseFloat(fixedMax) : null;

      const filteredDailyData = selectedDates.length > 0 && data ? data.filter(r => selectedDates.includes(r.date)) : [];
      const dailyMaxVals = {};
      if (filteredDailyData.length > 0) {
          const validKwps = filteredDailyData.map(r => r.kwp).filter(v => v != null && !isNaN(v));
          if (validKwps.length) dailyMaxVals.kwp = Math.max(...validKwps);
          
          const validMaxVals = filteredDailyData.map(r => r.max_val).filter(v => v != null && !isNaN(v));
          if (validMaxVals.length) dailyMaxVals.integral = Math.max(...validMaxVals);
          
          const validYields = filteredDailyData.filter(r => r.kwp > 0 && r.max_val != null && !isNaN(r.max_val)).map(r => r.max_val / r.kwp);
          if (validYields.length) dailyMaxVals.yield = Math.max(...validYields);
      }

      ;['yield', 'kwp', 'integral'].forEach(m => {
          const validVals = allStatsArr.map(s => s[m]).filter(v => v != null && !isNaN(v))
          if (validVals.length) {
              const calcMin = 0; // Padrão mínimo 0 solicitado pelo usuário no modo instantâneo
              const calcMax = dailyMaxVals[m] !== undefined ? dailyMaxVals[m] : Math.max(...validVals);
              
              const finalMin = fMin !== null ? fMin : calcMin;
              const finalMax = fMax !== null ? fMax : calcMax;
              
              metricRanges[m] = { min: finalMin, max: finalMax }
              metricRanges[m].mid = (metricRanges[m].min + metricRanges[m].max) / 2
          }
      })

      return { statLookup, globalAvgYield, globalMaxYield, metricRanges, allStatsArr }
    }
  }, [data, instantData, selectedDates, mapMode, fixedMin, fixedMax])

  // 2. Generate Map Cells (depends on aggregatedStats, layout, metricType, colors)
  const mapData = useMemo(() => {
    if (!layout.length) return { cells: [], maxRow: 0, maxCol: 0, grid: {} }
    if (!aggregatedStats) return { cells: layout, maxRow: Math.max(...layout.map(l => l.row)), maxCol: Math.max(...layout.map(l => l.col)), grid: {} }
    
    const { statLookup, globalAvgYield, globalMaxYield, metricRanges } = aggregatedStats

    const hexToRgb = (hex) => {
       const r = parseInt(hex.slice(1, 3), 16) || 0
       const g = parseInt(hex.slice(3, 5), 16) || 0
       const b = parseInt(hex.slice(5, 7), 16) || 0
       return [r, g, b]
    }
    
    const rgbMin = hexToRgb(colorMin)
    const rgbMid = hexToRgb(colorMid)
    const rgbMax = hexToRgb(colorMax)

    const getMapColor = (val, metric) => {
      if (val == null) return '#1e293b'
      
      const interpolate = (c1, c2, factor) => Math.round(c1 + (c2 - c1) * Math.max(0, Math.min(1, factor)))
      
      // Cores do Excel para o heatmap
      const green = [99, 190, 123]   // Verde do Excel (0.05)
      const yellow = [255, 235, 132] // Amarelo do Excel (0)
      const lightRed = [248, 105, 107] // Vermelho claro do Excel (-0.05)
      const pureRed = [255, 0, 0]      // Vermelho puro para < -0.20

      let r, g, b, f = 0

      if (metric === 'desvio' || metric === 'desvioMax') {
         if (val <= -20) { 
             [r,g,b] = pureRed 
         }
         else if (val <= -5) { 
             [r,g,b] = lightRed 
         }
         else if (val >= 5) { 
             [r,g,b] = green 
         }
         else if (val > 0) {
             f = val / 5
             r = interpolate(yellow[0], green[0], f)
             g = interpolate(yellow[1], green[1], f)
             b = interpolate(yellow[2], green[2], f)
         } else {
             // entre -5 e 0
             f = (val - (-5)) / 5
             r = interpolate(lightRed[0], yellow[0], f)
             g = interpolate(lightRed[1], yellow[1], f)
             b = interpolate(lightRed[2], yellow[2], f)
         }
      } else {
         const range = metricRanges[metric]
         if (!range) return '#1e293b'
         const { min, max, mid } = range
         
         if (max === min) { [r,g,b] = rgbMid }
         else {
             if (val > mid) {
                 f = (val - mid) / (max - mid)
                 r = interpolate(rgbMid[0], rgbMax[0], f)
                 g = interpolate(rgbMid[1], rgbMax[1], f)
                 b = interpolate(rgbMid[2], rgbMax[2], f)
             } else {
                 f = (val - min) / (mid - min)
                 r = interpolate(rgbMin[0], rgbMid[0], f)
                 g = interpolate(rgbMin[1], rgbMid[1], f)
                 b = interpolate(rgbMin[2], rgbMid[2], f)
             }
         }
      }
      return `rgb(${r},${g},${b})`
    }

    const cssColorCache = {}
    const getInversorFromLabel = (l) => { const m = l.match(/(INV\d+)/i); return m ? m[1] : null; };
    const getSkidFromLabel = (l) => { const m = l.match(/(CLS\d+\.?\d*)/i); return m ? m[1] : null; };
    const getStringboxFromLabel = (l) => { const m = l.match(/(SB\d+)/i); return m ? m[1] : null; };

    const cells = layout.map(cell => {
      let stat = statLookup[cell.label]
      let inv = stat && stat.inversor ? stat.inversor : getInversorFromLabel(cell.label);
      let skid = stat && stat.skid ? stat.skid : getSkidFromLabel(cell.label);
      let sb = stat && stat.stringbox ? stat.stringbox : getStringboxFromLabel(cell.label);
      
      let absSkid = skid || null;
      let absInversor = (skid && inv) ? `${skid}|${inv}` : inv || null;
      let absStringbox = (skid && inv && sb) ? `${skid}|${inv}|${sb}` : sb || null;

      let finalCell = { ...cell, stat: stat || null, val: null, color: 'transparent', isSpacer: false, skid: absSkid, inversor: absInversor, stringbox: absStringbox }
      if (stat) {
         if (metricType === 'yield') finalCell.val = stat.yield
         else if (metricType === 'kwp') finalCell.val = stat.kwp
         else if (metricType === 'integral') finalCell.val = stat.integral
         else if (metricType === 'desvio') finalCell.val = stat.yield != null && globalAvgYield > 0 ? ((stat.yield - globalAvgYield) / globalAvgYield) * 100 : null
         else if (metricType === 'desvioMax') finalCell.val = stat.yield != null && globalMaxYield > 0 ? ((stat.yield - globalMaxYield) / globalMaxYield) * 100 : null
      }

      if (finalCell.val != null) {
          finalCell.color = getMapColor(finalCell.val, metricType)
      } else {
          // Se não tem valor, verifica se o rótulo da célula é uma cor CSS válida
          let isColor = cssColorCache[cell.label]
          if (isColor === undefined) {
              isColor = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('color', cell.label)
              cssColorCache[cell.label] = isColor
          }
          if (isColor) {
              finalCell.color = cell.label.toLowerCase()
              finalCell.isSpacer = true
          }
      }

      return finalCell
    })

    const maxRow = Math.max(...layout.map(l => l.row))
    const maxCol = Math.max(...layout.map(l => l.col))
    let currentMin = 0;
    let currentMax = 0;
    if (metricType === 'desvio' || metricType === 'desvioMax') {
        currentMin = -20;
        currentMax = 5;
    } else if (aggregatedStats && aggregatedStats.metricRanges[metricType]) {
        currentMin = aggregatedStats.metricRanges[metricType].min;
        currentMax = aggregatedStats.metricRanges[metricType].max;
    }

    const grid = {};
    cells.forEach(c => {
       if (!grid[c.row]) grid[c.row] = {};
       grid[c.row][c.col] = c;
    });

    return { cells, maxRow, maxCol, currentMin, currentMax, grid }

  }, [aggregatedStats, layout, metricType, colorMin, colorMid, colorMax])

  const handleNextDay = () => {
    if (selectedDates.length !== 1) return
    const idx = fetchedDates.indexOf(selectedDates[0])
    if (idx < fetchedDates.length - 1) {
      setSelectedDates([fetchedDates[idx + 1]])
    }
  }

  const histogramValues = useMemo(() => {
     if (!aggregatedStats || !aggregatedStats.allStatsArr) return [];
     const potenciaSeries = aggregatedStats.allStatsArr.filter(s => s.serie && s.serie.includes('PotenciaCC'));
     return potenciaSeries.map(s => s.integral).filter(v => v !== null && v !== undefined);
  }, [aggregatedStats])

  useEffect(() => {
    setHistogramRange(null);
  }, [selectedDates, mapMode]);

  const handlePrevDay = () => {
    if (selectedDates.length !== 1) return
    const idx = fetchedDates.indexOf(selectedDates[0])
    if (idx > 0) {
      setSelectedDates([fetchedDates[idx - 1]])
    }
  }
  
  const toggleDateSelection = (d) => {
    if (draftDates.includes(d)) {
      setDraftDates(prev => prev.filter(x => x !== d))
    } else {
      setDraftDates(prev => [...prev, d].sort())
    }
  }

  const handleOpenDatePicker = () => {
    setDraftDates([...selectedDates])
    setShowDatePicker(!showDatePicker)
  }

  const handleApplyDates = () => {
    setSelectedDates([...draftDates])
    setShowDatePicker(false)
  }

  const renderDateSelector = () => {
    if (!fetchedDates || fetchedDates.length === 0) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button disabled style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: '#f1f5f9', color: '#94a3b8', minWidth: 100, fontWeight: 600 }}>
            {loading ? 'Carregando dados...' : '0 dias'}
          </button>
        </div>
      )
    }
    const isSingle = selectedDates.length === 1
    const idx = isSingle ? fetchedDates.indexOf(selectedDates[0]) : -1
    const hasPrev = isSingle && idx > 0
    const hasNext = isSingle && idx < fetchedDates.length - 1

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
        {isSingle && (
          <button 
            onClick={handlePrevDay} 
            disabled={!hasPrev}
            style={{ height: 34, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', borderRadius: 6, border: '1px solid var(--border)', background: hasPrev ? '#fff' : '#f1f5f9', cursor: hasPrev ? 'pointer' : 'not-allowed', color: hasPrev ? '#334155' : '#94a3b8' }}
          >
            ◀
          </button>
        )}
        
        <div style={{ position: 'relative' }}>
          <button 
            onClick={handleOpenDatePicker}
            style={{ height: 34, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 12px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#0f172a', minWidth: 100 }}
          >
            {selectedDates.length === 1 ? selectedDates[0] : `${selectedDates.length} dias`}
          </button>
          
          {showDatePicker && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 8, zIndex: 50, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>Filtrar Dias Processados</div>
              {fetchedDates.map(d => (
                <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}>
                  <input 
                    type="checkbox" 
                    checked={draftDates.includes(d)} 
                    onChange={() => toggleDateSelection(d)}
                  />
                  {d}
                </label>
              ))}
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                 <button onClick={() => setDraftDates([...fetchedDates])} style={{ flex: 1, padding: 4, fontSize: 11, cursor: 'pointer', border: '1px solid var(--border)', background: '#f1f5f9', borderRadius: 4 }}>Todos</button>
                 <button onClick={() => setDraftDates([])} style={{ flex: 1, padding: 4, fontSize: 11, cursor: 'pointer', border: '1px solid var(--border)', background: '#f1f5f9', borderRadius: 4 }}>Nenhum</button>
              </div>
              <button 
                onClick={handleApplyDates} 
                style={{ marginTop: 4, padding: '6px', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: '#ea580c', color: '#fff', borderRadius: 4 }}
              >
                Processar
              </button>
            </div>
          )}
        </div>

        {isSingle && (
          <button 
            onClick={handleNextDay} 
            disabled={!hasNext}
            style={{ height: 34, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', borderRadius: 6, border: '1px solid var(--border)', background: hasNext ? '#fff' : '#f1f5f9', cursor: hasNext ? 'pointer' : 'not-allowed', color: hasNext ? '#334155' : '#94a3b8' }}
          >
            ▶
          </button>
        )}
        
        {/* Toggle Modo */}
        <div style={{ marginLeft: 8, display: 'flex', alignItems: 'center', height: 34, boxSizing: 'border-box', background: '#f1f5f9', border: '1px solid var(--border)', borderRadius: 8, padding: '0 3px', gap: 2 }}>
           <button
             onClick={() => { setMapMode('integral'); setColorMin('#63be7b'); }}
             style={{ height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px', borderRadius: 6, fontSize: 13, fontWeight: mapMode === 'integral' ? 600 : 500, cursor: 'pointer', border: 'none', background: mapMode === 'integral' ? '#fff' : 'transparent', color: mapMode === 'integral' ? '#0f172a' : '#64748b', boxShadow: mapMode === 'integral' ? '0 1px 2px rgb(0 0 0 / 0.1)' : 'none' }}
           >
             Integral Diária
           </button>
           <button
             onClick={() => { setMapMode('instant'); setColorMin('#6664be'); }}
             disabled={!isSingle}
             title={!isSingle ? "Selecione apenas 1 dia para usar o modo instantâneo" : ""}
             style={{ height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px', borderRadius: 6, fontSize: 13, fontWeight: mapMode === 'instant' ? 600 : 500, cursor: isSingle ? 'pointer' : 'not-allowed', border: 'none', background: mapMode === 'instant' ? '#fff' : 'transparent', color: mapMode === 'instant' ? '#0f172a' : '#94a3b8', boxShadow: mapMode === 'instant' ? '0 1px 2px rgb(0 0 0 / 0.1)' : 'none', opacity: isSingle ? 1 : 0.5 }}
           >
             Instantâneo
           </button>
        </div>

        {/* Time Selector */}
        {mapMode === 'instant' && availableTimes.length > 0 && (
          <div style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
             <button
                onClick={() => setCurrentTimeIndex(prev => prev > 0 ? prev - 1 : prev)}
                disabled={currentTimeIndex === 0}
                style={{ height: 34, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', borderRadius: 6, border: '1px solid var(--border)', background: currentTimeIndex > 0 ? '#fff' : '#f1f5f9', cursor: currentTimeIndex > 0 ? 'pointer' : 'not-allowed', color: currentTimeIndex > 0 ? '#334155' : '#94a3b8' }}
             >
                ◀
             </button>
             <input 
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const idx = availableTimes.findIndex(t => t === timeInput)
                    if (idx !== -1) {
                      setCurrentTimeIndex(idx)
                    } else {
                      // find closest
                      let closestIdx = currentTimeIndex;
                      let minDiff = Infinity;
                      const [h, m] = timeInput.split(':');
                      if (h !== undefined && m !== undefined) {
                          const inputMins = parseInt(h) * 60 + parseInt(m);
                          availableTimes.forEach((t, i) => {
                              const [th, tm] = t.split(':');
                              const tMins = parseInt(th) * 60 + parseInt(tm);
                              const diff = Math.abs(tMins - inputMins);
                              if (diff < minDiff) {
                                  minDiff = diff;
                                  closestIdx = i;
                              }
                          });
                      }
                      setCurrentTimeIndex(closestIdx);
                      setTimeInput(availableTimes[closestIdx]);
                    }
                  }
                }}
                onBlur={() => {
                    const idx = availableTimes.findIndex(t => t === timeInput)
                    if (idx !== -1) {
                      setCurrentTimeIndex(idx)
                    } else {
                      let closestIdx = currentTimeIndex;
                      let minDiff = Infinity;
                      const [h, m] = timeInput.split(':');
                      if (h !== undefined && m !== undefined) {
                          const inputMins = parseInt(h) * 60 + parseInt(m);
                          availableTimes.forEach((t, i) => {
                              const [th, tm] = t.split(':');
                              const tMins = parseInt(th) * 60 + parseInt(tm);
                              const diff = Math.abs(tMins - inputMins);
                              if (diff < minDiff) {
                                  minDiff = diff;
                                  closestIdx = i;
                              }
                          });
                      }
                      setCurrentTimeIndex(closestIdx);
                      setTimeInput(availableTimes[closestIdx]);
                    }
                }}
                style={{ height: 34, boxSizing: 'border-box', padding: '0 8px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', fontWeight: 600, color: '#0f172a', width: 60, textAlign: 'center', fontFamily: 'inherit', fontSize: 'inherit' }}
             />
             <button
                onClick={() => setCurrentTimeIndex(prev => prev < availableTimes.length - 1 ? prev + 1 : prev)}
                disabled={currentTimeIndex === availableTimes.length - 1}
                style={{ height: 34, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', borderRadius: 6, border: '1px solid var(--border)', background: currentTimeIndex < availableTimes.length - 1 ? '#fff' : '#f1f5f9', cursor: currentTimeIndex < availableTimes.length - 1 ? 'pointer' : 'not-allowed', color: currentTimeIndex < availableTimes.length - 1 ? '#334155' : '#94a3b8' }}
             >
                ▶
             </button>
          </div>
        )}

        {/* Fixed Range Config */}
        <div style={{ marginLeft: 8, height: 34, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 4, background: '#f1f5f9', padding: '0 8px', borderRadius: 8, border: '1px solid var(--border)' }}>
          <input 
             type="color"
             value={colorMin}
             onChange={e => setColorMin(e.target.value)}
             style={{ width: 24, height: 24, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
             title="Cor Mínima"
          />
          <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>MIN:</span>
          <input 
             type="number"
             value={fixedMin}
             onChange={e => setFixedMin(e.target.value)}
             placeholder="Auto"
             style={{ width: 80, padding: '2px 4px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 12 }}
          />
          <input 
             type="color"
             value={colorMid}
             onChange={e => setColorMid(e.target.value)}
             style={{ width: 24, height: 24, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', marginLeft: 4 }}
             title="Cor Intermediária"
          />
          <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginLeft: 4 }}>MAX:</span>
          <input 
             type="number"
             value={fixedMax}
             onChange={e => setFixedMax(e.target.value)}
             placeholder="Auto"
             style={{ width: 80, padding: '2px 4px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 12 }}
          />
          <input 
             type="color"
             value={colorMax}
             onChange={e => setColorMax(e.target.value)}
             style={{ width: 24, height: 24, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', marginLeft: 4 }}
             title="Cor Máxima"
          />
        </div>
      </div>
    )
  }

  const generateGif = async () => {
    setIsGeneratingGif(true)
    setShowGifMenu(false)
    
    let loopArray = []
    
    if (mapMode === 'instant') {
      const sIdx = Math.min(gifConfig.startIdx, gifConfig.endIdx)
      const eIdx = Math.max(gifConfig.startIdx, gifConfig.endIdx)
      loopArray = availableTimes.slice(sIdx, eIdx + 1)
    } else {
      const sIdx = Math.min(gifConfig.startIdx, gifConfig.endIdx)
      const eIdx = Math.max(gifConfig.startIdx, gifConfig.endIdx)
      loopArray = fetchedDates.slice(sIdx, eIdx + 1)
    }

    if (loopArray.length === 0) {
      alert("Nenhum intervalo selecionado.")
      setIsGeneratingGif(false)
      return
    }

    setGifProgress({ current: 0, total: loopArray.length, rendering: false })

    const gif = new GIF({
      workers: 2,
      quality: 20,
      workerScript: '/gif.worker.js'
    })

    const originalTimeIndex = currentTimeIndex
    const originalSelectedDates = [...selectedDates]

    try {
      for (let i = 0; i < loopArray.length; i++) {
        if (mapMode === 'instant') {
          const tIdx = availableTimes.indexOf(loopArray[i])
          setCurrentTimeIndex(tIdx)
        } else {
          setSelectedDates([loopArray[i]])
        }
        
        // Espera dados e renderização do canvas
        await new Promise(resolve => setTimeout(resolve, 800))
        
        if (!tableRef.current) continue;
        
        const canvas = await html2canvas(tableRef.current, {
          scale: 1,
          useCORS: true,
          backgroundColor: '#f8fafc',
          windowWidth: tableRef.current.scrollWidth,
          windowHeight: tableRef.current.scrollHeight
        })
        
        gif.addFrame(canvas, { delay: Number(gifConfig.delay) })
        setGifProgress({ current: i + 1, total: loopArray.length, rendering: false })
      }

      setGifProgress(p => ({ ...p, rendering: true }))
      
      gif.on('finished', function(blob) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `Mapa_${mapMode}.gif`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        
        setIsGeneratingGif(false)
        if (mapMode === 'instant') setCurrentTimeIndex(originalTimeIndex)
        else setSelectedDates(originalSelectedDates)
      })

      gif.render()

    } catch (err) {
      console.error(err)
      setIsGeneratingGif(false)
      if (mapMode === 'instant') setCurrentTimeIndex(originalTimeIndex)
      else setSelectedDates(originalSelectedDates)
      alert("Erro ao gerar GIF")
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '10px 0' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
         <div style={{ display: 'flex', alignItems: 'center', height: 34, boxSizing: 'border-box', background: '#ffffff', border: '1px solid var(--border)', borderRadius: 8, padding: '0 3px', gap: 2 }}>
            {[
              { id: 'integral', label: 'Energia' },
              { id: 'yield', label: 'Yield' },
              { id: 'kwp', label: 'kWp' },
              { id: 'desvio', label: 'Desvio' },
              { id: 'desvioMax', label: 'Desvio Máx' }
            ].map(m => {
              const isSelected = metricType === m.id
              return (
                <button
                  key={m.id}
                  onClick={() => setMetricType(m.id)}
                  style={{
                    height: 26,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 12px',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: isSelected ? 600 : 500,
                    cursor: 'pointer',
                    border: 'none',
                    color: isSelected ? '#ea580c' : '#64748b',
                    background: isSelected ? '#fff7ed' : 'transparent',
                    transition: 'all 0.2s'
                  }}
                >
                  {m.label}
                </button>
              )
            })}
         </div>

         <div style={{ position: 'relative' }}>
             <button
                 onClick={() => setShowGridMenu(!showGridMenu)}
                 style={{
                     height: 34,
                     boxSizing: 'border-box',
                     padding: '0 12px',
                     borderRadius: 6,
                     fontSize: 13,
                     fontWeight: 600,
                     cursor: 'pointer',
                     border: '1px solid var(--border)',
                     background: '#f8fafc',
                     color: '#64748b',
                     display: 'flex',
                     alignItems: 'center',
                     gap: 6
                 }}
                 title="Opções de Grid"
             >
                 # Grid ▾
             </button>

             {showGridMenu && (
                 <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 8, zIndex: 50, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 140 }}>
                     <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>Mostrar Grid</div>
                     {[
                       {id: 'skid', label: 'Skid', color: '#000000'}, 
                       {id: 'inversor', label: 'Inversor', color: '#38bdf8'}, 
                       {id: 'stringbox', label: 'Stringbox', color: '#9333ea'},
                       {id: 'string', label: 'String', color: '#94a3b8'}
                     ].map(grp => {
                         const isActive = highlights[grp.id]
                         return (
                         <button 
                             key={grp.id}
                             onClick={() => setHighlights(prev => ({ ...prev, [grp.id]: !prev[grp.id] }))}
                             title={`Habilitar/Desabilitar marcação de ${grp.label}`}
                             style={{ 
                                 padding: '6px 10px', 
                                 borderRadius: 4, 
                                 fontSize: 13, 
                                 fontWeight: isActive ? 600 : 500, 
                                 cursor: 'pointer', 
                                 border: isActive ? `1px solid ${grp.color}` : '1px solid transparent', 
                                 background: isActive ? grp.color : '#f1f5f9', 
                                 color: isActive ? '#ffffff' : '#334155', 
                                 transition: 'all 0.2s',
                                 textAlign: 'left'
                             }}
                         >
                             {grp.label}
                         </button>
                     )})}
                 </div>
             )}
         </div>
         
         {renderDateSelector()}

         {/* Seletor de série para o gráfico otimizado */}
         <div style={{ marginLeft: 8, position: 'relative', display: 'flex', alignItems: 'center' }}>
             <button 
                 title={selectedChartSeries ? `Série Selecionada: ${selectedChartSeries}` : 'Selecionar série para o gráfico'}
                 style={{ height: 34, boxSizing: 'border-box', padding: '0 10px', borderRadius: 6, border: '1px solid var(--border)', background: selectedChartSeries ? '#eff6ff' : '#f8fafc', fontSize: 13, fontWeight: 600, color: selectedChartSeries ? '#3b82f6' : '#64748b', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', outline: 'none' }}
             >
                 📈 {selectedChartSeries ? 'Série ▾' : 'Série ▾'}
             </button>
             <select 
                 value={selectedChartSeries}
                 onChange={e => setSelectedChartSeries(e.target.value)}
                 title={selectedChartSeries || 'Selecione a série...'}
                 style={{ position: 'absolute', opacity: 0, inset: 0, width: '100%', height: '100%', cursor: 'pointer' }}
             >
                 <option value="">Selecione a série...</option>
                 {layout && layout.length > 0 && Array.from(new Set(layout.map(l => l.label).filter(l => !l.startsWith('#')))).sort().map(s => (
                     <option key={s} value={s}>{s}</option>
                 ))}
             </select>
         </div>

         <div style={{ marginLeft: 'auto' }} />

          <button
            className="btn btn-primary"
            style={{ padding: '6px 16px', flexShrink: 0, fontWeight: 600 }}
            onClick={() => load()}
            disabled={loading || !dates}
          >
            {loading ? '⏳ Processando...' : '⚡ Processar'}
          </button>

          {aggregatedStats && !loading && (
            <div style={{ position: 'relative', display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-secondary"
                style={{ height: 34, boxSizing: 'border-box', padding: '0 16px', flexShrink: 0, fontWeight: 600, background: '#e2e8f0', color: '#1e293b', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px' }}
                onClick={() => { setShowExportMenu(!showExportMenu); setShowGifMenu(false); }}
                title="Opções de Exportação"
              >
                📥 Exportar ▾
              </button>
              
              {showExportMenu && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 8, zIndex: 50, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
                  <button 
                    onClick={() => { setShowExportMenu(false); exportTableToPng(tableRef.current, 'Mapa.png', { scale: 4 }) }} 
                    style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', border: 'none', background: 'transparent', textAlign: 'left', color: '#334155', fontWeight: 500, borderRadius: 4 }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    🖼️ Imagem (PNG)
                  </button>
                  <button 
                    onClick={() => { setShowExportMenu(false); exportTableToPdf(tableRef.current, 'Mapa.pdf', { forceOrientation: 'p', usinaName: usina || 'N/D', scale: 4 }) }} 
                    style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', border: 'none', background: 'transparent', textAlign: 'left', color: '#334155', fontWeight: 500, borderRadius: 4 }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    📄 PDF (Retrato)
                  </button>
                  <button 
                    onClick={() => { setShowExportMenu(false); exportTableToPdf(tableRef.current, 'Mapa.pdf', { forceOrientation: 'l', usinaName: usina || 'N/D', scale: 4 }) }} 
                    style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', border: 'none', background: 'transparent', textAlign: 'left', color: '#334155', fontWeight: 500, borderRadius: 4 }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    🗎 PDF (Paisagem)
                  </button>
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }}></div>
                  <button 
                    onClick={() => { setShowExportMenu(false); setShowGifMenu(true); }} 
                    style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', border: 'none', background: 'transparent', textAlign: 'left', color: '#334155', fontWeight: 500, borderRadius: 4 }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    🎥 Animação (GIF)...
                  </button>
                </div>
              )}

              {showGifMenu && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 12, zIndex: 50, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 240 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Configurar GIF ({mapMode === 'instant' ? 'Horários' : 'Dias'})</div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>INÍCIO</label>
                    <select 
                      value={gifConfig.startIdx}
                      onChange={e => setGifConfig({...gifConfig, startIdx: Number(e.target.value)})}
                      style={{ padding: '6px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 13 }}
                    >
                      {mapMode === 'instant' 
                        ? availableTimes.map((t, i) => <option key={i} value={i}>{t}</option>)
                        : fetchedDates.map((d, i) => <option key={i} value={i}>{d}</option>)
                      }
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>FIM</label>
                    <select 
                      value={gifConfig.endIdx}
                      onChange={e => setGifConfig({...gifConfig, endIdx: Number(e.target.value)})}
                      style={{ padding: '6px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 13 }}
                    >
                      {mapMode === 'instant' 
                        ? availableTimes.map((t, i) => <option key={i} value={i}>{t}</option>)
                        : fetchedDates.map((d, i) => <option key={i} value={i}>{d}</option>)
                      }
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>TEMPO POR QUADRO</label>
                    <select 
                      value={gifConfig.delay}
                      onChange={e => setGifConfig({...gifConfig, delay: Number(e.target.value)})}
                      style={{ padding: '6px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 13 }}
                    >
                      <option value={200}>Muito Rápido (200ms)</option>
                      <option value={500}>Rápido (500ms)</option>
                      <option value={1000}>Normal (1 segundo)</option>
                      <option value={2000}>Lento (2 segundos)</option>
                    </select>
                  </div>

                  <button 
                    onClick={generateGif}
                    disabled={isGeneratingGif}
                    style={{ padding: '8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600, cursor: isGeneratingGif ? 'not-allowed' : 'pointer', marginTop: 4, opacity: isGeneratingGif ? 0.7 : 1 }}
                  >
                    {isGeneratingGif ? 'Gerando...' : '▶ Gerar GIF'}
                  </button>
                </div>
              )}
            </div>
          )}
       </div>

      {error && <ErrorState message={error} />}
      {!loading && !error && mapData.cells.length === 0 && (
         <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: 8 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🗺️</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Nenhum layout de Mapa encontrado</div>
            Faça o upload do seu arquivo Excel com o formato do grid na página de <strong>Configurações da Usina {'>'} Mapa de Strings</strong>.
         </div>
      )}

      {mapData.cells.length > 0 && (
        <div style={{ display: 'flex', flex: 1, gap: 16, minHeight: 0 }}>
          <div style={{ overflow: 'auto', display: 'flex', alignItems: 'flex-start' }}>
            <div ref={tableRef} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 'max-content', background: 'var(--bg-secondary)', borderRadius: 8, padding: 16 }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', width: '100%', boxSizing: 'border-box' }}>
             <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)', whiteSpace: 'nowrap', marginRight: 16 }}>Mapa de Strings</h3>
             <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '8px 24px', fontSize: 13, color: 'var(--text-secondary)' }}>
                {(highlights.skid || highlights.inversor || highlights.stringbox || highlights.string) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <strong>GRID:</strong>
                    {highlights.skid && <div style={{ display: 'inline-block', padding: '4px 8px', background: '#000000', color: '#ffffff', fontSize: 11, fontWeight: 600, borderRadius: 4, textAlign: 'center' }}>Skid</div>}
                    {highlights.inversor && <div style={{ display: 'inline-block', padding: '4px 8px', background: '#38bdf8', color: '#ffffff', fontSize: 11, fontWeight: 600, borderRadius: 4, textAlign: 'center' }}>Inversor</div>}
                    {highlights.stringbox && <div style={{ display: 'inline-block', padding: '4px 8px', background: '#9333ea', color: '#ffffff', fontSize: 11, fontWeight: 600, borderRadius: 4, textAlign: 'center' }}>Stringbox</div>}
                    {highlights.string && <div style={{ display: 'inline-block', padding: '4px 8px', background: '#94a3b8', color: '#ffffff', fontSize: 11, fontWeight: 600, borderRadius: 4, textAlign: 'center' }}>String</div>}
                  </div>
                )}
                <div>
                  <strong>Data:</strong> {selectedDates.join(', ')} 
                  {mapMode === 'instant' && availableTimes[currentTimeIndex] ? ` às ${availableTimes[currentTimeIndex]}` : ''}
                </div>
                <div>
                  <strong>Variável:</strong> {
                     mapMode === 'instant' ? 'Potência (W)' :
                     metricType === 'integral' ? 'Energia' :
                     metricType === 'yield' ? 'Yield' :
                     metricType === 'desvio' ? 'Desvio' : 'kWp'
                  } <span style={{ color: '#64748b' }}>({mapMode === 'instant' ? 'Instantâneo' : 'Integral Diária'})</span>
                </div>
             </div>
           </div>
           
           {/* Horizontal Legend */}
           <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 24, padding: '0 0 12px 0', borderBottom: '1px solid var(--border)', width: '100%' }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#64748b' }}>LEGENDA</div>
              
              <div style={{ display: 'flex', flex: 1, minWidth: 400, flexDirection: 'column', position: 'relative', height: 32, justifyContent: 'flex-end' }}>
                 <div style={{ position: 'relative', width: '100%', height: 16 }}>
                      {(() => {
                         const labels = []
                         const range = mapData.currentMax - mapData.currentMin
                         if (range <= 0 || isNaN(range)) return null
                         
                         let step = 1000
                         if (metricType === 'desvio' || metricType === 'desvioMax') {
                             step = 5
                         } else if (metricType === 'integral') {
                             step = 10000
                         } else if (metricType === 'yield') {
                             step = 500
                         } else {
                             const targetTicks = 10
                             const rawStep = range / targetTicks
                             const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep || 1)))
                             const normalized = rawStep / Math.max(magnitude, Number.EPSILON)
                             
                             if (normalized <= 1.5) step = 1 * magnitude
                             else if (normalized <= 3) step = 2 * magnitude
                             else if (normalized <= 7) step = 5 * magnitude
                             else step = 10 * magnitude
                         }
                         
                         const start = Math.ceil(mapData.currentMin / step) * step
                         const end = Math.floor(mapData.currentMax / step) * step
                         
                         for (let v = start; v <= end; v += step) {
                             const p = ((v - mapData.currentMin) / range) * 100
                             // Aumentado de 4/96 para 8/92 para não sobrepor os labels laterais (min/max)
                             if (p < 8 || p > 92) continue
                             
                             labels.push(
                                <div key={v} style={{ position: 'absolute', left: `${p}%`, transform: 'translateX(-50%)', bottom: 2, fontSize: 11, color: '#475569', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                    {v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}{(metricType === 'desvio' || metricType === 'desvioMax') ? '%' : ''}
                                </div>
                             )
                         }
                         
                         labels.push(
                             <div key="min" style={{ position: 'absolute', left: 0, bottom: 2, fontSize: 11, color: '#0f172a', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                 {mapData.currentMin.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}{(metricType === 'desvio' || metricType === 'desvioMax') ? '%' : ''}
                             </div>
                         )
                         labels.push(
                             <div key="max" style={{ position: 'absolute', right: 0, bottom: 2, fontSize: 11, color: '#0f172a', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                 {mapData.currentMax.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}{(metricType === 'desvio' || metricType === 'desvioMax') ? '%' : ''}
                             </div>
                         )
                         
                         return labels
                      })()}
                 </div>
                 <div style={{
                     width: '100%',
                     height: 12,
                     background: (metricType === 'desvio' || metricType === 'desvioMax')
                         ? 'linear-gradient(to right, #ff0000 0%, #f8696b 60%, #ffeb84 80%, #63be7b 100%)'
                         : `linear-gradient(to right, ${colorMin}, ${colorMid}, ${colorMax})`,
                     borderRadius: 4,
                     boxShadow: 'inset 0 0 4px rgba(0,0,0,0.1)'
                 }} />
              </div>
           </div>

           <div style={{ display: 'flex', flexDirection: 'row', gap: 20 }}>
             <div style={{ 
                 display: 'grid', 
               gridTemplateColumns: `repeat(${mapData.maxCol + 1}, 6px)`,
               gridAutoRows: 'max-content',
               gap: 0,
               width: 'max-content',
               alignItems: 'stretch'
           }}>
              {mapData.cells.map((cell, i) => {
                 let bTop = 'none', bRight = 'none', bBottom = 'none', bLeft = 'none';
                 let baseBorder = (cell.val != null && highlights.string) ? '1px solid rgba(0,0,0,0.1)' : 'none';
                 bTop = bRight = bBottom = bLeft = baseBorder;
                 
                 const top = (mapData.grid[cell.row - 1] || {})[cell.col];
                 const bottom = (mapData.grid[cell.row + 1] || {})[cell.col];
                 const left = (mapData.grid[cell.row] || {})[cell.col - 1];
                 const right = (mapData.grid[cell.row] || {})[cell.col + 1];

                 if (highlights.stringbox && !cell.isSpacer && cell.stringbox) {
                     const borderStyle = '1px solid #9333ea';
                     if (!top || top.isSpacer || top.stringbox !== cell.stringbox) bTop = borderStyle;
                     if (!bottom || bottom.isSpacer || bottom.stringbox !== cell.stringbox) bBottom = borderStyle;
                     if (!left || left.isSpacer || left.stringbox !== cell.stringbox) bLeft = borderStyle;
                     if (!right || right.isSpacer || right.stringbox !== cell.stringbox) bRight = borderStyle;
                 }

                 if (highlights.inversor && !cell.isSpacer && cell.inversor) {
                     const borderStyle = '1px solid #38bdf8';
                     if (!top || top.isSpacer || top.inversor !== cell.inversor) bTop = borderStyle;
                     if (!bottom || bottom.isSpacer || bottom.inversor !== cell.inversor) bBottom = borderStyle;
                     if (!left || left.isSpacer || left.inversor !== cell.inversor) bLeft = borderStyle;
                     if (!right || right.isSpacer || right.inversor !== cell.inversor) bRight = borderStyle;
                 }

                 if (highlights.skid && !cell.isSpacer && cell.skid) {
                     const borderStyle = '1px solid #000000';
                     if (!top || top.isSpacer || top.skid !== cell.skid) bTop = borderStyle;
                     if (!bottom || bottom.isSpacer || bottom.skid !== cell.skid) bBottom = borderStyle;
                     if (!left || left.isSpacer || left.skid !== cell.skid) bLeft = borderStyle;
                     if (!right || right.isSpacer || right.skid !== cell.skid) bRight = borderStyle;
                 }
                 
                 return (
                 <div key={i} title={cell.isSpacer ? undefined : `${cell.label}\nValor: ${cell.val != null ? cell.val.toFixed(2) : 'N/D'}`} style={{
                    gridRow: cell.row + 1,
                    gridColumn: cell.col + 1,
                    background: cell.color,
                    borderTop: bTop,
                    borderRight: bRight,
                    borderBottom: bBottom,
                    borderLeft: bLeft,
                    boxSizing: 'border-box',
                    minHeight: cell.isSpacer ? '4px' : '22px',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    cursor: 'pointer'
                 }}>
                 </div>
              )})}
           </div>
           
           </div>
          </div>
        </div>

        {/* Coluna Direita (Gráficos) */}
        <div style={{ flex: 1, minWidth: 300, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'auto' }}>
           {/* Gráfico 1: Série Temporal */}
           <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: 16, minHeight: 350, flexShrink: 0 }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
             <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>Análise de Série Temporal</h3>
             {chartData && selectedChartSeries && (
               <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#475569' }}>
                 <div style={{ width: 14, height: 3, background: '#3b82f6', borderRadius: 2 }}></div>
                 {selectedChartSeries}
               </div>
             )}
           </div>
           
           <div style={{ flex: 1, background: '#f8fafc', borderRadius: 6, border: chartData ? 'none' : '2px dashed #cbd5e1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b', padding: chartData ? 0 : 24, textAlign: 'center', minHeight: 200, position: 'relative' }}>
              {chartLoading && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontWeight: 600, color: '#3b82f6' }}>⏳ Carregando gráfico...</span>
                  </div>
              )}
              
              {!chartData && !chartLoading && (
                <>
                  <span style={{ fontSize: 32, marginBottom: 8 }}>📈</span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Área Reservada para o Gráfico</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12, alignItems: 'center', fontSize: 12 }}>
                      <div style={{ background: '#e2e8f0', padding: '4px 8px', borderRadius: 4 }}>
                          Série selecionada: <strong>{selectedChartSeries || '[Nenhuma selecionada]'}</strong>
                      </div>
                      <div style={{ background: '#e2e8f0', padding: '4px 8px', borderRadius: 4 }}>
                          Dia exibido: <strong>{selectedDates.length === 1 ? selectedDates[0] : (selectedDates.length === 0 ? 'Nenhum' : 'Múltiplos')}</strong>
                      </div>
                      {mapMode === 'instant' && selectedDates.length === 1 && availableTimes[currentTimeIndex] && (
                          <div style={{ background: '#ffedd5', color: '#ea580c', border: '1px solid #fdba74', padding: '4px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ea580c' }}></div>
                              Destacar Ponto: <strong>{availableTimes[currentTimeIndex]}</strong>
                          </div>
                      )}
                  </div>
                </>
              )}
              
              {chartData && chartData.series && chartData.series[selectedChartSeries] && (
                 <Plot 
                   data={[
                     {
                       x: chartData.timestamps,
                       y: chartData.series[selectedChartSeries],
                       type: 'scatter',
                       mode: 'lines',
                       line: { color: '#3b82f6', width: 2 },
                       name: selectedChartSeries,
                       showlegend: false
                     },
                     ...(mapMode === 'instant' && availableTimes[currentTimeIndex] ? [{
                         x: chartData.timestamps.filter(t => t.includes(` ${availableTimes[currentTimeIndex]}:`) || t.includes(`T${availableTimes[currentTimeIndex]}:`)),
                         y: chartData.series[selectedChartSeries].filter((v, i) => chartData.timestamps[i].includes(` ${availableTimes[currentTimeIndex]}:`) || chartData.timestamps[i].includes(`T${availableTimes[currentTimeIndex]}:`)),
                         type: 'scatter',
                         mode: 'markers',
                         marker: { color: '#ea580c', size: 10, line: { color: 'white', width: 2 } },
                         showlegend: false,
                         hoverinfo: 'skip'
                     }] : [])
                   ]}
                   layout={{
                     margin: { t: 10, r: 10, l: 40, b: 30 },
                     autosize: true,
                     xaxis: { type: 'date', tickformat: '%H:%M' },
                     yaxis: { automargin: true },
                     paper_bgcolor: 'transparent',
                     plot_bgcolor: 'transparent'
                   }}
                   style={{ width: '100%', height: '100%' }}
                   useResizeHandler={true}
                 />
              )}
           </div>
           </div>

           {/* Gráfico 2: Distribuição de Frequência */}
           <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: 16, minHeight: 350, flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                 <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>Distribuição de Valores (Potência CC)</h3>
                 <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569' }}>
                    <label style={{ fontWeight: 500 }}>Agrupar a cada:</label>
                    <select 
                       value={histogramBinSize} 
                       onChange={(e) => setHistogramBinSize(Number(e.target.value))}
                       style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: '#fff', fontSize: 13, color: '#0f172a', cursor: 'pointer', outline: 'none' }}
                    >
                       <option value={100}>100</option>
                       <option value={250}>250</option>
                       <option value={500}>500</option>
                       <option value={1000}>1000</option>
                       <option value={2000}>2000</option>
                       <option value={5000}>5000</option>
                    </select>
                 </div>
              </div>
              <div style={{ flex: 1, minHeight: 200, position: 'relative' }}>
                 {histogramValues.length === 0 ? (
                   <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                      Nenhum dado de Potência CC disponível
                   </div>
                 ) : (
                   <Plot 
                     data={[{
                         x: histogramValues,
                         type: 'histogram',
                         xbins: { size: histogramBinSize },
                         marker: { color: '#8b5cf6', line: { color: '#fff', width: 1 } },
                         name: 'Frequência'
                     }]}
                     layout={{
                       margin: { t: 10, r: 10, l: 40, b: 40 },
                       autosize: true,
                       xaxis: { 
                           title: `Valores (Agrupados a cada ${histogramBinSize})`, 
                           tickformat: 'd',
                           range: histogramRange || [0, (aggregatedStats?.metricRanges?.['integral']?.max || 30000) * 1.05]
                       },
                       yaxis: { title: 'Qtd. de Séries' },
                       paper_bgcolor: 'transparent',
                       plot_bgcolor: 'transparent',
                       bargap: 0.1
                     }}
                     onRelayout={(e) => {
                         if (e['xaxis.range[0]'] !== undefined && e['xaxis.range[1]'] !== undefined) {
                             setHistogramRange([e['xaxis.range[0]'], e['xaxis.range[1]']]);
                         } else if (e['xaxis.autorange']) {
                             setHistogramRange(null);
                         }
                     }}
                     style={{ width: '100%', height: '100%' }}
                     useResizeHandler={true}
                   />
                 )}
              </div>
           </div>
        </div>
      </div>
      )}

      {isGeneratingGif && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(255,255,255,0.85)', zIndex: 999999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)', maxWidth: 400, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎞️</div>
            <h2 style={{ margin: '0 0 8px 0', fontSize: 20, color: '#0f172a' }}>
              {gifProgress.rendering ? 'Processando GIF...' : 'Capturando Quadros...'}
            </h2>
            <p style={{ margin: '0 0 24px 0', color: '#64748b', fontSize: 14 }}>
              {!gifProgress.rendering 
                ? `Renderizando o mapa para cada instante e gerando imagens. Quadro ${gifProgress.current} de ${gifProgress.total}`
                : 'Codificando o arquivo final de animação. Por favor aguarde, este processo pode levar alguns instantes...'}
            </p>
            
            <div style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ 
                width: gifProgress.rendering ? '100%' : `${(gifProgress.current / (gifProgress.total || 1)) * 100}%`, 
                height: '100%', 
                background: gifProgress.rendering ? '#10b981' : '#3b82f6', 
                transition: 'width 0.3s ease' 
              }} />
            </div>
            {gifProgress.rendering && <div style={{ fontSize: 12, color: '#10b981', marginTop: 8, fontWeight: 600 }}>Quase lá!</div>}
          </div>
        </div>
      )}
    </div>
  )
}
