import React, { useState, useEffect, useMemo } from 'react'
import { fetchPivotHeatmap, fetchSeries, fetchMappingData } from '../services/api'

export default function RankingTab({ usina, dates, activeFilters = [] }) {
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [elemento, setElemento]   = useState('')
  const [allSeries, setAllSeries] = useState([])
  
  const [aggType, setAggType]     = useState('soma')
  const [visCols, setVisCols]     = useState({ skid: true, inversor: true, kwp: true, valor: true, yield: true, desvio: true })

  const toggleCol = (col) => setVisCols(prev => ({ ...prev, [col]: !prev[col] }))

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
    } catch (e) {
      setError(e.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  const rankingData = useMemo(() => {
    if (!data || data.length === 0) return null

    const invMap = new Map()

    data.forEach(r => {
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
    rows.sort((a, b) => b.yield - a.yield) // from best to worst

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
      rows,
      globalMean,
      getDesvioColor
    }
  }, [data, aggType])

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      {/* Controles Dinâmicos */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, flexShrink: 0 }}>
        
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
              <input type="checkbox" checked={visCols.skid} onChange={() => toggleCol('skid')} style={{ accentColor: '#0ea5e9', width: 14, height: 14 }} /> SKID
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={visCols.inversor} onChange={() => toggleCol('inversor')} style={{ accentColor: '#0ea5e9', width: 14, height: 14 }} /> Inversor
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
          {loading ? '⏳ Processando...' : '🏆 Exibir Ranking'}
        </button>
      </div>

      {error && <div className="alert alert-error fade-in">⚠️ {error}</div>}

      {/* Tabela de Ranking */}
      {rankingData && !loading && (
        <div style={{ overflow: 'auto', alignSelf: 'flex-start', maxWidth: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 'calc(41px * 16)', position: 'relative' }}>
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
              </tr>
            </thead>
            <tbody>
              {rankingData.rows.map((row, index) => {
                const { bg, text } = rankingData.getDesvioColor(row.yield)
                return (
                  <tr key={`${row.skid}_${row.inversor}`} style={{ height: 36, background: '#ffffff', transition: 'background 0.15s' }} className="hover:bg-slate-50">
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
  padding: '10px 12px',
  border: '1px solid rgba(255,255,255,0.02)',
}

const cell = {
  padding: '8px 12px',
  borderRight: '1px solid #e2e8f0',
}
