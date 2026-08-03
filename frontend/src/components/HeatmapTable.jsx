import React from 'react'

export default function HeatmapTable({
  pivotData,
  flatRows,
  visCols,
  expandedPaths,
  toggleExpand,
  fmt,
  fmtP,
  topLeftText = 'Navegação',
  isAggregated = false
}) {
  const headerBgColor = isAggregated ? '#1e3a8a' : '#162032' // blue-900 vs slate-900
  const headerBorderColor = isAggregated ? '#172554' : '#0f172a' // blue-950 vs slate-950

  return (
    <table style={{ borderCollapse: 'collapse', fontFamily: 'Inter, sans-serif', fontSize: 12, width: '100%', minWidth: 800 }}>
      <thead>
        {/* Header Principal de Colunas */}
        <tr>
          <td rowSpan={2} style={{ ...hdCell, background: headerBgColor, width: 140, left: 0, position: 'sticky', zIndex: 3, borderRight: `3px solid ${headerBorderColor}` }}>
            <div style={{ color: '#ffffff', fontWeight: 600, fontSize: 11 }}>{topLeftText}</div>
          </td>
          {pivotData.cols.map(c => {
            const activeColsCount = [visCols.variavel, visCols.kwp, visCols.valor, visCols.yield, visCols.desvio, visCols.desvioMax].filter(Boolean).length
            if (activeColsCount === 0) return null
            return (
              <td key={c} colSpan={activeColsCount} style={{ ...hdCell, background: headerBgColor, textAlign: 'center', borderBottom: '1px solid #475569', borderLeft: `3px solid ${headerBorderColor}` }}>
                {c}
              </td>
            )
          })}
        </tr>
        {/* Sub Header de Métricas */}
        <tr>
          {pivotData.cols.map(c => {
            let isFirst = true
            const bL = () => { const res = isFirst ? `3px solid ${headerBorderColor}` : undefined; isFirst = false; return res }
            return (
              <React.Fragment key={`sub_${c}`}>
                {visCols.variavel && <td style={{ ...subHd, borderLeft: bL(), textAlign: 'left', paddingLeft: 8 }}>Variável</td>}
                {visCols.kwp && <td style={{ ...subHd, borderLeft: bL() }}>kWp</td>}
                {visCols.valor && <td style={{ ...subHd, borderLeft: bL() }}>Valor</td>}
                {visCols.yield && <td style={{ ...subHd, borderLeft: bL() }}>Yield</td>}
                {visCols.desvio && <td style={{ ...subHd, borderLeft: bL() }}>Desvio Média</td>}
                {visCols.desvioMax && <td style={{ ...subHd, borderLeft: bL() }}>Desvio Máx</td>}
              </React.Fragment>
            )
          })}
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
              borderRight: `3px solid ${headerBorderColor}`,
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
                    {visCols.variavel && <td style={{ ...cell, borderLeft: bL(), background: cBg }}></td>}
                    {visCols.kwp && <td style={{ ...cell, borderLeft: bL(), background: cBg }}>-</td>}
                    {visCols.valor && <td style={{ ...cell, borderLeft: bL(), background: cBg }}>-</td>}
                    {visCols.yield && <td style={{ ...cell, borderLeft: bL(), background: cBg }}>-</td>}
                    {visCols.desvio && <td style={{ ...cell, borderLeft: bL(), background: cBg }}>-</td>}
                    {visCols.desvioMax && <td style={{ ...cell, borderLeft: bL(), background: cBg }}>-</td>}
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
                          <td style={{ ...cell, borderLeft: bL(), background: cBg, textAlign: 'left', paddingLeft: 8, fontSize: 11, whiteSpace: 'nowrap', fontWeight: n.level < 2 ? 600 : 400, color: '#475569' }} title={rowVals.serieName}>
                            {rowVals.serieName}
                          </td>
                        )}
                        {visCols.kwp && <td style={{ ...cell, borderLeft: bL(), background: cBg, color: '#0ea5e9' }}>{rowVals.displayKwp > 0 ? rowVals.displayKwp.toFixed(3) : '-'}</td>}
                        {visCols.valor && <td style={{ ...cell, borderLeft: bL(), background: cBg }}>{fmt(rowVals.displayVal)}</td>}
                        {visCols.yield && <td style={{ ...cell, borderLeft: bL(), background: cBg, color: '#475569', fontWeight: 600 }}>{fmt(rowVals.yield)}</td>}
                        {visCols.desvio && <td style={{ ...cell, borderLeft: bL(), background: bg, color: text, fontWeight: 700 }}>
                          {fmtP(rowVals.yield, pivotData.globalMean)}
                        </td>}
                        {visCols.desvioMax && <td style={{ ...cell, borderLeft: bL(), background: bgMax, color: textMax, fontWeight: 700 }}>
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
