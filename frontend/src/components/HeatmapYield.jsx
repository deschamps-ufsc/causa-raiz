import React, { useState, useEffect, useMemo, useRef } from 'react'
import { fetchPivotHeatmap, fetchSeries, fetchMappingData } from '../services/api'
import { exportTableToPdf, exportTableToPng } from '../utils/exportPdf'

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
  const [visCols, setVisCols]     = useState({ variavel: true, kwp: true, valor: true, yield: true, desvio: true, desvioMax: true })

  const [fetchedDates, setFetchedDates] = useState([])
  const [selectedDates, setSelectedDates] = useState([])
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showPdfMenu, setShowPdfMenu] = useState(false)

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
        if (lvl === 2) type = rowCat3 ? 'tracker' : 'string'
        if (lvl === 3) type = 'string'
        const node = { label, values: {}, children: new Map(), isLeaf: false, level: lvl, type }
        for (let c of cols) node.values[c] = { integral: 0, avg_sum: 0, kwp: 0, yield: null, count: 0, serieName: '' }
        map.set(label, node)
      }
      return map.get(label)
    }

    filteredData.forEach(r => {
      const c = r[colCat]
      if (!c) return
      
      const h1 = r[rowCat1] || 'S/N'
      const h2 = rowCat2 ? (r[rowCat2] || 'S/N') : null
      const h3 = rowCat3 ? (r[rowCat3] || 'S/N') : null
      
      let leafId = r.serie || '?'
      const elLower = elemento.toLowerCase()
      const isStringVar = elLower.includes('string') || elLower.includes('cc') || elLower.includes('dc')
      
      if (isStringVar) {
        const strMatch = leafId.match(/(?:string|str)\D*(\d+)/i)
        if (strMatch) {
          leafId = `String ${parseInt(strMatch[1], 10)}`
        } else {
          const numMatch = leafId.match(/(\d+)$/)
          if (numMatch) {
            leafId = `String ${parseInt(numMatch[1], 10)}`
          } else {
            leafId = `String ${leafId.split(/[._]/).pop()}`
          }
        }
      } else {
        leafId = leafId.split('.').pop()
      }

      const n1 = getOrCreate(rootMap, h1, 0)
      
      let parentForLeaf = n1
      if (rowCat2) {
        parentForLeaf = getOrCreate(n1.children, h2, 1)
      }
      if (rowCat3 && parentForLeaf.level === 1) {
        parentForLeaf = getOrCreate(parentForLeaf.children, h3, 2)
      }

      const leaf = getOrCreate(parentForLeaf.children, leafId, parentForLeaf.level + 1)
      leaf.isLeaf = true
      leaf.type = 'string'

      const addVal = (node, name) => {
        if (node.values[c]) {
          node.values[c].integral += r.integral || 0
          node.values[c].avg_sum += r.avg_val || 0
          node.values[c].kwp += r.kwp || 0
          node.values[c].count += 1
          if (name !== undefined) {
             node.values[c].serieName = name
          }
        }
      }

      addVal(n1, ``)
      if (rowCat2) {
        addVal(n1.children.get(h2), `Total ${h2}`)
      }
      if (rowCat3 && h2 && h3) {
        const n2 = n1.children.get(h2)
        if (n2) addVal(n2.children.get(h3), `Total ${h3}`)
      }
      addVal(leaf, r.serie)
    })

    // CompressTree removido para permitir seleção dinâmica de linhas

    // 3. Converter Map -> Array recursivamente e calcular o Yield (Integral / kWp)
    let allYields = [] // Usado para calcular o Desvio Global

    const mapToArray = (map, prefix = '') => {
      return Array.from(map.values()).map(n => {
        const path = prefix ? `${prefix}|${n.label}` : n.label
        // Calcula o Yield do Nó
        for (let c of cols) {
          const v = n.values[c]
          if (v.count > 0) {
            v.displayVal = aggType === 'media' ? (v.avg_sum / v.count) : v.integral
            v.displayKwp = aggType === 'media' ? (v.kwp / v.count) : v.kwp
          }
          if (v.count > 0 && v.displayKwp > 0) {
            v.yield = v.displayVal / v.displayKwp
            if (n.isLeaf) allYields.push(v.yield)
          }
        }
        
        return {
          ...n,
          path,
          children: n.children && n.children.size > 0 ? mapToArray(n.children, path) : null
        }
      }).sort((a,b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true }))
    }

    const tree = mapToArray(rootMap)

    allYields = allYields.filter(y => y > 0)
    allYields.sort((a,b) => a - b)
    const globalMean = allYields.length > 0 ? allYields.reduce((a,b)=>a+b,0)/allYields.length : 0
    const globalMax = allYields.length > 0 ? Math.max(...allYields) : 0

    const getDesvioColor = (val, mean=globalMean) => {
      if (val == null || !mean) return { bg: 'transparent', text: '#94a3b8' }
      const pct = (val / mean - 1) * 100
      
      const interpolate = (c1, c2, factor) => Math.round(c1 + (c2 - c1) * Math.max(0, Math.min(1, factor)))
      
      const green = [99, 190, 123]
      const yellow = [255, 235, 132]
      const lightRed = [248, 105, 107]
      const pureRed = [255, 0, 0]

      let r, g, b, f = 0

      if (pct <= -20) { 
          [r,g,b] = pureRed 
      }
      else if (pct <= -5) { 
          [r,g,b] = lightRed 
      }
      else if (pct >= 5) { 
          [r,g,b] = green 
      }
      else if (pct > 0) {
          f = pct / 5
          r = interpolate(yellow[0], green[0], f)
          g = interpolate(yellow[1], green[1], f)
          b = interpolate(yellow[2], green[2], f)
      } else {
          f = (pct - (-5)) / 5
          r = interpolate(lightRed[0], yellow[0], f)
          g = interpolate(lightRed[1], yellow[1], f)
          b = interpolate(lightRed[2], yellow[2], f)
      }
      
      const brightness = (r * 299 + g * 587 + b * 114) / 1000
      const text = brightness > 125 ? '#1e293b' : '#ffffff'

      return { bg: `rgb(${r},${g},${b})`, text }
    }

    return {
      cols: Array.from(cols).sort(),
      tree,
      globalMean,
      globalMax,
      getDesvioColor
    }
  }, [data, selectedDates, colCat, rowCat1, rowCat2, aggType])

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
              onClick={() => exportTableToPng(tableRef.current, 'Integralizacao.png')}
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
            <thead>
              {/* Header Principal de Colunas */}
              <tr>
                <td rowSpan={2} style={{ ...hdCell, width: 140, left: 0, position: 'sticky', zIndex: 3, borderRight: '3px solid #0f172a' }}>
                  <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 11 }}>Navegação</div>
                </td>
                {pivotData.cols.map(c => {
                  const activeColsCount = [visCols.variavel, visCols.kwp, visCols.valor, visCols.yield, visCols.desvio, visCols.desvioMax].filter(Boolean).length
                  if (activeColsCount === 0) return null
                  return (
                  <td key={c} colSpan={activeColsCount} style={{ ...hdCell, textAlign: 'center', borderBottom: '1px solid #475569', borderLeft: '3px solid #0f172a' }}>
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
                    {visCols.variavel && <td style={{...subHd, borderLeft: bL(), textAlign: 'left', paddingLeft: 8}}>Variável</td>}
                    {visCols.kwp && <td style={{...subHd, borderLeft: bL()}}>kWp</td>}
                    {visCols.valor && <td style={{...subHd, borderLeft: bL()}}>Valor</td>}
                    {visCols.yield && <td style={{...subHd, borderLeft: bL()}}>Yield</td>}
                    {visCols.desvio && <td style={{...subHd, borderLeft: bL()}}>Desvio Média</td>}
                    {visCols.desvioMax && <td style={{...subHd, borderLeft: bL()}}>Desvio Máx</td>}
                  </React.Fragment>
                )})}
              </tr>
            </thead>
            <tbody>
              {flatRows.map((n, i) => (
                <tr key={`${n.path}_${i}`} style={{ height: 26, borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
                  
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
                      }} title={n.serieName}>
                        {n.displayLabel}
                      </span>
                    </div>
                  </td>

                  {/* Células de Dados por Coluna (SKID) */}
                  {pivotData.cols.map(c => {
                    const rowVals = n.values[c]
                    const cBg = n.level === 0 ? '#f1f5f9' : n.level === 1 ? '#f8fafc' : '#ffffff'
                    
                    if (!rowVals || rowVals.count === 0) {
                      let isFirst = true
                      const bL = () => { const res = isFirst ? '3px solid #0f172a' : undefined; isFirst = false; return res }
                      return (
                        <React.Fragment key={`data_${c}`}>
                          {visCols.variavel && <td style={{...cell, borderLeft: bL(), background: cBg}}></td>}
                          {visCols.kwp && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                          {visCols.valor && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                          {visCols.yield && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                          {visCols.desvio && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                          {visCols.desvioMax && <td style={{...cell, borderLeft: bL(), background: cBg}}>-</td>}
                        </React.Fragment>
                      )
                    }

                    const { bg, text } = pivotData.getDesvioColor(rowVals.yield, pivotData.globalMean)
                    const { bg: bgMax, text: textMax } = pivotData.getDesvioColor(rowVals.yield, pivotData.globalMax)

                    return (
                      <React.Fragment key={`data_${c}`}>
                        {(() => {
                           let isFirst = true
                           const bL = () => { const res = isFirst ? '3px solid #0f172a' : undefined; isFirst = false; return res }
                           return (
                             <>
                               {visCols.variavel && (
                                 <td style={{...cell, borderLeft: bL(), background: cBg, textAlign: 'left', paddingLeft: 8, fontSize: 11, whiteSpace: 'nowrap', fontWeight: n.level < 2 ? 600 : 400, color: '#475569'}} title={rowVals.serieName}>
                                   {rowVals.serieName}
                                 </td>
                               )}
                               {visCols.kwp && <td style={{...cell, borderLeft: bL(), background: cBg, color: '#0ea5e9'}}>{rowVals.displayKwp > 0 ? rowVals.displayKwp.toFixed(3) : '-'}</td>}
                               {visCols.valor && <td style={{...cell, borderLeft: bL(), background: cBg}}>{fmt(rowVals.displayVal)}</td>}
                               {visCols.yield && <td style={{...cell, borderLeft: bL(), background: cBg, color: '#475569', fontWeight: 600}}>{fmt(rowVals.yield)}</td>}
                               {visCols.desvio && <td style={{...cell, borderLeft: bL(), background: bg, color: text, fontWeight: 700}}>
                                 {fmtP(rowVals.yield, pivotData.globalMean)}
                               </td>}
                               {visCols.desvioMax && <td style={{...cell, borderLeft: bL(), background: bgMax, color: textMax, fontWeight: 700}}>
                                 {fmtP(rowVals.yield, pivotData.globalMax)}
                               </td>}
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
  fontSize: 11,
  textAlign: 'center',
  color: '#334155',
  borderRight: '1px solid #e2e8f0',
}
