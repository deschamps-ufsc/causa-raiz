import React, { useState, useEffect, useMemo } from 'react'
import { fetchPivotHeatmap, fetchSeries, fetchMappingData } from '../services/api'

export default function HeatmapYield({ usina, dates, activeFilters = [] }) {
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [elemento, setElemento]   = useState('')
  const [allSeries, setAllSeries] = useState([])
  
  const [colCat, setColCat]       = useState('skid')
  const [rowCat1, setRowCat1]     = useState('inversor')
  const [rowCat2, setRowCat2]     = useState('stringbox')
  const [aggType, setAggType]     = useState('soma')
  const [visCols, setVisCols]     = useState({ variavel: true, kwp: true, valor: true, yield: true, desvio: true })

  const toggleCol = (col) => setVisCols(prev => ({ ...prev, [col]: !prev[col] }))
  const activeColsCount = Object.values(visCols).filter(Boolean).length

  // Estado para expandir a tabela na árvore
  const [expandedPaths, setExpandedPaths] = useState(new Set())

  const CAT_OPTIONS = [
    { label: 'SKID', value: 'skid' },
    { label: 'Estação', value: 'estacao' },
    { label: 'Inversor', value: 'inversor' },
    { label: 'Stringbox', value: 'stringbox' },
  ]

  useEffect(() => {
    if (!usina || !dates) return
    // Busca séries do Parquet e complementa com o DE-PARA para incluir sintéticas
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
    } catch (e) {
      setError(e.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  // Monta a Tabela Dinâmica
  const pivotData = useMemo(() => {
    if (!data || data.length === 0) return null

    // 1. Extrair todas as chaves de coluna existentes no recordset
    const colsSet = new Set()
    data.forEach(r => { if (r[colCat]) colsSet.add(r[colCat]) })
    const cols = [...colsSet].sort()

    // 2. Construir árvore
    const rootMap = new Map()
    const getOrCreate = (map, label, lvl) => {
      if (!map.has(label)) {
        const node = { label, values: {}, children: new Map(), isLeaf: false, level: lvl }
        for (let c of cols) node.values[c] = { integral: 0, avg_sum: 0, kwp: 0, yield: null, count: 0, serieName: '' }
        map.set(label, node)
      }
      return map.get(label)
    }

    data.forEach(r => {
      const c = r[colCat]
      if (!c) return
      
      const h1 = r[rowCat1] || 'S/N'
      const h2 = rowCat2 ? (r[rowCat2] || 'S/N') : null
      
      let leafId = r.serie || '?'
      const elLower = elemento.toLowerCase()
      const isStringVar = elLower.includes('string') || elLower.includes('cc') || elLower.includes('dc')
      
      if (isStringVar) {
        const match = leafId.match(/\d+$/)
        if (match) {
          leafId = `String ${parseInt(match[0], 10)}`
        } else {
          leafId = `String ${leafId.split(/[._]/).pop()}`
        }
      } else {
        leafId = leafId.split('.').pop()
      }

      const n1 = getOrCreate(rootMap, h1, 0)
      
      let parentForLeaf = n1
      if (rowCat2) {
        parentForLeaf = getOrCreate(n1.children, h2, 1)
      }

      const leaf = getOrCreate(parentForLeaf.children, leafId, parentForLeaf.level + 1)
      leaf.isLeaf = true

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
        addVal(parentForLeaf, `Total ${h2}`)
      }
      addVal(leaf, r.serie)
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
                 if (onlyChild.values[c].count > 0) {
                   node.values[c].serieName = onlyChild.values[c].serieName
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

    const getDesvioColor = (val, mean=globalMean) => {
      if (val == null || !mean) return { bg: 'transparent', text: '#94a3b8' }
      const pct = (val / mean - 1) * 100
      
      if (pct >= 5) {
        return { bg: 'rgba(92, 192, 112, 0.9)', text: '#064e3b' }
      }
      if (pct <= -20) {
        return { bg: 'rgba(239, 68, 68, 0.9)', text: '#ffffff' }
      }
      
      const interpolate = (c1, c2, factor) => Math.round(c1 + (c2 - c1) * factor)
      
      if (pct >= 0) {
        const f = pct / 5.0
        const r = interpolate(245, 92, f)
        const g = interpolate(225, 192, f)
        const b = interpolate(110, 112, f)
        return { bg: `rgba(${r},${g},${b},0.8)`, text: '#1e293b' }
      } else {
        const f = (pct + 20) / 20.0
        const r = interpolate(250, 245, f)
        const g = interpolate(120, 225, f)
        const b = interpolate(120, 110, f)
        return { bg: `rgba(${r},${g},${b},0.8)`, text: '#1e293b' }
      }
    }

    return {
      cols: Array.from(cols).sort(),
      tree,
      globalMean,
      getDesvioColor
    }
  }, [data, colCat, rowCat1, rowCat2, aggType])

  // Acha a listagem flat exibida
  const flatRows = useMemo(() => {
    if (!pivotData) return []
    const flatten = (nodes, lvl=0) => {
      let res = []
      for (const node of nodes) {
        res.push({...node, level: lvl})
        if (expandedPaths.has(node.path) && node.children) {
          res = res.concat(flatten(node.children, lvl+1))
        }
      }
      return res
    }
    return flatten(pivotData.tree)
  }, [pivotData, expandedPaths])

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>

      {/* Controles Dinâmicos */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, flexShrink: 0 }}>
        
        <span style={{ fontSize: 13, fontWeight: 600, color: '#38bdf8' }}>Colunas:</span>
        <select className="input" style={{ width: 110, padding: '4px 8px' }} value={colCat} onChange={e => setColCat(e.target.value)}>
          {CAT_OPTIONS.map(o => <option key={`col_${o.value}`} value={o.value}>{o.label}</option>)}
        </select>

        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>L1:</span>
        <select className="input" style={{ width: 110, padding: '4px 8px' }} value={rowCat1} onChange={e => setRowCat1(e.target.value)}>
          {CAT_OPTIONS.map(o => <option key={`l1_${o.value}`} value={o.value}>{o.label}</option>)}
        </select>

        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>L2:</span>
        <select className="input" style={{ width: 130, padding: '4px 8px' }} value={rowCat2} onChange={e => setRowCat2(e.target.value)}>
          <option value="">— Nenhum —</option>
          <option value="inversor">Inversor</option>
          <option value="stringbox">Stringbox</option>
          <option value="skid">SKID</option>
          <option value="estacao">Estação</option>
        </select>

        <div style={{ width: 1, height: 20, backgroundColor: 'var(--border)' }} />

        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Operação:</span>
        <select className="input" style={{ width: 100, padding: '4px 8px' }} value={aggType} onChange={e => setAggType(e.target.value)}>
          <option value="soma">Soma</option>
          <option value="media">Média</option>
        </select>
        
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Elemento:</span>
        <select
          className="input"
          style={{ padding: '4px 8px', flex: 1, minWidth: 200 }}
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

        <details style={{ position: 'relative', cursor: 'pointer', marginLeft: 'auto', marginRight: 12 }}>
          <summary style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>⚙️ Colunas Visíveis</span>
            <span style={{ fontSize: 10 }}>▼</span>
          </summary>
          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, background: 'white', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 50, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 140 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={visCols.variavel} onChange={() => toggleCol('variavel')} style={{ accentColor: '#0ea5e9', width: 14, height: 14 }} /> Variável
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={visCols.kwp} onChange={() => toggleCol('kwp')} style={{ accentColor: '#0ea5e9', width: 14, height: 14 }} /> kWp
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={visCols.valor} onChange={() => toggleCol('valor')} style={{ accentColor: '#0ea5e9', width: 14, height: 14 }} /> Valor
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={visCols.yield} onChange={() => toggleCol('yield')} style={{ accentColor: '#0ea5e9', width: 14, height: 14 }} /> Yield
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={visCols.desvio} onChange={() => toggleCol('desvio')} style={{ accentColor: '#0ea5e9', width: 14, height: 14 }} /> Desvio
            </label>
          </div>
        </details>

        <button
          className="btn btn-primary"
          style={{ padding: '6px 16px', flexShrink: 0, fontWeight: 600 }}
          onClick={() => load(elemento)}
          disabled={loading}
        >
          {loading ? '⏳ Processando...' : '⚡ Gerar Tabela'}
        </button>
      </div>

      {error && <div className="alert alert-error fade-in">⚠️ {error}</div>}

      {/* Tabela Pivot */}
      {pivotData && !loading && (
        <div style={{ overflow: 'auto', flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={{ borderCollapse: 'collapse', fontFamily: 'Inter, sans-serif', fontSize: 12, width: '100%', minWidth: 800 }}>
            <thead>
              {/* Header Principal de Colunas */}
              <tr>
                <td rowSpan={2} style={{ ...hdCell, width: 140, left: 0, position: 'sticky', zIndex: 3, borderRight: '3px solid #0f172a' }}>
                  <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 11 }}>Navegação</div>
                </td>
                {pivotData.cols.map(c => {
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
                  const bL = () => { const res = isFirst && activeColsCount > 0 ? '3px solid #0f172a' : undefined; isFirst = false; return res }
                  return (
                  <React.Fragment key={`sub_${c}`}>
                    {visCols.variavel && <td style={{...subHd, borderLeft: bL(), textAlign: 'left', paddingLeft: 8}}>Variável</td>}
                    {visCols.kwp && <td style={{...subHd, borderLeft: bL()}}>kWp</td>}
                    {visCols.valor && <td style={{...subHd, borderLeft: bL()}}>Valor</td>}
                    {visCols.yield && <td style={{...subHd, borderLeft: bL()}}>Yield</td>}
                    {visCols.desvio && <td style={{...subHd, borderLeft: bL()}}>Desvio</td>}
                  </React.Fragment>
                )})}
              </tr>
            </thead>
            <tbody>
              {flatRows.map((n, i) => (
                <tr key={`${n.path}_${i}`} style={{ height: 36, borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
                  
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
                      }}>
                        {n.label}
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
                        </React.Fragment>
                      )
                    }

                    const { bg, text } = pivotData.getDesvioColor(rowVals.yield)

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
  padding: '6px 12px',
  border: '1px solid rgba(255,255,255,0.02)',
}

const subHd = {
  background: '#f8fafc',
  color: '#475569',
  fontSize: 10,
  fontWeight: 800,
  textTransform: 'uppercase',
  padding: '6px 12px',
  textAlign: 'center',
  borderRight: '1px solid #cbd5e1',
}

const cell = {
  padding: '8px 12px',
  textAlign: 'center',
  color: '#334155',
  borderRight: '1px solid #e2e8f0',
}
