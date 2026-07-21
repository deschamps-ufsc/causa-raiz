import { useState, useEffect, useRef } from 'react'
import Plot from 'react-plotly.js'

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

/**
 * Heatmap de todas as séries × timestamps.
 * Colorscale YlOrRd: verde=baixo, amarelo=médio, vermelho=alto.
 */
export default function Heatmap({ data }) {
  const [revision, setRevision] = useState(0)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(() => {
      setRevision(r => r + 1)
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  if (!data || !data.timestamps?.length) return null

  const seriesNames = Object.keys(data.series)
  if (!seriesNames.length) return null

  // Matrix: linhas = séries, colunas = timestamps
  const zValues = seriesNames.map((name) => data.series[name])

  // Formatar timestamps para exibição concisa (HH:MM)
  const xLabels = data.timestamps.map((t) => t.slice(11, 16)) // "HH:MM"

  const trace = {
    type: 'heatmap',
    z: zValues,
    x: xLabels,
    y: seriesNames.map(formatSeriesName),
    colorscale: 'YlOrRd',
    showscale: true,
    hoverongaps: false,
    hovertemplate: '<b>%{y}</b><br>Hora: %{x}<br>Valor: %{z:.4g}<extra></extra>',
    colorbar: {
      thickness: 14,
      outlinewidth: 0,
      tickfont: { color: '#94a3b8', size: 11 },
      bgcolor: 'rgba(0,0,0,0)',
    },
  }

  const layout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { family: 'Inter, sans-serif', color: '#94a3b8', size: 11 },
    margin: { t: 10, r: 80, b: 60, l: Math.min(seriesNames.reduce((m, n) => Math.max(m, n.length), 0) * 7, 260) },
    xaxis: {
      gridcolor: 'transparent',
      tickfont: { size: 10 },
      tickangle: -45,
      nticks: 24,
    },
    yaxis: {
      gridcolor: 'transparent',
      tickfont: { size: 10 },
      automargin: true,
    },
    modebar: { bgcolor: 'transparent', color: '#94a3b8', activecolor: '#f59e0b' },
  }

  return (
    <div ref={containerRef} style={{ width: '100%', minHeight: Math.max(300, seriesNames.length * 22 + 100) }}>
      <Plot
        data={[trace]}
        layout={layout}
        revision={revision}
        config={{
          responsive: true,
          displaylogo: false,
          toImageButtonOptions: { format: 'png', filename: 'usina_solar_heatmap', scale: 2 },
        }}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler
      />
    </div>
  )
}
