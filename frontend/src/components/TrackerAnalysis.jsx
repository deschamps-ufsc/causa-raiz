import React, { useState, useEffect, useMemo, useRef } from 'react'
import { fetchTrackerAnalysis, fetchFlowConfig } from '../services/api'
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
    pts: false,
    perc: false,
    status: true,
  })
  const toggleCol = (c) => setVisCols(prev => ({ ...prev, [c]: !prev[c] }))


  const [fetchedDates, setFetchedDates] = useState([])
  const [selectedDates, setSelectedDates] = useState([])
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showPdfMenu, setShowPdfMenu] = useState(false)

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
        if (config && config.nodes) {
          const trackerNode = config.nodes.find(el => el.id === 'tracker')
          if (trackerNode && trackerNode.data?.inputs) {
            trackerNode.data.inputs.forEach(input => {
              if (typeof input === 'string') set.add(input)
              else if (input.series) set.add(input.series)
            })
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
        for (let c of cols) node.values[c] = { diff_alvo_sum: 0, diff_atual_sum: 0, count_alvo: 0, count_atual: 0, pts_fora_alvo: 0, pts_fora_atual: 0, serieName: '', serie_alvo: '', serie_atual: '' }
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
          if (name !== undefined) {
             node.values[c].serieName = name
          }
          if (isLeafLvl) {
             node.values[c].serie_alvo = r.serie_alvo
             node.values[c].serie_atual = r.serie_atual
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
        <span style={{ fontSize: 48 }}>🎯</span>
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
              Qtd &gt; {tolerance}°
            </button>
            <button
              onClick={() => toggleCol('perc')}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: visCols.perc ? 600 : 500,
                cursor: 'pointer',
                border: 'none',
                color: visCols.perc ? '#ea580c' : '#64748b',
                background: visCols.perc ? '#fff7ed' : 'transparent',
                transition: 'all 0.2s'
              }}
            >
              % &gt; {tolerance}°
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
                  const numSubCols = [showAlvo && visCols.serie, showAlvo && visCols.diff, showAlvo && visCols.pts, showAlvo && visCols.perc, showAtual && visCols.serie, showAtual && visCols.diff, showAtual && visCols.pts, showAtual && visCols.perc].filter(Boolean).length + ((showAlvo || showAtual) && visCols.status ? 1 : 0)
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
                    {showAlvo && visCols.pts && <td style={{...subHd, borderLeft: bL()}}>Qtd &gt; {tolerance}°</td>}
                    {showAlvo && visCols.perc && <td style={{...subHd, borderLeft: bL()}}>% &gt; {tolerance}°</td>}
                    {showAtual && visCols.serie && <td style={{...subHd, borderLeft: bL()}}>Série Atual</td>}
                    {showAtual && visCols.diff && <td style={{...subHd, borderLeft: bL()}}>Erro Atual</td>}
                    {showAtual && visCols.pts && <td style={{...subHd, borderLeft: bL()}}>Qtd &gt; {tolerance}°</td>}
                    {showAtual && visCols.perc && <td style={{...subHd, borderLeft: bL()}}>% &gt; {tolerance}°</td>}
                    {(showAlvo || showAtual) && visCols.status && <td style={{...subHd, borderLeft: bL()}}>Status</td>}
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
                          {showAlvo && visCols.perc && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                          {showAtual && visCols.serie && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                          {showAtual && visCols.diff && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                          {showAtual && visCols.pts && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                          {showAtual && visCols.perc && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                          {(showAlvo || showAtual) && visCols.status && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
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
                               {showAlvo && visCols.pts && <td style={{...cell, borderLeft: bL(), background: cBg, fontWeight: 600}}>{rowVals.pts_fora_alvo}</td>}
                               {showAlvo && visCols.perc && <td style={{...cell, borderLeft: bL(), background: cBg, fontWeight: 600}}>{pctAlvo.toFixed(1)}%</td>}
                               
                               {showAtual && visCols.serie && <td style={{...cell, borderLeft: bL(), background: cBg, fontSize: 10, color: isSensor ? '#2563eb' : '#64748b', whiteSpace: 'nowrap', fontWeight: isSensor ? 700 : 400}}>{n.isLeaf ? rowVals.serie_atual : ''}{isSensor && ' 📡'}</td>}
                               {showAtual && visCols.diff && <td style={{...cell, borderLeft: bL(), background: bgAtual.bg, color: bgAtual.text, fontWeight: 600, boxShadow: isSensor ? 'inset 0 0 0 3px #3b82f6' : undefined}} title={isSensor ? 'Tracker com sensor instalado' : ''}>{fmt(rowVals.diff_atual)}</td>}
                               {showAtual && visCols.pts && <td style={{...cell, borderLeft: bL(), background: cBg, fontWeight: 600, boxShadow: isSensor ? 'inset 0 0 0 3px #3b82f6' : undefined}}>{rowVals.pts_fora_atual}</td>}
                               {showAtual && visCols.perc && <td style={{...cell, borderLeft: bL(), background: cBg, fontWeight: 600, boxShadow: isSensor ? 'inset 0 0 0 3px #3b82f6' : undefined}}>{pctAtual.toFixed(1)}%</td>}

                               {(() => {
                                 if (!(showAlvo || showAtual) || !visCols.status) return null;
                                 const erroAlvo = rowVals.diff_alvo;
                                 const erroAtual = rowVals.diff_atual;
                                 let label, bg, color;
                                 if (erroAlvo == null && erroAtual == null) {
                                   return <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>;
                                 }
                                 if (erroAlvo != null && erroAlvo >= 1) {
                                   label = 'Vento'; bg = '#dbeafe'; color = '#1d4ed8';
                                 } else if (erroAtual != null && erroAtual >= 1) {
                                   label = 'Travado'; bg = '#fee2e2'; color = '#b91c1c';
                                 } else {
                                   label = 'Ok'; bg = '#dcfce7'; color = '#15803d';
                                 }
                                 return (
                                   <td style={{...cell, borderLeft: bL(), background: bg, color, fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap'}}>
                                     {label}
                                   </td>
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
          <span style={{ fontSize: 48 }}>🎯</span>
          <strong style={{ color: 'var(--text-secondary)', fontSize: 16 }}>Análise de Erro dos Trackers</strong>
          <p style={{ fontSize: 13, maxWidth: 500 }}>
            Selecione as datas para calcular a diferença média em graus entre a inclinação registrada no SCADA e a inclinação de referência simulada pelo PVLib (desconsiderando momentos de backtracking).
          </p>
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
