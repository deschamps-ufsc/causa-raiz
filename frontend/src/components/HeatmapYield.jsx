import React, { useState, useEffect, useMemo, useRef } from 'react'
import { fetchPivotHeatmap, fetchSeries, fetchMappingData } from '../services/api'
import { exportTableToPdf, exportTableToPng } from '../utils/exportPdf'
import { generatePivotData, generateFlatRows } from '../utils/heatmapUtils'
import HeatmapTable from './HeatmapTable'
export default function HeatmapYield({ usina, dates, activeFilters = [] }) {
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [elemento, setElemento]   = useState('')
  const [allSeries, setAllSeries] = useState([])
  
  const colCat = 'skid'
  const rowCat1 = 'inversor'
  const rowCat2 = 'stringbox'
  const rowCat3 = 'tracker'

  const [showRows, setShowRows] = useState({
    inversor: true,
    stringbox: true,
    tracker: true,
    string: true
  })
  const toggleRow = (r) => setShowRows(prev => ({ ...prev, [r]: !prev[r] }))

  const [aggType, setAggType]     = useState('soma')
  const [visCols, setVisCols]     = useState({ variavel: true, kwp: false, valor: false, yield: true, desvio: true, desvioMax: false })
  
  // Estados para exportação agrupada
  const [groupedExportData, setGroupedExportData] = useState(null)
  const [groupedExportFormat, setGroupedExportFormat] = useState(null)
  const exportGroupRef = useRef(null)

  const [fetchedDates, setFetchedDates] = useState([])
  const [selectedDates, setSelectedDates] = useState([])
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showPdfMenu, setShowPdfMenu] = useState(false)
  const [showPngMenu, setShowPngMenu] = useState(false)

  const toggleCol = (col) => setVisCols(prev => ({ ...prev, [col]: !prev[col] }))
  const activeColsCount = Object.values(visCols).filter(Boolean).length

  // Estado para expandir a tabela na árvore
  const [expandedPaths, setExpandedPaths] = useState(new Set())
  const tableRef = useRef(null)

  const CAT_OPTIONS = [
    { label: 'SKID', value: 'skid' },
    { label: 'Estação', value: 'estacao' },
    { label: 'Inversor', value: 'inversor' },
    { label: 'Stringbox', value: 'stringbox' },
    { label: 'Tracker', value: 'tracker' },
  ]

  useEffect(() => {
    if (!usina || !dates) return
    // Busca séries do Parquet e complementa com o Mapeamento de Séries para incluir sintéticas
    Promise.all([
      fetchSeries(usina, dates).catch(() => []),
      fetchMappingData(usina).catch(() => ({})),
    ]).then(([parquetSeries, mapping]) => {
      const parquetKeys = new Set(parquetSeries.map(s => s.coluna))
      const extras = []
      Object.entries(mapping).forEach(([col, meta]) => {
        if (!parquetKeys.has(col) && meta.elemento) {
          extras.push({
            nome: col,
            elemento: meta.elemento,
            skid: meta.skid || '',
            inversor: meta.inversor || '',
            stringbox: meta.stringbox || '',
            estacao: meta.estacao || '',
            string: meta.string || '',
          })
        }
      })
      setAllSeries([...parquetSeries, ...extras])
    })
  }, [usina, dates])

  const isValid = (val) => val != null && String(val).trim() !== '' && String(val).toLowerCase() !== 'nan'

  const elementosOptions = useMemo(() => {
    if (!allSeries.length) return []
    const uniqueElements = [...new Set(allSeries.map(s => s.elemento).filter(el => el && el.toLowerCase() !== 'filtro'))].sort()
    
    return uniqueElements.map(el => {
      const count = allSeries.filter(s => s.elemento === el).length
      return { el, count }
    })
  }, [allSeries, rowCat1, colCat])

  useEffect(() => {
    if (elementosOptions.length > 0) {
      const currentOpt = elementosOptions.find(o => o.el === elemento)
      if (!currentOpt || currentOpt.count === 0) {
        const firstValid = elementosOptions.find(o => o.count > 0)
        setElemento(firstValid ? firstValid.el : '')
      }
    }
  }, [elementosOptions, elemento])

  const load = async (el) => {
    if (!usina || !dates) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetchPivotHeatmap(usina, dates, el ?? elemento, activeFilters)
      setData(res.records)
      setExpandedPaths(new Set()) // Reset expansions when data changes
      
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

  const handleGroupedExport = (format, mode = 'individuais') => {
    if (!selectedDates || selectedDates.length === 0) return
    setLoading(true)
    setTimeout(() => {
      try {
        const grouped = []
        if (mode === 'completa') {
          grouped.push({ date: topLeftMainText, pivotData, flatRows, isAggregated: selectedDates.length > 1 })
        }
        for (const d of selectedDates) {
          const pData = generatePivotData(data, [d], colCat, rowCat1, rowCat2, rowCat3, aggType, elemento)
          if (pData) {
            const fRows = generateFlatRows(pData, expandedPaths, showRows)
            grouped.push({ date: d, pivotData: pData, flatRows: fRows, isAggregated: false })
          }
        }
        setGroupedExportFormat(format)
        setGroupedExportData(grouped)
      } finally {
        setLoading(false)
      }
    }, 50)
  }

  useEffect(() => {
    if (groupedExportData && exportGroupRef.current) {
      setTimeout(async () => {
        try {
          if (groupedExportFormat === 'png') {
             await exportTableToPng(exportGroupRef.current, 'Integralizacao_Agrupada.png', { scale: 1 })
          } else {
             await exportTableToPdf(exportGroupRef.current, 'Integralizacao_Agrupada.pdf', { usinaName: usina || 'N/D', forceOrientation: 'p' })
          }
        } finally {
          setGroupedExportData(null)
          setGroupedExportFormat(null)
        }
      }, 500)
    }
  }, [groupedExportData, groupedExportFormat, usina])


  const pivotData = useMemo(() => {
    return generatePivotData(data, selectedDates, colCat, rowCat1, rowCat2, rowCat3, aggType, elemento)
  }, [data, selectedDates, colCat, rowCat1, rowCat2, rowCat3, aggType, elemento])

  // Acha a listagem flat exibida
  const flatRows = useMemo(() => {
    return generateFlatRows(pivotData, expandedPaths, showRows)
  }, [pivotData, expandedPaths, showRows])

  const toggleExpand = (path) => {
    const newExpanded = new Set(expandedPaths)
    if (newExpanded.has(path)) newExpanded.delete(path)
    else newExpanded.add(path)
    setExpandedPaths(newExpanded)
  }

  const topLeftMainText = useMemo(() => {
    if (!selectedDates || selectedDates.length === 0) return 'Navegação'
    if (selectedDates.length === 1) return selectedDates[0]
    return `${selectedDates.length} Dias`
  }, [selectedDates])

  const fmt = v => v != null ? v.toFixed(3) : '-'
  const fmtP = (v, mean) => {
    if (v == null || !mean) return '-'
    const p = (v / mean - 1) * 100
    const sign = p > 0 ? '+' : ''
    return `${sign}${p.toFixed(1)}%`
  }

  if (!usina || !dates) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '60px 20px', color: 'var(--text-muted)', textAlign: 'center' }}>
        <span style={{ fontSize: 48 }}>📊</span>
        <strong style={{ color: 'var(--text-secondary)', fontSize: 15 }}>Selecione uma ou mais datas no painel esquerdo</strong>
      </div>
    )
  }

  const handleNextDay = () => {
    if (selectedDates.length !== 1) return
    const idx = fetchedDates.indexOf(selectedDates[0])
    if (idx < fetchedDates.length - 1) {
      setSelectedDates([fetchedDates[idx + 1]])
    }
  }

  const handlePrevDay = () => {
    if (selectedDates.length !== 1) return
    const idx = fetchedDates.indexOf(selectedDates[0])
    if (idx > 0) {
      setSelectedDates([fetchedDates[idx - 1]])
    }
  }
  
  const toggleDateSelection = (d) => {
    if (selectedDates.includes(d)) {
      setSelectedDates(prev => prev.filter(x => x !== d))
    } else {
      setSelectedDates(prev => [...prev, d].sort())
    }
  }

  const renderDateSelector = () => {
    if (!fetchedDates || fetchedDates.length === 0) return null
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
            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: hasPrev ? '#fff' : '#f1f5f9', cursor: hasPrev ? 'pointer' : 'not-allowed', color: hasPrev ? '#334155' : '#94a3b8' }}
          >
            ◀
          </button>
        )}
        
        <div style={{ position: 'relative' }}>
          <button 
            onClick={() => setShowDatePicker(!showDatePicker)}
            style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#0f172a', minWidth: 100 }}
          >
            {selectedDates.length === 1 ? selectedDates[0] : `${selectedDates.length} dias`}
          </button>
          
          {showDatePicker && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 8, zIndex: 50, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 150 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>Filtrar Dias Processados</div>
              {fetchedDates.map(d => (
                <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}>
                  <input 
                    type="checkbox" 
                    checked={selectedDates.includes(d)} 
                    onChange={() => toggleDateSelection(d)}
                  />
                  {d}
                </label>
              ))}
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                 <button onClick={() => setSelectedDates([...fetchedDates])} style={{ flex: 1, padding: 4, fontSize: 11, cursor: 'pointer', border: '1px solid var(--border)', background: '#f1f5f9', borderRadius: 4 }}>Todos</button>
                 <button onClick={() => setSelectedDates([])} style={{ flex: 1, padding: 4, fontSize: 11, cursor: 'pointer', border: '1px solid var(--border)', background: '#f1f5f9', borderRadius: 4 }}>Nenhum</button>
              </div>
            </div>
          )}
        </div>

        {isSingle && (
          <button 
            onClick={handleNextDay} 
            disabled={!hasNext}
            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: hasNext ? '#fff' : '#f1f5f9', cursor: hasNext ? 'pointer' : 'not-allowed', color: hasNext ? '#334155' : '#94a3b8' }}
          >
            ▶
          </button>
        )}
        <div style={{ width: 1, height: 20, backgroundColor: 'var(--border)', margin: '0 4px' }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>

      {/* Controles Dinâmicos */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, flexShrink: 0 }}>
        
        {renderDateSelector()}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>Linhas:</span>
          <div style={{ display: 'flex', background: '#ffffff', border: '1px solid var(--border)', borderRadius: 8, padding: 3, gap: 2 }}>
            <button
              onClick={() => toggleRow('inversor')}
              style={{ padding: '4px 12px', borderRadius: 6, fontSize: 13, fontWeight: showRows.inversor ? 600 : 500, cursor: 'pointer', border: 'none', color: showRows.inversor ? '#ea580c' : '#64748b', background: showRows.inversor ? '#fff7ed' : 'transparent', transition: 'all 0.2s' }}
            >
              Inversor
            </button>
            <button
              onClick={() => toggleRow('stringbox')}
              style={{ padding: '4px 12px', borderRadius: 6, fontSize: 13, fontWeight: showRows.stringbox ? 600 : 500, cursor: 'pointer', border: 'none', color: showRows.stringbox ? '#ea580c' : '#64748b', background: showRows.stringbox ? '#fff7ed' : 'transparent', transition: 'all 0.2s' }}
            >
              Stringbox
            </button>
            <button
              onClick={() => toggleRow('tracker')}
              style={{ padding: '4px 12px', borderRadius: 6, fontSize: 13, fontWeight: showRows.tracker ? 600 : 500, cursor: 'pointer', border: 'none', color: showRows.tracker ? '#ea580c' : '#64748b', background: showRows.tracker ? '#fff7ed' : 'transparent', transition: 'all 0.2s' }}
            >
              Tracker
            </button>
            <button
              onClick={() => toggleRow('string')}
              style={{ padding: '4px 12px', borderRadius: 6, fontSize: 13, fontWeight: showRows.string ? 600 : 500, cursor: 'pointer', border: 'none', color: showRows.string ? '#ea580c' : '#64748b', background: showRows.string ? '#fff7ed' : 'transparent', transition: 'all 0.2s' }}
            >
              String
            </button>
          </div>
        </div>

        <div style={{ width: 1, height: 20, backgroundColor: 'var(--border)', margin: '0 4px' }} />
        
        <span style={{ fontSize: 13, fontWeight: 600, color: '#38bdf8', marginLeft: 4 }}>Op:</span>
        <select className="input" style={{ width: 80, padding: '4px 8px' }} value={aggType} onChange={e => setAggType(e.target.value)}>
          <option value="soma">Soma</option>
          <option value="media">Média</option>
        </select>
        
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Elemento:</span>
        <select
          className="input"
          style={{ padding: '4px 28px 4px 8px', width: 'auto', maxWidth: 400 }}
          value={elemento}
          onChange={e => setElemento(e.target.value)}
        >
          <option value="" disabled>— sem séries disponíveis —</option>
          {elementosOptions.map(o => (
            <option key={o.el} value={o.el} disabled={o.count === 0}>
              {o.el} ({o.count > 0 ? `${o.count} séries` : '0 séries'})
            </option>
          ))}
        </select>

        <div style={{ marginLeft: 'auto' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>Colunas:</span>
          <div style={{ display: 'flex', background: '#ffffff', border: '1px solid var(--border)', borderRadius: 8, padding: 3, gap: 2 }}>
            <button
              onClick={() => toggleCol('variavel')}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: visCols.variavel ? 600 : 500,
                cursor: 'pointer',
                border: 'none',
                color: visCols.variavel ? '#ea580c' : '#64748b',
                background: visCols.variavel ? '#fff7ed' : 'transparent',
                transition: 'all 0.2s'
              }}
            >
              Série
            </button>
            <button
              onClick={() => toggleCol('kwp')}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: visCols.kwp ? 600 : 500,
                cursor: 'pointer',
                border: 'none',
                color: visCols.kwp ? '#ea580c' : '#64748b',
                background: visCols.kwp ? '#fff7ed' : 'transparent',
                transition: 'all 0.2s'
              }}
            >
              kWp
            </button>
            <button
              onClick={() => toggleCol('valor')}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: visCols.valor ? 600 : 500,
                cursor: 'pointer',
                border: 'none',
                color: visCols.valor ? '#ea580c' : '#64748b',
                background: visCols.valor ? '#fff7ed' : 'transparent',
                transition: 'all 0.2s'
              }}
            >
              Valor
            </button>
            <button
              onClick={() => toggleCol('yield')}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: visCols.yield ? 600 : 500,
                cursor: 'pointer',
                border: 'none',
                color: visCols.yield ? '#ea580c' : '#64748b',
                background: visCols.yield ? '#fff7ed' : 'transparent',
                transition: 'all 0.2s'
              }}
            >
              Yield
            </button>
            <button
              onClick={() => toggleCol('desvio')}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: visCols.desvio ? 600 : 500,
                cursor: 'pointer',
                border: 'none',
                color: visCols.desvio ? '#ea580c' : '#64748b',
                background: visCols.desvio ? '#fff7ed' : 'transparent',
                transition: 'all 0.2s'
              }}
            >
              Desvio Média
            </button>
            <button
              onClick={() => toggleCol('desvioMax')}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: visCols.desvioMax ? 600 : 500,
                cursor: 'pointer',
                border: 'none',
                color: visCols.desvioMax ? '#ea580c' : '#64748b',
                background: visCols.desvioMax ? '#fff7ed' : 'transparent',
                transition: 'all 0.2s'
              }}
            >
              Desvio Máx
            </button>
          </div>
        </div>

        <button
          className="btn btn-primary"
          style={{ padding: '6px 16px', flexShrink: 0, fontWeight: 600 }}
          onClick={() => load(elemento)}
          disabled={loading}
        >
          {loading ? '⏳ Processando...' : '⚡ Processar'}
        </button>

        {pivotData && !loading && (
          <div style={{ position: 'relative', display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 16px', flexShrink: 0, fontWeight: 600, background: '#e2e8f0', color: '#1e293b', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px' }}
              onClick={() => { setShowPngMenu(!showPngMenu); setShowPdfMenu(false); }}
              title="Exportar como Imagem PNG"
            >
              🖼️ PNG
            </button>
            {showPngMenu && (
              <div style={{ position: 'absolute', top: '100%', right: 80, marginTop: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 8, zIndex: 50, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>Modo de Exportação</div>
                <button 
                  onClick={() => { setShowPngMenu(false); exportTableToPng(tableRef.current, 'Integralizacao.png') }} 
                  style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', border: '1px solid var(--border)', background: '#f8fafc', borderRadius: 4, textAlign: 'left', color: '#334155', fontWeight: 500 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                >
                  Visão Atual (Agregada)
                </button>
                <button 
                  onClick={() => { setShowPngMenu(false); handleGroupedExport('png', 'individuais') }} 
                  style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', border: '1px solid var(--border)', background: '#f8fafc', borderRadius: 4, textAlign: 'left', color: '#334155', fontWeight: 500 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                >
                  Dias Individuais (Empilhados)
                </button>
                <button 
                  onClick={() => { setShowPngMenu(false); handleGroupedExport('png', 'completa') }} 
                  style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', border: '1px solid var(--border)', background: '#f8fafc', borderRadius: 4, textAlign: 'left', color: '#334155', fontWeight: 500 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                >
                  Visão Completa (Agregada + Individuais)
                </button>
              </div>
            )}
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 16px', flexShrink: 0, fontWeight: 600, background: '#ffffff', color: '#1e293b', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px' }}
              onClick={() => { setShowPdfMenu(!showPdfMenu); setShowPngMenu(false); }}
              title="Exportar para PDF"
            >
              📄 PDF
            </button>
            
            {showPdfMenu && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 8, zIndex: 50, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>Visão Atual (Agregada)</div>
                <button 
                  onClick={() => { setShowPdfMenu(false); exportTableToPdf(tableRef.current, 'Integralizacao.pdf', { usinaName: usina || 'N/D', forceOrientation: 'p' }) }} 
                  style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', border: '1px solid var(--border)', background: '#f8fafc', borderRadius: 4, textAlign: 'left', color: '#334155', fontWeight: 500 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                >
                  📄 Retrato (Vertical)
                </button>
                <button 
                  onClick={() => { setShowPdfMenu(false); exportTableToPdf(tableRef.current, 'Integralizacao.pdf', { usinaName: usina || 'N/D', forceOrientation: 'l' }) }} 
                  style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', border: '1px solid var(--border)', background: '#f8fafc', borderRadius: 4, textAlign: 'left', color: '#334155', fontWeight: 500 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                >
                  🗎 Paisagem (Horizontal)
                </button>
                
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, marginTop: 8, textTransform: 'uppercase' }}>Dias Individuais (Empilhados)</div>
                <button 
                  onClick={() => { setShowPdfMenu(false); handleGroupedExport('pdf', 'individuais') }} 
                  style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', border: '1px solid var(--border)', background: '#f8fafc', borderRadius: 4, textAlign: 'left', color: '#334155', fontWeight: 500 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                >
                  📄 Exportar Retrato
                </button>

                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, marginTop: 8, textTransform: 'uppercase' }}>Visão Completa</div>
                <button 
                  onClick={() => { setShowPdfMenu(false); handleGroupedExport('pdf', 'completa') }} 
                  style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', border: '1px solid var(--border)', background: '#f8fafc', borderRadius: 4, textAlign: 'left', color: '#334155', fontWeight: 500 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                >
                  📄 Agregada + Individuais
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <div className="alert alert-error fade-in">⚠️ {error}</div>}

      {/* Tabela Pivot Original */}
      {pivotData && !loading && (
        <div ref={tableRef} style={{ overflow: 'auto', flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <HeatmapTable 
            pivotData={pivotData} 
            flatRows={flatRows} 
            visCols={visCols} 
            expandedPaths={expandedPaths} 
            toggleExpand={toggleExpand} 
            fmt={fmt} 
            fmtP={fmtP}
            topLeftText={topLeftMainText} 
            isAggregated={selectedDates.length > 1}
          />
        </div>
      )}

      {/* Container Oculto para Exportação Agrupada */}
      {groupedExportData && (
        <div 
          ref={exportGroupRef} 
          style={{ 
            position: 'absolute', top: 0, left: 0, zIndex: -100, pointerEvents: 'none',
            width: 'max-content', 
            background: '#f8fafc', 
            padding: 12,
            display: 'flex', flexDirection: 'column', gap: 6
          }}
        >
          {groupedExportData.map((dItem, idx) => (
            <div key={idx} style={{ background: '#fff', borderRadius: 12, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', overflowX: 'hidden' }}>
              <HeatmapTable 
                pivotData={dItem.pivotData} 
                flatRows={dItem.flatRows} 
                visCols={visCols} 
                expandedPaths={expandedPaths} 
                toggleExpand={() => {}} 
                fmt={fmt} 
                fmtP={fmtP} 
                topLeftText={dItem.date}
                isAggregated={dItem.isAggregated}
              />
            </div>
          ))}
        </div>
      )}

      {!pivotData && !loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, flex: 1, color: 'var(--text-muted)', textAlign: 'center' }}>
          <span style={{ fontSize: 48 }}>⚡</span>
          <strong style={{ color: 'var(--text-secondary)', fontSize: 16 }}>Sua nova tabela pivotada!</strong>
          <p style={{ fontSize: 13, maxWidth: 500 }}>
            Agora a plataforma consolida os cálculos da folha das strings à raiz. Selecione o enquadramento do eixo horizontal e verticais para explorar os painéis em multi-camadas.
          </p>
        </div>
      )}
    </div>
  )
}
