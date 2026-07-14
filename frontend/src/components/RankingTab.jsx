import React, { useState, useEffect, useMemo, useRef } from 'react'
import { fetchSeries, fetchMappingData, fetchPivotHeatmap } from '../services/api'
import { exportTableToPdf, exportTableToPng } from '../utils/exportPdf'

export default function RankingTab({ usina, dates, activeFilters = [] }) {
  const tableRef = useRef(null)
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [elemento, setElemento]   = useState('')
  const [allSeries, setAllSeries] = useState([])
  
  const [aggType, setAggType]     = useState('soma')
  const [visCols, setVisCols]     = useState({ skid: true, inversor: true, kwp: true, valor: true, yield: true, desvio: true, desvioMax: true })

  const [fetchedDates, setFetchedDates] = useState([])
  const [selectedDates, setSelectedDates] = useState([])
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showPdfMenu, setShowPdfMenu] = useState(false)

  const toggleCol = (col) => setVisCols(prev => ({ ...prev, [col]: !prev[col] }))

  useEffect(() => {
    if (!usina || !dates) return
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

  const elementosOptions = useMemo(() => {
    if (!allSeries.length) return []
    const uniqueElements = [...new Set(allSeries.map(s => s.elemento).filter(el => el && el.toLowerCase() !== 'filtro'))].sort()
    
    return uniqueElements.map(el => {
      const count = allSeries.filter(s => s.elemento === el).length
      return { el, count }
    })
  }, [allSeries])

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

  const rankingData = useMemo(() => {
    if (!data || data.length === 0) return null

    const filteredData = selectedDates.length > 0 ? data.filter(r => selectedDates.includes(r.date)) : data
    if (filteredData.length === 0) return null

    const invMap = new Map()

    filteredData.forEach(r => {
      const inv = r.inversor || 'S/N'
      const skid = r.skid || 'S/N'
      const key = `${skid}|${inv}`

      if (!invMap.has(key)) {
        invMap.set(key, { skid, inversor: inv, integral: 0, avg_sum: 0, kwp: 0, count: 0 })
      }

      const item = invMap.get(key)
      item.integral += r.integral || 0
      item.avg_sum += r.avg_val || 0
      item.kwp += r.kwp || 0
      item.count += 1
    })

    let allYields = []

    let rows = Array.from(invMap.values()).map(r => {
      const val = aggType === 'media' ? (r.avg_sum / r.count) : r.integral
      const kwp = aggType === 'media' ? (r.kwp / r.count) : r.kwp
      let yield_ = null
      
      if (r.count > 0 && kwp > 0) {
        yield_ = val / kwp
        allYields.push(yield_)
      }

      return { ...r, val, kwp, yield: yield_ }
    })

    rows = rows.filter(r => r.yield != null && r.yield > 0)
    rows.sort((a, b) => b.yield - a.yield)

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
      rows,
      globalMean,
      globalMax,
      getDesvioColor
    }
  }, [data, selectedDates, aggType])

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
        <span style={{ fontSize: 48 }}>🏆</span>
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
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, flexShrink: 0 }}>
        
        {renderDateSelector()}
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Op:</span>
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
            <button onClick={() => toggleCol('skid')} style={{ padding: '4px 8px', borderRadius: 6, fontSize: 13, fontWeight: visCols.skid ? 600 : 500, cursor: 'pointer', border: 'none', color: visCols.skid ? '#ea580c' : '#64748b', background: visCols.skid ? '#fff7ed' : 'transparent', transition: 'all 0.2s' }}>SKID</button>
            <button onClick={() => toggleCol('inversor')} style={{ padding: '4px 8px', borderRadius: 6, fontSize: 13, fontWeight: visCols.inversor ? 600 : 500, cursor: 'pointer', border: 'none', color: visCols.inversor ? '#ea580c' : '#64748b', background: visCols.inversor ? '#fff7ed' : 'transparent', transition: 'all 0.2s' }}>Inversor</button>
            <button onClick={() => toggleCol('kwp')} style={{ padding: '4px 8px', borderRadius: 6, fontSize: 13, fontWeight: visCols.kwp ? 600 : 500, cursor: 'pointer', border: 'none', color: visCols.kwp ? '#ea580c' : '#64748b', background: visCols.kwp ? '#fff7ed' : 'transparent', transition: 'all 0.2s' }}>kWp</button>
            <button onClick={() => toggleCol('valor')} style={{ padding: '4px 8px', borderRadius: 6, fontSize: 13, fontWeight: visCols.valor ? 600 : 500, cursor: 'pointer', border: 'none', color: visCols.valor ? '#ea580c' : '#64748b', background: visCols.valor ? '#fff7ed' : 'transparent', transition: 'all 0.2s' }}>Valor</button>
            <button onClick={() => toggleCol('yield')} style={{ padding: '4px 8px', borderRadius: 6, fontSize: 13, fontWeight: visCols.yield ? 600 : 500, cursor: 'pointer', border: 'none', color: visCols.yield ? '#ea580c' : '#64748b', background: visCols.yield ? '#fff7ed' : 'transparent', transition: 'all 0.2s' }}>Yield</button>
            <button onClick={() => toggleCol('desvio')} style={{ padding: '4px 8px', borderRadius: 6, fontSize: 13, fontWeight: visCols.desvio ? 600 : 500, cursor: 'pointer', border: 'none', color: visCols.desvio ? '#ea580c' : '#64748b', background: visCols.desvio ? '#fff7ed' : 'transparent', transition: 'all 0.2s' }}>Desvio Média</button>
            <button onClick={() => toggleCol('desvioMax')} style={{ padding: '4px 8px', borderRadius: 6, fontSize: 13, fontWeight: visCols.desvioMax ? 600 : 500, cursor: 'pointer', border: 'none', color: visCols.desvioMax ? '#ea580c' : '#64748b', background: visCols.desvioMax ? '#fff7ed' : 'transparent', transition: 'all 0.2s' }}>Desvio Máx</button>
          </div>
        </div>

        <button
          className="btn btn-primary"
          style={{ padding: '6px 16px', flexShrink: 0, fontWeight: 600 }}
          onClick={() => load(elemento)}
          disabled={loading}
        >
          {loading ? '⏳ Processando...' : '🏆 Processar'}
        </button>

        {rankingData && !loading && (
          <div style={{ position: 'relative', display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 16px', flexShrink: 0, fontWeight: 600, background: '#e2e8f0', color: '#1e293b', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px' }}
              onClick={() => exportTableToPng(tableRef.current, 'Ranking.png')}
              title="Exportar ranking atual como Imagem PNG"
            >
              🖼️ PNG
            </button>
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 16px', flexShrink: 0, fontWeight: 600, background: '#ffffff', color: '#1e293b', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px' }}
              onClick={() => setShowPdfMenu(!showPdfMenu)}
              title="Exportar ranking atual para PDF"
            >
              📄 PDF
            </button>
            
            {showPdfMenu && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 8, zIndex: 50, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>Orientação</div>
                <button 
                  onClick={() => { setShowPdfMenu(false); exportTableToPdf(tableRef.current, 'Ranking.pdf', { usinaName: usina || 'N/D', forceOrientation: 'p' }) }} 
                  style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', border: '1px solid var(--border)', background: '#f8fafc', borderRadius: 4, textAlign: 'left', color: '#334155', fontWeight: 500 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                >
                  📄 Retrato (Vertical)
                </button>
                <button 
                  onClick={() => { setShowPdfMenu(false); exportTableToPdf(tableRef.current, 'Ranking.pdf', { usinaName: usina || 'N/D', forceOrientation: 'l' }) }} 
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

      {rankingData && !loading && (
        <div ref={tableRef} style={{ overflow: 'auto', alignSelf: 'flex-start', maxWidth: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 'calc(41px * 16)', position: 'relative' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontFamily: 'Inter, sans-serif', fontSize: 13, width: 'max-content' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <td style={{...hdCell, borderLeft: '3px solid #0f172a', width: 'auto', minWidth: 50, textAlign: 'center'}}>#</td>
                {visCols.skid && <td style={{...hdCell, width: 'auto', minWidth: 80}}>SKID</td>}
                {visCols.inversor && <td style={{...hdCell, width: 'auto', minWidth: 90}}>Inversor</td>}
                {visCols.kwp && <td style={{...hdCell, textAlign: 'right', width: 'auto', minWidth: 80}}>kWp</td>}
                {visCols.valor && <td style={{...hdCell, textAlign: 'right', width: 'auto', minWidth: 100}}>Valor</td>}
                {visCols.yield && <td style={{...hdCell, textAlign: 'right', width: 'auto', minWidth: 80}}>Yield</td>}
                {visCols.desvio && <td style={{...hdCell, textAlign: 'center', width: 'auto', minWidth: 120}}>Desvio da Média</td>}
                {visCols.desvioMax && <td style={{...hdCell, textAlign: 'center', width: 'auto', minWidth: 120}}>Desvio do Máximo</td>}
              </tr>
            </thead>
            <tbody>
              {rankingData.rows.map((row, index) => {
                const { bg, text } = rankingData.getDesvioColor(row.yield, rankingData.globalMean)
                const { bg: bgMax, text: textMax } = rankingData.getDesvioColor(row.yield, rankingData.globalMax)

                return (
                  <tr key={`${row.skid}_${row.inversor}`} style={{ height: 26, background: '#ffffff', transition: 'background 0.15s' }} className="hover:bg-slate-50">
                    <td style={{...cell, borderLeft: '3px solid #0f172a', borderBottom: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 'bold', color: '#64748b', whiteSpace: 'nowrap'}}>
                      {index + 1}°
                    </td>
                    {visCols.skid && <td style={{...cell, borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap'}}>{row.skid}</td>}
                    {visCols.inversor && <td style={{...cell, borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#0ea5e9', whiteSpace: 'nowrap'}}>{row.inversor}</td>}
                    {visCols.kwp && <td style={{...cell, borderBottom: '1px solid #e2e8f0', textAlign: 'right', color: '#0ea5e9', whiteSpace: 'nowrap'}}>{row.kwp > 0 ? row.kwp.toFixed(3) : '-'}</td>}
                    {visCols.valor && <td style={{...cell, borderBottom: '1px solid #e2e8f0', textAlign: 'right', whiteSpace: 'nowrap'}}>{fmt(row.val)}</td>}
                    {visCols.yield && <td style={{...cell, borderBottom: '1px solid #e2e8f0', textAlign: 'right', color: '#475569', fontWeight: 700, whiteSpace: 'nowrap'}}>{fmt(row.yield)}</td>}
                    {visCols.desvio && <td style={{...cell, borderBottom: '1px solid #e2e8f0', background: bg, color: text, fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap'}}>
                      {fmtP(row.yield, rankingData.globalMean)}
                    </td>}
                    {visCols.desvioMax && <td style={{...cell, borderBottom: '1px solid #e2e8f0', background: bgMax, color: textMax, fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap'}}>
                      {fmtP(row.yield, rankingData.globalMax)}
                    </td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {rankingData && rankingData.rows.length === 0 && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, flex: 1, color: 'var(--text-muted)', textAlign: 'center' }}>
          <span style={{ fontSize: 32 }}>😞</span>
          <strong style={{ color: 'var(--text-secondary)', fontSize: 16 }}>Nenhum inversor com dados de Yield encontrados</strong>
        </div>
      )}

      {!rankingData && !loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, flex: 1, color: 'var(--text-muted)', textAlign: 'center' }}>
          <span style={{ fontSize: 48 }}>🏆</span>
          <strong style={{ color: 'var(--text-secondary)', fontSize: 16 }}>Ranking de Inversores</strong>
          <p style={{ fontSize: 13, maxWidth: 500 }}>
            Inicie selecionando o elemento e o tipo de operação para que o sistema construa o ranking da usina neste período.
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

const cell = {
  padding: '4px 12px',
  fontSize: 11,
  borderRight: '1px solid #e2e8f0',
}
