import React, { useState, useEffect, useMemo, useRef } from 'react'
import PlotWrapper from 'react-plotly.js'
const Plot = PlotWrapper.default || PlotWrapper
import axios from 'axios'
import api, { fetchTrackerAnalysis, fetchFlowConfig } from '../services/api'
import { exportTableToPdf, exportTableToPng } from '../utils/exportPdf'

export default function TrackerAnalysis({ usina, dates, activeFilters = [] }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [tolerance, setTolerance] = useState(10)
  
  const colCat = 'skid'
  const rowCat1 = 'inversor'
  const rowCat2 = 'stringbox'

  const [expandedPaths, setExpandedPaths] = useState(new Set())

  const tableRef = useRef(null)

  const [showAlvo, setShowAlvo] = useState(true)
  const [showAtual, setShowAtual] = useState(true)

  const [showRows, setShowRows] = useState({
    inversor: false,
    stringbox: false,
    tracker: true
  })
  const toggleRow = (r) => setShowRows(prev => ({ ...prev, [r]: !prev[r] }))

  const [visCols, setVisCols] = useState({
    serie: false,
    diff: true,
    pts: true,
    status: true,
    perdas: false,
    kwp: true,
    energia: true,
    yield: true
  })
  const toggleCol = (c) => setVisCols(prev => ({ ...prev, [c]: !prev[c] }))


  const [fetchedDates, setFetchedDates] = useState([])
  const [selectedDates, setSelectedDates] = useState([])
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showPdfMenu, setShowPdfMenu] = useState(false)
  
  const [chartModal, setChartModal] = useState(null)
  const [chartData, setChartData] = useState(null)
  const [chartLoading, setChartLoading] = useState(false)
  const [chartError, setChartError] = useState(null)
  const [trackerTols, setTrackerTols] = useState({ vento: 0, travado: 0 })
  const [infoModalOpen, setInfoModalOpen] = useState(false)

  const openChart = async (date, alvo, atual, status = null, trackerName = null, perdasLabel = null) => {
      setChartModal({ date, alvo, atual, status, trackerName, perdasLabel })
      setChartLoading(true)
      setChartData(null)
      setChartError(null)
      try {
          const res = await api.get('/heatmap/tracker_chart', {
              params: { usina, date, alvo, atual, filters: activeFilters.join(',') }
          })
          setChartData(res.data)
      } catch (err) {
          console.error(err)
          setChartError(err.message || String(err))
      } finally {
          setChartLoading(false)
      }
  }

  const load = async () => {
    if (!usina || !dates) return
    setLoading(true)
    try {
      const res = await fetchTrackerAnalysis(usina, dates, activeFilters)
      setData(res.records || [])
      if (res.tolerance !== undefined) setTolerance(res.tolerance)
      setError(null)
      setExpandedPaths(new Set()) // Reset expansions when data changes
      
      const dArr = dates.split(',').map(d => d.trim()).filter(Boolean).sort()
      setFetchedDates(dArr)
      // Por padrão seleciona o primeiro dia
      if (dArr.length > 0) setSelectedDates([dArr[0]])
      else setSelectedDates([])
    } catch (e) {
      setError(e.message)
      setData([])
      setFetchedDates([])
      setSelectedDates([])
    } finally {
      setLoading(false)
    }
  }

  // Load only on usina change, not dates
  useEffect(() => {
    // Optionally we can clear the table if usina changes
    setData([])
    setFetchedDates([])
    setSelectedDates([])
  }, [usina])

  const [sensorSeries, setSensorSeries] = useState(new Set())

  useEffect(() => {
    if (!usina) return
    fetchFlowConfig(usina)
      .then(config => {
        const set = new Set()
        if (config && config.nodeConfigs) {
          const trackerNode = config.nodeConfigs['tracker']
          if (trackerNode && trackerNode.inputs) {
            trackerNode.inputs.forEach(input => {
              if (typeof input === 'string') set.add(input)
              else if (input.series) set.add(input.series)
            })
          }
          if (trackerNode && trackerNode.trackerParams) {
            setTrackerTols({
              vento: trackerNode.trackerParams.tol_pontos_vento || 0,
              travado: trackerNode.trackerParams.tol_pontos_travado || 0
            })
          }
        } else if (config && config.nodes) {
          const trackerNode = config.nodes.find(el => el.id === 'tracker')
          if (trackerNode && trackerNode.data?.inputs) {
            trackerNode.data.inputs.forEach(input => {
              if (typeof input === 'string') set.add(input)
              else if (input.series) set.add(input.series)
            })
            if (trackerNode.data.trackerParams) {
              setTrackerTols({
                vento: trackerNode.data.trackerParams.tol_pontos_vento || 0,
                travado: trackerNode.data.trackerParams.tol_pontos_travado || 0
              })
            }
          }
        }
        setSensorSeries(set)
      })
      .catch(console.error)
  }, [usina])

  // Monta a Tabela Dinâmica
  const pivotData = useMemo(() => {
    if (!data || data.length === 0) return null
    const filteredData = selectedDates.length > 0 ? data.filter(r => selectedDates.includes(r.date)) : data
    if (filteredData.length === 0) return null

    // 1. Extrair todas as chaves de coluna existentes no recordset
    const colsSet = new Set()
    filteredData.forEach(r => { if (r[colCat]) colsSet.add(r[colCat]) })
    const cols = [...colsSet].sort()

    // 2. Construir árvore
    const rootMap = new Map()
    const getOrCreate = (map, label, lvl) => {
      if (!map.has(label)) {
        let type = 'inversor'
        if (lvl === 1) type = 'stringbox'
        if (lvl === 2) type = 'tracker'
        const node = { label, values: {}, children: new Map(), isLeaf: false, level: lvl, type }
        for (let c of cols) node.values[c] = { diff_alvo_sum: 0, diff_atual_sum: 0, count_alvo: 0, count_atual: 0, pts_fora_alvo: 0, pts_fora_atual: 0, pts_vento: 0, pts_travado: 0, sum_diff_vento: 0, sum_diff_travado: 0, serieName: '', serie_alvo: '', serie_atual: '', energia: null, kwp: null, yield: null, count_trackers: 0 }
        map.set(label, node)
      }
      return map.get(label)
    }

    filteredData.forEach(r => {
      const c = r[colCat]
      if (!c) return
      
      const h1 = r[rowCat1] || 'S/N'
      const h2 = rowCat2 ? (r[rowCat2] || 'S/N') : null
      
      let leafId = r.tracker || '?'
      if (r.tracker && r.strings) {
        const strFmt = r.strings.split(';').map(x => x.trim()).join(', ')
        leafId = `${r.tracker} - STR ${strFmt}`
      }
      const n1 = getOrCreate(rootMap, h1, 0)
      
      let parentForLeaf = n1
      if (rowCat2) {
        parentForLeaf = getOrCreate(n1.children, h2, 1)
      }

      const leaf = getOrCreate(parentForLeaf.children, leafId, parentForLeaf.level + 1)
      leaf.isLeaf = true

      const addVal = (node, name, isLeafLvl) => {
        if (node.values[c]) {
          if (r.diff_alvo !== null) {
            node.values[c].diff_alvo_sum += r.diff_alvo * r.count_alvo
            node.values[c].count_alvo += r.count_alvo
            node.values[c].pts_fora_alvo += r.pts_fora_alvo || 0
          }
          if (r.diff_atual !== null) {
            node.values[c].diff_atual_sum += r.diff_atual * r.count_atual
            node.values[c].count_atual += r.count_atual
            node.values[c].pts_fora_atual += r.pts_fora_atual || 0
          }
          node.values[c].pts_vento += r.pts_vento || 0
          node.values[c].pts_travado += r.pts_travado || 0
          node.values[c].sum_diff_vento += r.sum_diff_vento || 0
          node.values[c].sum_diff_travado += r.sum_diff_travado || 0
          node.values[c].count_trackers = (node.values[c].count_trackers || 0) + 1
          if (name !== undefined) {
             node.values[c].serieName = name
          }
          if (isLeafLvl) {
             node.values[c].serie_alvo = r.serie_alvo
             node.values[c].serie_atual = r.serie_atual
          }
          if (r.energia !== undefined && r.energia !== null) {
              node.values[c].energia = (node.values[c].energia || 0) + r.energia
          }
          if (r.kwp !== undefined && r.kwp !== null) {
              node.values[c].kwp = (node.values[c].kwp || 0) + r.kwp
          }
          if (node.values[c].energia > 0 && node.values[c].kwp > 0) {
              node.values[c].yield = node.values[c].energia / node.values[c].kwp
          }
        }
      }

      addVal(n1, ``, false)
      if (rowCat2) {
        addVal(parentForLeaf, `Total ${h2}`, false)
      }
      addVal(leaf, r.base, true)
    })

    // Comprimir nós com apenas um filho que é folha para economizar cliques
    const compressTree = (map) => {
      for (let node of map.values()) {
        if (node.children.size > 0) {
          compressTree(node.children)
          
          if (node.children.size === 1) {
            const onlyChild = Array.from(node.children.values())[0]
            if (onlyChild.isLeaf) {
               for (let c of cols) {
                 if (onlyChild.values[c].count_alvo > 0 || onlyChild.values[c].count_atual > 0) {
                   node.values[c].serieName = onlyChild.values[c].serieName
                   node.values[c].serie_alvo = onlyChild.values[c].serie_alvo
                   node.values[c].serie_atual = onlyChild.values[c].serie_atual
                 }
               }
               node.isLeaf = true
               node.children.clear()
            }
          }
        }
      }
    }
    
    compressTree(rootMap)

    // 3. Converter Map -> Array recursivamente
    const mapToArray = (map, prefix = '') => {
      return Array.from(map.values()).map(n => {
        const path = prefix ? `${prefix}|${n.label}` : n.label
        for (let c of cols) {
          const v = n.values[c]
          v.diff_alvo = v.count_alvo > 0 ? (v.diff_alvo_sum / v.count_alvo) : null
          v.diff_atual = v.count_atual > 0 ? (v.diff_atual_sum / v.count_atual) : null
        }
        
        return {
          ...n,
          path,
          children: n.children && n.children.size > 0 ? mapToArray(n.children, path) : null
        }
      }).sort((a,b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true }))
    }

    const tree = mapToArray(rootMap)

    // Lógica de cores fixas
    const getErrorColor = (val) => {
      if (val == null) return { bg: 'transparent', text: '#94a3b8' }
      
      const interpolate = (c1, c2, factor) => Math.round(c1 + (c2 - c1) * factor)
      
      const green = [134, 239, 172]
      const yellow = [253, 224, 71]
      const orange = [251, 146, 60]
      const red = [239, 68, 68]

      let r, g, b
      let f = 0
      let textColor = '#1e293b'

      if (val <= 2) {
        [r, g, b] = green
      } else if (val <= 5) {
        f = (val - 2) / (5 - 2)
        r = interpolate(green[0], yellow[0], f)
        g = interpolate(green[1], yellow[1], f)
        b = interpolate(green[2], yellow[2], f)
      } else if (val <= 10) {
        f = (val - 5) / (10 - 5)
        r = interpolate(yellow[0], orange[0], f)
        g = interpolate(yellow[1], orange[1], f)
        b = interpolate(yellow[2], orange[2], f)
      } else if (val <= 20) {
        f = (val - 10) / (20 - 10)
        r = interpolate(orange[0], red[0], f)
        g = interpolate(orange[1], red[1], f)
        b = interpolate(orange[2], red[2], f)
        if (f > 0.5) textColor = '#ffffff'
      } else {
        [r, g, b] = red
        textColor = '#ffffff'
      }

      return { bg: `rgba(${r},${g},${b},0.8)`, text: textColor }
    }

    return {
      cols: Array.from(cols).sort(),
      tree,
      getErrorColor
    }
  }, [data, selectedDates, colCat, rowCat1, rowCat2])

  // Acha a listagem flat exibida
  const flatRows = useMemo(() => {
    if (!pivotData) return []
    const flatten = (nodes, lvl=0, parentPrefix='') => {
      let res = []
      for (const node of nodes) {
        if (showRows[node.type]) {
          const displayLabel = parentPrefix ? `${parentPrefix} - ${node.label}` : node.label
          res.push({...node, level: lvl, displayLabel})
        }
        if ((expandedPaths.has(node.path) || !showRows[node.type]) && node.children) {
          let nextPrefix = parentPrefix
          if (!showRows[node.type]) {
            nextPrefix = parentPrefix ? `${parentPrefix} - ${node.label}` : node.label
          } else {
            nextPrefix = ''
          }
          res = res.concat(flatten(node.children, showRows[node.type] ? lvl+1 : lvl, nextPrefix))
        }
      }
      return res
    }
    return flatten(pivotData.tree)
  }, [pivotData, expandedPaths, showRows])

  const toggleExpand = (path) => {
    const newExpanded = new Set(expandedPaths)
    if (newExpanded.has(path)) newExpanded.delete(path)
    else newExpanded.add(path)
    setExpandedPaths(newExpanded)
  }

  const fmt = v => v != null ? `${v.toFixed(1)}°` : '-'

  if (!usina || !dates) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '60px 20px', color: 'var(--text-muted)', textAlign: 'center' }}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: 4 }}>
          <path d="M12 16V22M8 22H16" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <polygon points="3 14 15 5 22 9 10 18" fill="#3b82f6" stroke="#1e40af" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M9 9.5L16 13.5" stroke="#93c5fd" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M7 11L13 6.5" stroke="#93c5fd" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M11 16L17 11.5" stroke="#93c5fd" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M3.5 6.5C4.5 3.5 7.5 2 11 2" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round"/>
          <path d="M7.5 2H11V5.5" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
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
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, flexShrink: 0 }}>
        
        {renderDateSelector()}
        


        <div style={{ display: 'flex', background: '#ffffff', border: '1px solid var(--border)', borderRadius: 8, padding: 3, gap: 2 }}>
          <button
            onClick={() => setShowAlvo(!showAlvo)}
            style={{
              padding: '4px 12px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: showAlvo ? 600 : 500,
              cursor: 'pointer',
              border: 'none',
              color: showAlvo ? '#ea580c' : '#64748b',
              background: showAlvo ? '#fff7ed' : 'transparent',
              transition: 'all 0.2s'
            }}
          >
            Alvo
          </button>
          <button
            onClick={() => setShowAtual(!showAtual)}
            style={{
              padding: '4px 12px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: showAtual ? 600 : 500,
              cursor: 'pointer',
              border: 'none',
              color: showAtual ? '#ea580c' : '#64748b',
              background: showAtual ? '#fff7ed' : 'transparent',
              transition: 'all 0.2s'
            }}
          >
            Atual
          </button>
        </div>

        <div style={{ width: 1, height: 20, backgroundColor: 'var(--border)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>Linhas:</span>
          <div style={{ display: 'flex', background: '#ffffff', border: '1px solid var(--border)', borderRadius: 8, padding: 3, gap: 2 }}>
            <button
              onClick={() => toggleRow('inversor')}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: showRows.inversor ? 600 : 500,
                cursor: 'pointer',
                border: 'none',
                color: showRows.inversor ? '#ea580c' : '#64748b',
                background: showRows.inversor ? '#fff7ed' : 'transparent',
                transition: 'all 0.2s'
              }}
            >
              Inversor
            </button>
            <button
              onClick={() => toggleRow('stringbox')}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: showRows.stringbox ? 600 : 500,
                cursor: 'pointer',
                border: 'none',
                color: showRows.stringbox ? '#ea580c' : '#64748b',
                background: showRows.stringbox ? '#fff7ed' : 'transparent',
                transition: 'all 0.2s'
              }}
            >
              Stringbox
            </button>
            <button
              onClick={() => toggleRow('tracker')}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: showRows.tracker ? 600 : 500,
                cursor: 'pointer',
                border: 'none',
                color: showRows.tracker ? '#ea580c' : '#64748b',
                background: showRows.tracker ? '#fff7ed' : 'transparent',
                transition: 'all 0.2s'
              }}
            >
              Tracker
            </button>
          </div>
        </div>

        <div style={{ width: 1, height: 20, backgroundColor: 'var(--border)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>Colunas:</span>
          <div style={{ display: 'flex', background: '#ffffff', border: '1px solid var(--border)', borderRadius: 8, padding: 3, gap: 2 }}>
            <button
              onClick={() => toggleCol('serie')}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: visCols.serie ? 600 : 500,
                cursor: 'pointer',
                border: 'none',
                color: visCols.serie ? '#ea580c' : '#64748b',
                background: visCols.serie ? '#fff7ed' : 'transparent',
                transition: 'all 0.2s'
              }}
            >
              Série
            </button>
            <button
              onClick={() => toggleCol('diff')}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: visCols.diff ? 600 : 500,
                cursor: 'pointer',
                border: 'none',
                color: visCols.diff ? '#ea580c' : '#64748b',
                background: visCols.diff ? '#fff7ed' : 'transparent',
                transition: 'all 0.2s'
              }}
            >
              Erro
            </button>
            <button
              onClick={() => toggleCol('pts')}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: visCols.pts ? 600 : 500,
                cursor: 'pointer',
                border: 'none',
                color: visCols.pts ? '#ea580c' : '#64748b',
                background: visCols.pts ? '#fff7ed' : 'transparent',
                transition: 'all 0.2s'
              }}
            >
              Qtde &gt; {tolerance}°
            </button>
            <button
              onClick={() => toggleCol('status')}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: visCols.status ? 600 : 500,
                cursor: 'pointer',
                border: 'none',
                color: visCols.status ? '#ea580c' : '#64748b',
                background: visCols.status ? '#fff7ed' : 'transparent',
                transition: 'all 0.2s'
              }}
            >
              Status
            </button>
            <button
              onClick={() => toggleCol('perdas')}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: visCols.perdas ? 600 : 500,
                cursor: 'pointer',
                border: 'none',
                color: visCols.perdas ? '#ea580c' : '#64748b',
                background: visCols.perdas ? '#fff7ed' : 'transparent',
                transition: 'all 0.2s'
              }}
            >
              Gatilho Perdas
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
              onClick={() => toggleCol('energia')}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: visCols.energia ? 600 : 500,
                cursor: 'pointer',
                border: 'none',
                color: visCols.energia ? '#ea580c' : '#64748b',
                background: visCols.energia ? '#fff7ed' : 'transparent',
                transition: 'all 0.2s'
              }}
            >
              Energia
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
          </div>
        </div>

        <div style={{ marginLeft: 'auto' }} />

        <button
          className="btn btn-primary"
          style={{ padding: '6px 16px', flexShrink: 0, fontWeight: 600 }}
          onClick={() => load()}
          disabled={loading}
        >
          {loading ? '⏳ Processando...' : '⚡ Processar'}
        </button>

        {pivotData && !loading && (
          <div style={{ position: 'relative', display: 'flex', gap: '8px' }}>
            <button
                className="btn btn-secondary"
                style={{ padding: '6px 12px', flexShrink: 0, fontWeight: 600, background: '#f8fafc', color: '#0f172a', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px' }}
                onClick={() => setInfoModalOpen(true)}
                title="Informações sobre o cálculo das métricas"
            >
              ℹ️ Entenda as Métricas
            </button>
            <button
                className="btn btn-secondary"
                style={{ padding: '6px 16px', flexShrink: 0, fontWeight: 600, background: '#e2e8f0', color: '#1e293b', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px' }}
                onClick={() => exportTableToPng(tableRef.current, 'TrackerAnalysis.png')}
                title="Exportar tabela atual como Imagem PNG"
            >
              🖼️ PNG
            </button>
            <button 
                className="btn btn-secondary" 
                style={{ padding: '6px 16px', flexShrink: 0, fontWeight: 600, background: '#ffffff', color: '#1e293b', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px' }}
                onClick={() => setShowPdfMenu(!showPdfMenu)}
                title="Exportar tabela atual para PDF"
            >
              📄 PDF
            </button>
            
            {showPdfMenu && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 8, zIndex: 50, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>Orientação</div>
                <button 
                  onClick={() => { setShowPdfMenu(false); exportTableToPdf(tableRef.current, 'TrackerAnalysis.pdf', { usinaName: usina || 'N/D', forceOrientation: 'p' }) }} 
                  style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', border: '1px solid var(--border)', background: '#f8fafc', borderRadius: 4, textAlign: 'left', color: '#334155', fontWeight: 500 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                >
                  📄 Retrato (Vertical)
                </button>
                <button 
                  onClick={() => { setShowPdfMenu(false); exportTableToPdf(tableRef.current, 'TrackerAnalysis.pdf', { usinaName: usina || 'N/D', forceOrientation: 'l' }) }} 
                  style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', border: '1px solid var(--border)', background: '#f8fafc', borderRadius: 4, textAlign: 'left', color: '#334155', fontWeight: 500 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                >
                  🗎 Paisagem (Horizontal)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <div className="alert alert-error fade-in">⚠️ {error}</div>}

      {/* Tabela Pivot */}
      {pivotData && !loading && (
        <div ref={tableRef} style={{ overflow: 'auto', flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={{ borderCollapse: 'collapse', fontFamily: 'Inter, sans-serif', fontSize: 12, width: '100%', minWidth: 800 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              {/* Header Principal de Colunas */}
              <tr>
                <td rowSpan={2} style={{ ...hdCell, width: 140, left: 0, top: 0, position: 'sticky', zIndex: 20, borderRight: '3px solid #0f172a' }}>
                  <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 11 }}>Tracker</div>
                </td>
                {pivotData.cols.map(c => {
                  const numSubCols = [showAlvo && visCols.serie, showAlvo && visCols.diff, showAlvo && visCols.pts, showAtual && visCols.serie, showAtual && visCols.diff, showAtual && visCols.pts].filter(Boolean).length + ((showAlvo || showAtual) && visCols.status ? 1 : 0) + ((showAlvo || showAtual) && visCols.perdas ? 1 : 0) + ((showAlvo || showAtual) && visCols.kwp ? 1 : 0) + ((showAlvo || showAtual) && visCols.energia ? 1 : 0) + ((showAlvo || showAtual) && visCols.yield ? 1 : 0)
                  if (numSubCols === 0) return null
                  return (
                  <td key={c} colSpan={numSubCols} style={{ ...hdCell, textAlign: 'center', borderBottom: '1px solid #475569', borderLeft: '3px solid #0f172a' }}>
                    {c}
                  </td>
                )})}
              </tr>
              {/* Sub Header de Métricas */}
              <tr>
                {pivotData.cols.map(c => {
                  let isFirst = true
                  const bL = () => { const res = isFirst ? '3px solid #0f172a' : undefined; isFirst = false; return res }
                  return (
                  <React.Fragment key={`sub_${c}`}>
                    {showAlvo && visCols.serie && <td style={{...subHd, borderLeft: bL()}}>Série Alvo</td>}
                    {showAlvo && visCols.diff && <td style={{...subHd, borderLeft: bL()}}>Erro Alvo</td>}
                    {showAlvo && visCols.pts && <td style={{...subHd, borderLeft: bL()}}>QTDE ERRO ALVO</td>}
                    {showAtual && visCols.serie && <td style={{...subHd, borderLeft: bL()}}>Série Atual</td>}
                    {showAtual && visCols.diff && <td style={{...subHd, borderLeft: bL()}}>Erro Atual</td>}
                    {showAtual && visCols.pts && <td style={{...subHd, borderLeft: bL()}}>QTDE ERRO ATUAL</td>}
                    {(showAlvo || showAtual) && visCols.status && <td style={{...subHd, borderLeft: bL()}}>Status</td>}
                    {(showAlvo || showAtual) && visCols.perdas && <td style={{...subHd, borderLeft: bL()}}>Gatilho Perdas</td>}
                    {(showAlvo || showAtual) && visCols.kwp && <td style={{...subHd, textTransform: 'none', borderLeft: bL()}}>kWp</td>}
                    {(showAlvo || showAtual) && visCols.energia && <td style={{...subHd, textTransform: 'none', borderLeft: bL()}}>Energia (kWh)</td>}
                    {(showAlvo || showAtual) && visCols.yield && <td style={{...subHd, textTransform: 'none', borderLeft: bL()}}>Yield (kWh/kWp)</td>}
                  </React.Fragment>
                )})}
              </tr>
            </thead>
            <tbody>
              {flatRows.map((n, i) => (
                <tr key={`${n.path}_${i}`} data-level={n.level} style={{ height: 26, borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
                  
                  {/* Célula Guia (Congelada à esquerda) */}
                  <td style={{ 
                      padding: '4px 8px', 
                      background: n.level === 0 ? '#f1f5f9' : n.level === 1 ? '#f8fafc' : '#ffffff', 
                      position: 'sticky', left: 0, zIndex: 1, 
                      borderRight: '3px solid #0f172a',
                      whiteSpace: 'nowrap'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', paddingLeft: n.level * 16 }}>
                      {n.children ? (
                        <button 
                          onClick={() => toggleExpand(n.path)}
                          style={{ 
                            background: 'none', border: 'none', color: '#0ea5e9', cursor: 'pointer', 
                            fontSize: 16, width: 22, textAlign: 'center', fontWeight: 'bold' 
                          }}
                        >
                          {expandedPaths.has(n.path) ? '−' : '+'}
                        </button>
                      ) : <span style={{ width: 22 }} />}
                      <span style={{ 
                        color: n.isLeaf ? '#64748b' : '#334155', 
                        fontWeight: n.level === 0 ? 700 : n.level === 1 ? 600 : 400 
                      }} title={n.values[pivotData.cols[0]]?.serieName}>
                        {n.displayLabel}
                      </span>
                    </div>
                  </td>

                  {/* Células de Dados por Coluna (SKID) */}
                  {pivotData.cols.map(c => {
                    const rowVals = n.values[c]
                    const cBg = n.level === 0 ? '#f1f5f9' : n.level === 1 ? '#f8fafc' : '#ffffff'
                    
                    if (!rowVals || (rowVals.count_alvo === 0 && rowVals.count_atual === 0)) {
                      let isFirst = true
                      const bL = () => { const res = isFirst ? '3px solid #0f172a' : undefined; isFirst = false; return res }
                      return (
                        <React.Fragment key={`data_${c}`}>
                          {showAlvo && visCols.serie && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                          {showAlvo && visCols.diff && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                          {showAlvo && visCols.pts && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                          {showAtual && visCols.serie && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                          {showAtual && visCols.diff && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                          {showAtual && visCols.pts && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                          {(showAlvo || showAtual) && visCols.status && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                          {(showAlvo || showAtual) && visCols.perdas && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                          {(showAlvo || showAtual) && visCols.kwp && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                          {(showAlvo || showAtual) && visCols.energia && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                          {(showAlvo || showAtual) && visCols.yield && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                        </React.Fragment>
                      )
                    }

                    const bgAlvo = pivotData.getErrorColor(rowVals.diff_alvo)
                    const bgAtual = pivotData.getErrorColor(rowVals.diff_atual)
                    
                    const pctAlvo = rowVals.count_alvo > 0 ? (rowVals.pts_fora_alvo / rowVals.count_alvo) * 100 : 0
                    const pctAtual = rowVals.count_atual > 0 ? (rowVals.pts_fora_atual / rowVals.count_atual) * 100 : 0

                    return (
                      <React.Fragment key={`data_${c}`}>
                        {(() => {
                           let isFirst = true
                           const bL = () => { const res = isFirst ? '3px solid #0f172a' : undefined; isFirst = false; return res }
                           const isSensor = n.isLeaf && sensorSeries.has(rowVals.serie_atual)
                           
                           return (
                             <>
                               {showAlvo && visCols.serie && <td style={{...cell, borderLeft: bL(), background: cBg, fontSize: 10, color: '#64748b', whiteSpace: 'nowrap'}}>{n.isLeaf ? rowVals.serie_alvo : ''}</td>}
                               {showAlvo && visCols.diff && <td style={{...cell, borderLeft: bL(), background: bgAlvo.bg, color: bgAlvo.text, fontWeight: 600}}>{fmt(rowVals.diff_alvo)}</td>}
                               {showAlvo && visCols.pts && <td style={{...cell, borderLeft: bL(), background: cBg, fontWeight: 600}}>{rowVals.pts_fora_alvo} ({pctAlvo.toFixed(1)}%)</td>}
                               
                               {showAtual && visCols.serie && <td style={{...cell, borderLeft: bL(), background: cBg, fontSize: 10, color: isSensor ? '#2563eb' : '#64748b', whiteSpace: 'nowrap', fontWeight: isSensor ? 700 : 400}}>{n.isLeaf ? rowVals.serie_atual : ''}{isSensor && ' 📡'}</td>}
                               {showAtual && visCols.diff && <td style={{...cell, borderLeft: bL(), background: bgAtual.bg, color: bgAtual.text, fontWeight: 600, boxShadow: isSensor ? 'inset 0 0 0 3px #3b82f6' : undefined}} title={isSensor ? 'Tracker com sensor instalado' : ''}>{fmt(rowVals.diff_atual)}</td>}
                               {showAtual && visCols.pts && <td style={{...cell, borderLeft: bL(), background: cBg, fontWeight: 600, boxShadow: isSensor ? 'inset 0 0 0 3px #3b82f6' : undefined}}>{rowVals.pts_fora_atual} ({pctAtual.toFixed(1)}%)</td>}

                               {(() => {
                                 if (!(showAlvo || showAtual)) return null;
                                 if (!visCols.status && !visCols.perdas) return null;
                                 if (rowVals.count_alvo === 0 && rowVals.count_atual === 0) {
                                   return (
                                     <>
                                       {visCols.status && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                                       {visCols.perdas && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                                       {visCols.kwp && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                                       {visCols.energia && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                                       {visCols.yield && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                                     </>
                                   );
                                 }
                                 let ptsVento = rowVals.pts_vento || 0;
                                 let ptsTravado = rowVals.pts_travado || 0;
                                 const totalPts = Math.max(rowVals.count_alvo || 0, rowVals.count_atual || 0);
                                 
                                 const countTrackers = rowVals.count_trackers || 1;
                                 const thresholdVento = (trackerTols.vento || 0) * countTrackers;
                                 const thresholdTravado = (trackerTols.travado || 0) * countTrackers;
                                 
                                 if (ptsVento <= thresholdVento) ptsVento = 0;
                                 if (ptsTravado <= thresholdTravado) ptsTravado = 0;
                                 
                                 const pctVento = totalPts > 0 ? (ptsVento / totalPts) * 100 : 0;
                                 const pctTravado = totalPts > 0 ? (ptsTravado / totalPts) * 100 : 0;
                                 
                                 let label = '';
                                 let bg = '#dcfce7';
                                 let color = '#15803d';
                                 
                                 if (ptsVento === 0 && ptsTravado === 0) {
                                   label = 'Ok';
                                 } else if (ptsVento > 0 && ptsTravado === 0) {
                                   label = `Vento: ${ptsVento} (${pctVento.toFixed(1)}%)`;
                                   bg = '#dbeafe'; color = '#1d4ed8'; // Azul
                                 } else if (ptsTravado > 0 && ptsVento === 0) {
                                   label = `Travado: ${ptsTravado} (${pctTravado.toFixed(1)}%)`;
                                   bg = '#fef08a'; color = '#854d0e'; // Amarelo
                                 } else {
                                   label = `Vento: ${ptsVento} (${pctVento.toFixed(1)}%) | Travado: ${ptsTravado} (${pctTravado.toFixed(1)}%)`;
                                   bg = '#fee2e2'; color = '#b91c1c'; // Vermelho
                                 }
                                 
                                 let sumVento = rowVals.sum_diff_vento || 0;
                                 let sumTravado = rowVals.sum_diff_travado || 0;
                                 let totalPerdas = sumVento + sumTravado;
                                 let perdasLabel = '-';
                                 if (totalPerdas > 0) {
                                     perdasLabel = `Vento: ${sumVento.toFixed(0)}° | Travado: ${sumTravado.toFixed(0)}° | Total: ${totalPerdas.toFixed(0)}°`;
                                 }

                                 return (
                                   <>
                                     {visCols.status && (
                                       <td 
                                         onClick={() => {
                                            if (rowVals.serie_alvo || rowVals.serie_atual) {
                                                const targetDate = selectedDates.length > 0 ? selectedDates[0] : (dates ? dates.split(',')[0].trim() : '');
                                                openChart(targetDate, rowVals.serie_alvo, rowVals.serie_atual, { label, bg, color }, `${c} - ${n.displayLabel}`, totalPerdas > 0 ? perdasLabel : null)
                                            }
                                         }}
                                         style={{...cell, borderLeft: bL(), background: bg, color, fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap', cursor: (rowVals.serie_alvo || rowVals.serie_atual) ? 'pointer' : 'default'}}
                                         title="Clique para abrir o gráfico"
                                       >
                                         {label}
                                       </td>
                                     )}
                                     {visCols.perdas && (
                                       <td style={{...cell, borderLeft: bL(), background: cBg, color: '#334155', textAlign: 'center', whiteSpace: 'nowrap'}}>
                                         {perdasLabel}
                                       </td>
                                     )}
                                     {visCols.kwp && (
                                       <td style={{...cell, borderLeft: bL(), background: cBg, color: '#3b82f6', textAlign: 'center', whiteSpace: 'nowrap', fontWeight: 500}}>
                                         {rowVals.kwp != null ? (rowVals.kwp).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '-'}
                                       </td>
                                     )}
                                     {visCols.energia && (
                                       <td style={{...cell, borderLeft: bL(), background: cBg, color: '#1e293b', textAlign: 'center', whiteSpace: 'nowrap', fontWeight: 600}}>
                                         {rowVals.energia != null ? (rowVals.energia / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '-'}
                                       </td>
                                     )}
                                     {visCols.yield && (
                                       <td style={{...cell, borderLeft: bL(), background: cBg, color: '#1e293b', textAlign: 'center', whiteSpace: 'nowrap', fontWeight: 600}}>
                                         {rowVals.yield != null ? (rowVals.yield / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                                       </td>
                                     )}
                                   </>
                                 );
                               })()}
                             </>
                           )
                        })()}
                      </React.Fragment>
                    )
                  })}

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!pivotData && !loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, flex: 1, color: 'var(--text-muted)', textAlign: 'center' }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: 4 }}>
            <path d="M12 16V22M8 22H16" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <polygon points="3 14 15 5 22 9 10 18" fill="#3b82f6" stroke="#1e40af" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M9 9.5L16 13.5" stroke="#93c5fd" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M7 11L13 6.5" stroke="#93c5fd" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M11 16L17 11.5" stroke="#93c5fd" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M3.5 6.5C4.5 3.5 7.5 2 11 2" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M7.5 2H11V5.5" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <strong style={{ color: 'var(--text-secondary)', fontSize: 16 }}>Análise de Erro dos Trackers</strong>
          <p style={{ fontSize: 13, maxWidth: 500 }}>
            Selecione as datas para calcular a diferença média em graus entre a inclinação registrada no SCADA e a inclinação de referência simulada pelo PVLib.
          </p>
        </div>
      )}

      {chartModal && (
          <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
              background: 'rgba(0,0,0,0.5)', zIndex: 9999, 
              display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
              <div style={{
                  background: '#fff', borderRadius: 8, padding: 20, width: '90%', maxWidth: 1200,
                  maxHeight: '90vh', overflowY: 'auto',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
              }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <h3 style={{ margin: 0 }}>
                              Análise do Tracker {chartModal.trackerName ? `- ${chartModal.trackerName}` : ''}
                          </h3>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                              {chartModal.status && (
                                  <div style={{ padding: '4px 8px', borderRadius: 4, background: chartModal.status.bg, color: chartModal.status.color, fontWeight: 'bold', fontSize: 13 }}>
                                      Status: {chartModal.status.label}
                                  </div>
                              )}
                              {chartModal.perdasLabel && chartModal.perdasLabel !== '-' && (
                                  <div style={{ padding: '4px 8px', borderRadius: 4, background: '#f8fafc', border: '1px solid #cbd5e1', color: '#334155', fontWeight: 'bold', fontSize: 13 }}>
                                      Gatilho Perdas: {chartModal.perdasLabel}
                                  </div>
                              )}
                          </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          {chartModal.date && (
                              <div style={{ padding: '4px 12px', borderRadius: 16, background: '#e2e8f0', color: '#334155', fontWeight: 'bold', fontSize: 14 }}>
                                  {chartModal.date.split('-').reverse().join('/')}
                              </div>
                          )}
                          <button onClick={() => setChartModal(null)} style={{ border: 'none', background: 'transparent', fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: 0, marginTop: '-4px' }}>×</button>
                      </div>
                  </div>
                  {chartLoading && <div>Carregando dados...</div>}
                  {chartError && <div style={{ color: 'red', margin: '20px 0' }}>Erro: {chartError}</div>}
                  {chartData && typeof chartData === 'object' && chartData.pvlib && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                          <div style={{ width: '100%', height: 400 }}>
                              <Plot
                                  data={[
                                      {
                                        x: chartData.timestamps,
                                        y: chartData.pvlib.map(v => v !== null ? v + chartData.tolerance : null),
                                        type: 'scatter', mode: 'lines', line: { width: 0 },
                                        showlegend: false, hoverinfo: 'skip'
                                      },
                                      {
                                        x: chartData.timestamps,
                                        y: chartData.pvlib.map(v => v !== null ? v - chartData.tolerance : null),
                                        type: 'scatter', mode: 'lines', line: { width: 0 },
                                        fill: 'tonexty', fillcolor: 'rgba(74, 222, 128, 0.2)', // green-400 com 20% opacidade
                                        name: 'Tolerância', hoverinfo: 'skip'
                                      },
                                      {
                                        x: chartData.timestamps,
                                        y: chartData.pvlib,
                                        type: 'scatter', mode: 'lines', line: { color: '#22c55e', width: 1.5 }, // green-500
                                        name: 'Referência'
                                      },
                                      {
                                        x: chartData.timestamps,
                                        y: chartData.alvo,
                                        type: 'scatter', mode: 'lines', line: { color: 'orange', width: 1.5 },
                                        name: 'Ângulo Alvo'
                                      },
                                      {
                                        x: chartData.timestamps,
                                        y: chartData.atual,
                                        type: 'scatter', mode: 'lines', line: { color: 'purple', width: 1.5 },
                                        name: 'Ângulo Atual'
                                      },
                                      {
                                        x: chartData.timestamps,
                                        y: chartData.vento,
                                        type: 'scatter', mode: 'lines', line: { color: 'transparent', width: 0, shape: 'hvh' },
                                        fill: 'tozeroy', fillcolor: 'rgba(59, 130, 246, 0.5)',
                                        name: 'Vento', xaxis: 'x2', yaxis: 'y2'
                                      },
                                      {
                                        x: chartData.timestamps,
                                        y: chartData.travado,
                                        type: 'scatter', mode: 'lines', line: { color: 'transparent', width: 0, shape: 'hvh' },
                                        fill: 'tozeroy', fillcolor: 'rgba(234, 179, 8, 0.5)', // Amarelo (yellow-500)
                                        name: 'Travado', xaxis: 'x2', yaxis: 'y2'
                                      },
                                      {
                                        x: chartData.timestamps,
                                        y: chartData.ok,
                                        type: 'scatter', mode: 'lines', line: { color: 'transparent', width: 0, shape: 'hvh' },
                                        fill: 'tozeroy', fillcolor: 'rgba(34, 197, 94, 0.5)',
                                        name: 'Ok', xaxis: 'x2', yaxis: 'y2'
                                      },
                                      {
                                        x: chartData.timestamps,
                                        y: chartData.valido,
                                        type: 'scatter', mode: 'lines', line: { color: 'transparent', width: 0, shape: 'hvh' },
                                        fill: 'tozeroy', fillcolor: 'rgba(100, 116, 139, 0.5)', // Slate/gray for Valid Data
                                        name: 'Dados Válidos', xaxis: 'x3', yaxis: 'y3'
                                      },
                                      {
                                        x: chartData.timestamps,
                                        y: chartData.backtracking,
                                        type: 'scatter', mode: 'lines', line: { color: 'transparent', width: 0, shape: 'hvh' },
                                        fill: 'tozeroy', fillcolor: 'rgba(239, 68, 68, 0.8)', // Vermelho mais forte
                                        name: 'Backtracking', xaxis: 'x4', yaxis: 'y4'
                                      }
                                  ]}
                                  layout={{
                                      legend: { orientation: 'h', y: 1.15, x: 1, xanchor: 'right' },
                                      margin: { t: 50, r: 20, b: 30, l: 40 },
                                      xaxis: { 
                                          type: 'date',
                                          anchor: 'y',
                                          range: [`${chartModal.date} 00:00:00`, `${chartModal.date} 23:59:59`],
                                          tickformat: '%H:%M',
                                          dtick: 3600000
                                      },
                                      xaxis2: { anchor: 'y2', matches: 'x', showgrid: false, showticklabels: false, zeroline: false },
                                      xaxis3: { anchor: 'y3', matches: 'x', showgrid: false, showticklabels: false, zeroline: false },
                                      xaxis4: { anchor: 'y4', matches: 'x', showgrid: false, showticklabels: false, zeroline: false },
                                      yaxis: { domain: [0, 0.85], title: 'Ângulo (°)' },
                                      yaxis2: { domain: [0.85, 0.90], showticklabels: false, range: [0, 1.2], fixedrange: true, zeroline: false, showgrid: false, showline: false },
                                      yaxis3: { domain: [0.90, 0.95], showticklabels: false, range: [0, 1.2], fixedrange: true, zeroline: false, showgrid: false, showline: false },
                                      yaxis4: { domain: [0.95, 1.0], showticklabels: false, range: [0, 1.2], fixedrange: true, zeroline: false, showgrid: false, showline: false },
                                      hovermode: 'x unified'
                                  }}
                                  style={{ width: '100%', height: '100%' }}
                                  className="tracker-plot"
                                  useResizeHandler
                                  config={{
                                      displaylogo: false,
                                      modeBarButtonsToRemove: ['zoomIn2d', 'zoomOut2d', 'autoScale2d']
                                  }}
                              />
                          </div>
                          {chartData.strings_data && Object.keys(chartData.strings_data).length > 0 && (
                              <div style={{ width: '100%', height: 300 }}>
                                  <Plot
                                      data={Object.keys(chartData.strings_data).map(sc => {
                                          let lineStyle = { width: 1.0 };
                                          let dashStyle = 'solid';
                                          if (sc === 'Potência CC Média Strings OK') {
                                              lineStyle = { width: 3.0, dash: 'dot' };
                                          } else if (sc === 'Potência CC Média Strings OK_válida') {
                                              lineStyle = { width: 3.0 };
                                          }
                                          return {
                                              x: chartData.timestamps,
                                              y: chartData.strings_data[sc],
                                              type: 'scatter', mode: 'lines', line: lineStyle,
                                              name: sc,
                                              hovertemplate: '%{y:.2f} W'
                                          };
                                      })}
                                      layout={{
                                          legend: { orientation: 'h', y: 1.15, x: 1, xanchor: 'right' },
                                          margin: { t: 50, r: 20, b: 40, l: 40 },
                                          xaxis: { 
                                              type: 'date',
                                              range: [`${chartModal.date} 00:00:00`, `${chartModal.date} 23:59:59`],
                                              tickformat: '%H:%M',
                                              dtick: 3600000
                                          },
                                          yaxis: { title: 'kW' },
                                          hovermode: 'x unified'
                                      }}
                                      style={{ width: '100%', height: '100%' }}
                                      className="tracker-plot"
                                      useResizeHandler
                                      config={{
                                          displaylogo: false,
                                          modeBarButtonsToRemove: ['zoomIn2d', 'zoomOut2d', 'autoScale2d']
                                      }}
                                  />
                              </div>
                          )}
                      </div>
                  )}
                  {chartData && typeof chartData === 'string' && (
                      <div style={{ color: 'red' }}>Erro ao carregar dados do servidor.</div>
                  )}
              </div>
          </div>
      )}

      {infoModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 20, width: '100%', maxWidth: 900, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#0f172a' }}>Entenda as Métricas (Tabela vs. Status)</h2>
              <button 
                onClick={() => setInfoModalOpen(false)}
                style={{ background: '#f1f5f9', border: 'none', width: 32, height: 32, borderRadius: 16, cursor: 'pointer', fontWeight: 'bold', color: '#64748b' }}
              >
                ✕
              </button>
            </div>
            
            <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.5, marginBottom: 20 }}>
              As métricas baseadas na <strong>Quantidade de Erro</strong> e as métricas de <strong>Status (Vento/Travado)</strong> possuem naturezas matemáticas diferentes: a primeira avalia a volumetria total do dia, enquanto a segunda avalia a persistência consecutiva da falha.
              <br/><br/>
              <em>Nota: Períodos de backtracking são considerados em todos os cálculos, excluindo-se apenas períodos em que a referência da posição teórica do tracker pelo PVLib é zero, ou seja, períodos sem sol.</em>
            </p>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ background: '#f8fafc', padding: '10px', textAlign: 'left', borderBottom: '2px solid #cbd5e1', color: '#0f172a' }}>Coluna</th>
                  <th style={{ background: '#f8fafc', padding: '10px', textAlign: 'left', borderBottom: '2px solid #cbd5e1', color: '#0f172a' }}>Origem dos Dados</th>
                  <th style={{ background: '#f8fafc', padding: '10px', textAlign: 'left', borderBottom: '2px solid #cbd5e1', color: '#0f172a' }}>Como é Calculado</th>
                  <th style={{ background: '#f8fafc', padding: '10px', textAlign: 'left', borderBottom: '2px solid #cbd5e1', color: '#0f172a' }}>É por dado Consecutivo?</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>ERRO ALVO</td>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0' }}>Diferença absoluta entre o Setpoint (Alvo) lido e a Referência Ideal (PVLib).</td>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0' }}>É a <strong>média aritmética</strong> de todos os desvios de ângulo registrados ao longo do dia inteiro.</td>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0' }}>Não se aplica (é uma média do dia).</td>
                </tr>
                <tr>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>QTDE ERRO ALVO</td>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0' }}>Mesmo cálculo do Erro Alvo.</td>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0' }}>É a <strong>soma simples</strong> de todos os minutos em que o erro superou a tolerância parametrizada.</td>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0' }}><strong>NÃO</strong>. Qualquer minuto que extrapole o limite, isolado ou não, entra para a soma.</td>
                </tr>
                <tr>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>ERRO ATUAL</td>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0' }}>Diferença absoluta entre a Posição Real (Medido) e a Referência Ideal (PVLib).</td>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0' }}>É a <strong>média aritmética</strong> de todos os desvios de posição real registrados ao longo do dia.</td>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0' }}>Não se aplica (é uma média do dia).</td>
                </tr>
                <tr>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>QTDE ERRO ATUAL</td>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0' }}>Mesmo cálculo do Erro Atual.</td>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0' }}>É a <strong>soma simples</strong> de todos os minutos em que o erro físico superou a tolerância.</td>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0' }}><strong>NÃO</strong>. Cada minuto que falhar é somado no montante final, isolado ou não.</td>
                </tr>
                <tr>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>STATUS</td>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0' }}>Verifica as flags internamente:<br/>1. <strong>Vento</strong>: Falha no Alvo.<br/>2. <strong>Travado</strong>: Falha no Atual SEM Falha no Alvo.</td>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0' }}>Calcula qual foi a <strong>maior sequência ininterrupta</strong> de falha. O Frontend compara contra a tolerância (ex: 10 min). Se a sequência máxima for menor, o status é "Ok".</td>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0' }}><strong>SIM</strong>. O status exige falhas consecutivas. Pontos isolados são ignorados na exibição do status.</td>
                </tr>
                <tr>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>GATILHO PERDAS</td>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0' }}>Integral do erro (Graus x Minuto) baseado na Posição Real nos momentos de erro.</td>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0' }}>É a <strong>soma total de graus</strong> perdidos. O código pega todos os minutos com flags ativadas e soma os graus de desvio.</td>
                  <td style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0' }}><strong>NÃO</strong>. Todo grau de desvio em momentos de erro é acumulado para quantificar a perda de alinhamento.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}

const hdCell = {
  background: '#162032',
  color: '#e2e8f0',
  fontWeight: 700,
  padding: '4px 8px',
  lineHeight: 1.2,
  border: '1px solid rgba(255,255,255,0.02)',
}

const subHd = {
  background: '#f8fafc',
  color: '#475569',
  fontSize: 10,
  fontWeight: 800,
  textTransform: 'uppercase',
  padding: '4px 8px',
  lineHeight: 1.2,
  textAlign: 'center',
  borderRight: '1px solid #cbd5e1',
}

const cell = {
  padding: '4px 12px',
  textAlign: 'center',
  color: '#334155',
  fontSize: 11,
  borderRight: '1px solid #e2e8f0',
}
