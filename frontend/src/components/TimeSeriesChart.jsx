import { useState, useEffect, useMemo, useRef } from 'react'
import PlotWrapper from 'react-plotly.js'
const Plot = PlotWrapper.default || PlotWrapper

import { EXCEL_THEME, COLORS } from '../constants/palette'
import SharedColorPicker from './SharedColorPicker'
import { useChartSettings } from '../hooks/ChartSettingsContext'

const CHIP_HIDDEN = {
  background: '#f1f5f9', color: '#94a3b8',
  border: '1.5px solid #e2e8f0', cursor: 'grab',
  textDecoration: 'line-through', opacity: 0.7,
}

export default function TimeSeriesChart({ data, usina, seriesDict = {}, filterColors = {}, chartConfig, setChartConfig }) {
  const {
    gridX, gridY1, gridY2, gridY3,
    xGridSpacing, xLimits, y1Limits, y2Limits, y3Limits, appliedRanges,
    seriesAxisMap, seriesColors, seriesWidths, seriesDashes, seriesFills
  } = chartConfig || {
    gridX: true, gridY1: true, gridY2: false, gridY3: false,
    xGridSpacing: '',
    xLimits: { min: '', max: '' }, y1Limits: { min: '', max: '' }, y2Limits: { min: '', max: '' }, y3Limits: { min: '', max: '' },
    appliedRanges: { x: undefined, y1: undefined, y2: undefined, y3: undefined },
    seriesAxisMap: {}, seriesColors: {}, seriesWidths: {}, seriesDashes: {}, seriesFills: {}
  }

  const setConfigVal = (key, valueOrFn) => {
    if (setChartConfig) {
      setChartConfig(prev => ({
        ...prev,
        [key]: typeof valueOrFn === 'function' ? valueOrFn(prev[key] || (Array.isArray(prev[key]) ? [] : {})) : valueOrFn
      }))
    }
  }

  const setGridX = val => setConfigVal('gridX', val)
  const setGridY1 = val => setConfigVal('gridY1', val)
  const setGridY2 = val => setConfigVal('gridY2', val)
  const setGridY3 = val => setConfigVal('gridY3', val)
  const setXGridSpacing = val => setConfigVal('xGridSpacing', val)
  const setXLimits = val => setConfigVal('xLimits', val)
  const setY1Limits = val => setConfigVal('y1Limits', val)
  const setY2Limits = val => setConfigVal('y2Limits', val)
  const setY3Limits = val => setConfigVal('y3Limits', val)
  const setAppliedRanges = val => setConfigVal('appliedRanges', val)
  const setSeriesAxisMap = val => setConfigVal('seriesAxisMap', val)
  const setSeriesColors = val => setConfigVal('seriesColors', val)
  const setSeriesWidths = val => setConfigVal('seriesWidths', val)
  const setSeriesDashes = val => setConfigVal('seriesDashes', val)
  const setSeriesFills = val => setConfigVal('seriesFills', val)
  const [colorPickerFor,  setColorPickerFor]  = useState(null) // nome da série com picker aberto
  const [axesOpen,        setAxesOpen]        = useState(false)
  const [dragOver,        setDragOver]        = useState(null)
  const [plotRevision,    setPlotRevision]    = useState(0)
  const [plotMountKey,    setPlotMountKey]    = useState(0)
  const containerRef = useRef(null)


  const { elementSettings } = useChartSettings()

  // Keep always-fresh refs for use inside useEffect (avoids stale closure)
  const elementSettingsRef = useRef(elementSettings)
  const seriesDictRef      = useRef(seriesDict)
  useEffect(() => { elementSettingsRef.current = elementSettings }, [elementSettings])
  useEffect(() => { seriesDictRef.current = seriesDict }, [seriesDict])

  const bumpRevision = () => setPlotRevision(r => r + 1)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      // Disparamos um evento global de resize para forçar o Plotly a recalcular.
      // Isso é mais confiável que apenas o 'revision' quando há ticks manuais.
      window.dispatchEvent(new Event('resize'))
      bumpRevision()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [containerRef.current, xGridSpacing]) // Re-vincula se a grade mudar para garantir estado fresco

  // Lookup helper: returns the ChartSettings entry for a series by its element
  const getElementDefault = (seriesName) => {
    const elem = seriesDictRef.current[seriesName]?.elemento
    if (!elem) return null
    return elementSettingsRef.current.find(s => s.element === elem) || null
  }

  const seriesNames = useMemo(
    () => (data?.series ? Object.keys(data.series) : []),
    [data]
  )

  useEffect(() => {
    bumpRevision()
  }, [xGridSpacing])

  useEffect(() => {
    bumpRevision()
    setAppliedRanges({ x: undefined, y1: undefined, y2: undefined, y3: undefined })
    setXLimits({ min: '', max: '' })
    setY1Limits({ min: '', max: '' })
    setY2Limits({ min: '', max: '' })
    setY3Limits({ min: '', max: '' })
  }, [data])
  // When new series appear, apply defaults from ChartSettingsContext (element config)
  // Colors are assigned sequentially per element (1st series → colors[0], 2nd → colors[1], ...)
  useEffect(() => {
    let axisChanged = false, colorChanged = false, widthChanged = false, dashChanged = false
    const nextAxis   = {}
    const nextColors = {}
    const nextWidths = {}
    const nextDashes = {}

    // Track how many series of each element we've assigned so far (for sequential colors)
    const elementColorCount = {}

    seriesNames.forEach(name => {
      const def = getElementDefault(name)
      const elem = seriesDictRef.current[name]?.elemento || name

      // Axis
      if (!seriesAxisMap[name]) {
        nextAxis[name] = def?.axis ?? 'y1'
        axisChanged = true
      }
      // Color — sequential cycling through the colors array
      if (!seriesColors[name]) {
        const palette = def?.colors
        if (palette?.length) {
          if (!elementColorCount[elem]) elementColorCount[elem] = 0
          nextColors[name] = palette[elementColorCount[elem] % palette.length]
          elementColorCount[elem]++
        } else {
          nextColors[name] = COLORS[seriesNames.indexOf(name) % COLORS.length]
        }
        colorChanged = true
      }
      // Width
      if (!seriesWidths[name] && def?.width) {
        nextWidths[name] = def.width
        widthChanged = true
      }
      // Dash
      if (!seriesDashes[name] && def?.dash) {
        nextDashes[name] = def.dash
        dashChanged = true
      }
    })

    if (axisChanged)   setSeriesAxisMap(prev => ({ ...prev, ...nextAxis }))
    if (colorChanged)  setSeriesColors(prev  => ({ ...prev,  ...nextColors }))
    if (widthChanged)  setSeriesWidths(prev  => ({ ...prev,  ...nextWidths }))
    if (dashChanged)   setSeriesDashes(prev  => ({ ...prev, ...nextDashes }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesNames])

  if (!data?.timestamps?.length) return null

  const baseDate     = data.date || ''
  const visibleNames = seriesNames.filter(n => (seriesAxisMap[n] || 'y1') !== 'hidden')
  const hiddenNames  = seriesNames.filter(n => seriesAxisMap[n] === 'hidden')
  const y1Names      = seriesNames.filter(n => (seriesAxisMap[n] || 'y1') === 'y1')
  const y2Names      = seriesNames.filter(n => seriesAxisMap[n] === 'y2')
  const y3Names      = seriesNames.filter(n => seriesAxisMap[n] === 'y3')
  const hasY3        = y3Names.length > 0

  // Returns the current color for a series: user override → resolved at init → auto-cycle palette
  const getColor = (name) => {
    if (filterColors && filterColors[name]) return filterColors[name]
    return seriesColors[name] || COLORS[seriesNames.indexOf(name) % COLORS.length]
  }

  // Returns width/dash: user override → element default → global default
  const getWidth = (name) => {
    if (seriesWidths[name]) return seriesWidths[name]
    const def = getElementDefault(name)
    return def?.width ?? 1.5
  }
  const getDash = (name) => {
    if (seriesDashes[name]) return seriesDashes[name]
    const def = getElementDefault(name)
    return def?.dash ?? 'solid'
  }

  const hexToRgba = (hex, alpha) => {
    if (!hex || !hex.startsWith('#')) return hex
    const r = parseInt(hex.slice(1, 3), 16) || 0
    const g = parseInt(hex.slice(3, 5), 16) || 0
    const b = parseInt(hex.slice(5, 7), 16) || 0
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  // ── Drag and Drop ─────────────────────────────────────────────────
  const handleDrop = (targetAxis) => (e) => {
    e.preventDefault()
    setDragOver(null)
    const name = e.dataTransfer.getData('text/plain')
    if (!name || !seriesNames.includes(name)) return
    setSeriesAxisMap(prev => ({ ...prev, [name]: targetAxis }))
    setPlotMountKey(k => k + 1)
    bumpRevision()
  }

  const handleDragOver = (zone) => (e) => {
    e.preventDefault()
    setDragOver(zone)
  }

  const hideShow = (name) => {
    setSeriesAxisMap(prev => {
      const cur = prev[name] || 'y1'
      return { ...prev, [name]: cur === 'hidden' ? 'y1' : 'hidden' }
    })
    setPlotMountKey(k => k + 1)
    bumpRevision()
  }

  // ── Traces Principais ─────────────────────────────────────────────
  const traces = useMemo(() => {
    const mainTraces = visibleNames.flatMap(name => {
      const axis = seriesAxisMap[name] || 'y1'
      const isFilled = seriesFills[name] !== undefined

      const baseTrace = {
        type: 'scatter',
        mode: 'lines',
        name,
        yaxis: axis === 'y1' ? 'y' : axis,
        line: { color: getColor(name), width: getWidth(name), dash: getDash(name) },
        fill: isFilled ? 'tozeroy' : 'none',
        fillcolor: isFilled ? hexToRgba(getColor(name), seriesFills[name] / 100) : undefined,
        hovertemplate: `&nbsp;&nbsp;<b>${name}</b><br>&nbsp;&nbsp;Valor: %{y:.4g}<extra></extra>`,
        connectgaps: false,
        legendgroup: name,
        showlegend: true
      }

      if (!isFilled) {
        return [{ ...baseTrace, x: data.timestamps, y: data.series[name] }]
      }

      // Plotly Bug: 'fill' bridges over nulls even when connectgaps is false.
      // Solução: quebrar a série em vários pedaços (traces) onde houver dados contínuos.
      const chunks = []
      let currentX = []
      let currentY = []
      const values = data.series[name]
      const times = data.timestamps
      let chunkIndex = 0

      for (let i = 0; i < values.length; i++) {
        const val = values[i]
        if (val === null || val === undefined || Number.isNaN(val)) {
          if (currentX.length > 0) {
            chunks.push({ ...baseTrace, x: currentX, y: currentY, showlegend: chunkIndex === 0 })
            chunkIndex++
            currentX = []
            currentY = []
          }
        } else {
          currentX.push(times[i])
          currentY.push(val)
        }
      }

      if (currentX.length > 0) {
        chunks.push({ ...baseTrace, x: currentX, y: currentY, showlegend: chunkIndex === 0 })
      } else if (chunkIndex === 0) {
        // Se a série inteira for nula, garantimos que ela apareça na legenda
        chunks.push({ ...baseTrace, x: [], y: [] })
      }

      return chunks
    })

    // ── Faixas de Filtro (Topo) ───────────────────────────────────────
    const visibleFilters = data?.visibleFilters || []
    const filterTraces = visibleFilters.map((name, i) => {
      const yAxisRef = `y${i + 4}`
      
      // Mapeia onde o filtro é 1, e caso contrário 0 (cria uma onda quadrada com shape 'hv')
      const rawVals = data?.filterData?.[name] || data?.series?.[name] || []
      const yVals = rawVals.map(v => (v === 1 || v === 1.0 || v === "1" || v === true) ? 1 : 0)
      
      return {
        x: data.timestamps,
        y: yVals,
        type: 'scatter',
        mode: 'lines',
        fill: 'tozeroy', // Preenche para formar blocos
        name: `Filtro: ${name}`,
        yaxis: yAxisRef,
        line: { color: getColor(name), width: 0, shape: 'hv' },
        hovertemplate: `<b>${name}</b><extra></extra>`,
        connectgaps: false,
        hoverinfo: 'name'
      }
    })

    // Bug do Plotly: se o eixo Y primário ('y') estiver totalmente vazio, 
    // os eixos sobrepostos (y2, y3) podem falhar na renderização de suas linhas.
    // Injetamos um traço invisível no Y1 para forçar a criação correta do canvas base.
    let dummyY1 = []
    if (y1Names.length === 0 && data.timestamps.length > 0) {
      dummyY1 = [{
        x: [data.timestamps[0], data.timestamps[data.timestamps.length - 1]],
        y: [0, 0],
        yaxis: 'y',
        type: 'scatter',
        mode: 'lines',
        line: { color: 'transparent', width: 0 },
        showlegend: false,
        hoverinfo: 'none'
      }]
    }

    return [...mainTraces, ...filterTraces, ...dummyY1]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, seriesAxisMap, seriesColors, seriesWidths, seriesDashes, seriesFills, filterColors])

  // ── Layout ────────────────────────────────────────────────────────
  const layout = useMemo(() => {
    const visibleFilters = data?.visibleFilters || []
    
    // Margens e Domínios otimizados
    // Aumentamos o xDomainEnd para ganhar mais espaço de gráfico
    const xDomainEnd = hasY3 ? 0.90 : (y2Names.length > 0 ? 0.95 : 1.0)
    const xDomain = [0, xDomainEnd]
    
    const y2Pos = xDomainEnd
    const y3Pos = xDomainEnd + 0.035 // Reduzido de 0.05 para aproximar de Y2
    const legendX = (hasY3 ? y3Pos : y2Pos) + 0.05 // Aumentado de 0.02 para 0.05 para afastar da legenda
    
    // Margem direita suficiente para os eixos extras e a legenda
    const rightMargin = hasY3 ? 150 : (y2Names.length > 0 ? 100 : 20)

    // Calcula altura das faixas de filtro para esmagar os eixos Y normais (REDUZIDO PELA METADE)
    const filterHeight = Math.max(0.02, Math.min(0.04, 0.15 / (visibleFilters.length || 1)))
    const totalFiltersHeight = visibleFilters.length * filterHeight
    const mainYTop = visibleFilters.length > 0 ? (1 - totalFiltersHeight - 0.02) : 1
    const yDomain = [0, mainYTop]

    // Anotações para os títulos dos eixos no topo e DATAS no eixo X
    const dateAnnotations = []
    if (data?.timestamps?.length) {
      const uniqueDays = []
      data.timestamps.forEach(ts => {
        const d = ts.substring(0, 10)
        if (!uniqueDays.includes(d)) uniqueDays.push(d)
      })
      uniqueDays.forEach(d => {
        dateAnnotations.push({
          xref: 'x', yref: 'paper',
          x: `${d} 12:00:00`,
          y: -0.12, // Logo abaixo dos ticks de hora
          text: `<b>${d.split('-').reverse().join('/')}</b>`,
          showarrow: false,
          font: { size: 12, color: '#334155' },
          xanchor: 'center',
          yanchor: 'top'
        })
      })
    }

    const annotations = [
      ...dateAnnotations,
      {
        text: '<b>Y1</b>',
        xref: 'paper', yref: 'paper',
        x: 0, xanchor: 'center',
        y: 1.01, yanchor: 'bottom',
        showarrow: false,
        font: { size: 11, color: '#475569' }
      }
    ]

    if (y2Names.length > 0 || gridY2) {
      annotations.push({
        text: '<b>Y2</b>',
        xref: 'paper', yref: 'paper',
        x: y2Pos, xanchor: 'center',
        y: 1.01, yanchor: 'bottom',
        showarrow: false,
        font: { size: 11, color: '#475569' }
      })
    }

    if (hasY3 || gridY3) {
      annotations.push({
        text: '<b>Y3</b>',
        xref: 'paper', yref: 'paper',
        x: y3Pos, xanchor: 'center',
        y: 1.01, yanchor: 'bottom',
        showarrow: false,
        font: { size: 11, color: '#475569' }
      })
    }

    // Bypass Plotly's internal dtick generator to prevent freezes
    const generateXTicks = () => {
      if (!xGridSpacing || !data?.timestamps?.length) return undefined;
      const intervalMs = parseInt(xGridSpacing) * 3600000;
      const ticks = [];
      const startStr = data.timestamps[0];
      const endStr = data.timestamps[data.timestamps.length - 1];
      
      const dayStart = new Date(startStr.substring(0, 10) + 'T00:00:00');
      const endObj = new Date(endStr);
      
      let current = dayStart.getTime();
      const endMs = endObj.getTime();
      
      while (current <= endMs) {
        ticks.push(current);
        current += intervalMs;
      }
      return ticks;
    }

    const baseLayout = {
      paper_bgcolor: '#f8fafc',
      plot_bgcolor:  '#ffffff',
      font:   { family: 'Inter, sans-serif', color: '#475569', size: 12 },
      margin: { t: 55, r: rightMargin, b: 80, l: 50 }, // Aumentado b para 80 para caber as datas
      hovermode: 'x',
      hoverlabel: {
        font: { size: 11, family: 'Inter, sans-serif' }
      },
      uirevision: baseDate,
      annotations,
    xaxis: {
      type:       'date',
      domain:     xDomain,
      gridcolor:  gridX ? '#e2e8f0' : 'transparent',
      linecolor:  '#cbd5e1',
      tickfont:   { size: 11 },
      tickangle:  0, // Removido inclinação para ficar mais limpo com as datas abaixo
      tickformat: '%H:%M',
      title: { text: '', standoff: 10 }, // Removido 'Horário'
      showspikes: true,
      spikemode: 'across+marker',
      spikedash: 'dot',
      spikecolor: '#94a3b8',
      spikethickness: 1,
      tickmode:   xGridSpacing ? 'array' : 'auto',
      tickvals:   xGridSpacing ? generateXTicks() : undefined,
      range:      appliedRanges.x,
    },
      yaxis: {
        domain:        yDomain,
        gridcolor:     gridY1 ? '#e2e8f0' : 'transparent',
        linecolor:     '#cbd5e1',
        tickfont:      { size: 11 },
        zeroline:      gridY1,
        zerolinecolor: '#cbd5e1',
        range:         appliedRanges.y1,
        rangemode:     'tozero',
        title:         { text: '', font: { size: 11 } },
      },
      yaxis2: {
        visible:    y2Names.length > 0 || gridY2,
        gridcolor:  gridY2 ? '#e2e8f0' : 'transparent',
        linecolor:  '#cbd5e1',
        tickfont:   { size: 11 },
        zeroline:   gridY2,
        zerolinecolor: '#cbd5e1',
        overlaying: 'y',
        side:       'right',
        anchor:     'free',
        position:   y2Pos,
        range:      appliedRanges.y2,
        rangemode:  'tozero',
        title:      { text: '', font: { size: 11 } },
      },
      yaxis3: {
        visible:    hasY3 || gridY3,
        gridcolor:  gridY3 ? '#e2e8f0' : 'transparent',
        linecolor:  '#cbd5e1',
        tickfont:   { size: 11 },
        zeroline:   gridY3,
        zerolinecolor: '#cbd5e1',
        overlaying: 'y',
        side:       'right',
        anchor:     'free',
        position:   y3Pos,
        range:      appliedRanges.y3,
        rangemode:  'tozero',
        title:      { text: '', font: { size: 11 } },
      },
      legend: {
        bgcolor:     'rgba(255,255,255,0.9)',
        bordercolor: '#cbd5e1',
        borderwidth: 1,
        font:        { size: 11 },
        orientation: visibleNames.length > 8 ? 'h'   : 'v',
        x:           visibleNames.length > 8 ?  0    : legendX,
        y:           visibleNames.length > 8 ? -0.28 : 1, // Movido mais para baixo (-0.28) para não bater nas datas
        yanchor:     visibleNames.length > 8 ? 'top' : 'auto',
      },
      modebar: { bgcolor: 'transparent', color: '#94a3b8', activecolor: '#f59e0b' },
    }

    // Injeta os mini-eixos Y para cada Filtro visivel
    visibleFilters.forEach((name, i) => {
      const bottom = mainYTop + (i * filterHeight)
      const top = bottom + filterHeight * 0.85 // gap entre faixas
      baseLayout[`yaxis${i + 4}`] = {
        domain: [bottom, top],
        showgrid: false,
        zeroline: false,
        showticklabels: false,
        range: [0, 1.05], // Maximize a ocupação do fill 'tozeroy' (1.0 faria o topo tocar o limite)
        fixedrange: true, // fixo
      }
    })

    return baseLayout
  }, [gridX, gridY1, gridY2, gridY3, xGridSpacing, appliedRanges, visibleNames.length, baseDate, hasY3, data, filterColors, y2Names.length, y3Names.length])

  // ── onRelayout ────────────────────────────────────────────────────
  const handleRelayout = (e) => {
    if (!e) return
    const getRange = (axis) => {
      if (e[`${axis}.autorange`]) return 'auto'
      const r0 = e[`${axis}.range[0]`] ?? e[`${axis}.range`]?.[0]
      const r1 = e[`${axis}.range[1]`] ?? e[`${axis}.range`]?.[1]
      return (r0 !== undefined && r1 !== undefined) ? [r0, r1] : null
    }
    const xRange = getRange('xaxis')
    if (xRange === 'auto') setXLimits({ min: '', max: '' })
    else if (xRange) {
      const m0 = String(xRange[0]).match(/(\d{2}:\d{2})/)
      const m1 = String(xRange[1]).match(/(\d{2}:\d{2})/)
      if (m0 || m1) setXLimits({ min: m0?.[1] || '', max: m1?.[1] || '' })
    }
    const y1Range = getRange('yaxis')
    if (y1Range === 'auto') setY1Limits({ min: '', max: '' })
    else if (y1Range) setY1Limits({ min: Math.round(+y1Range[0]), max: Math.round(+y1Range[1]) })
    const y2Range = getRange('yaxis2')
    if (y2Range === 'auto') setY2Limits({ min: '', max: '' })
    else if (y2Range) setY2Limits({ min: Math.round(+y2Range[0]), max: Math.round(+y2Range[1]) })
    const y3Range = getRange('yaxis3')
    if (y3Range === 'auto') setY3Limits({ min: '', max: '' })
    else if (y3Range) setY3Limits({ min: Math.round(+y3Range[0]), max: Math.round(+y3Range[1]) })
  }

  const makeApplyY = (key, limits) => () => {
    setAppliedRanges(p => {
      const minVal = limits.min !== '' ? +limits.min : null
      const maxVal = limits.max !== '' ? +limits.max : null
      return { ...p, [key]: (minVal !== null || maxVal !== null) ? [minVal, maxVal] : undefined }
    })
    bumpRevision()
  }

  const applyXLimits = () => {
    if ((xLimits.min || xLimits.max) && baseDate) {
      const toTime = t => t.length === 5 ? `${t}:00` : t
      const minVal = xLimits.min ? `${baseDate} ${toTime(xLimits.min)}` : null
      const maxVal = xLimits.max ? `${baseDate} ${toTime(xLimits.max)}` : null
      setAppliedRanges(p => ({ ...p, x: [minVal, maxVal] }))
    } else {
      setAppliedRanges(p => ({ ...p, x: undefined }))
    }
    bumpRevision()
  }

  // ── Color Picker ──────────────────────────────────────────────────
  const ColorPickerWrapper = ({ name, onClose }) => {
    const currentColor = getColor(name)
    const currentWidth = getWidth(name)
    const currentDash  = getDash(name)
    const currentFill  = seriesFills[name]

    const applyColor = (color) => {
      setSeriesColors(prev => ({ ...prev, [name]: color }))
      bumpRevision()
    }

    const applyWidth = (w) => {
      setSeriesWidths(prev => ({ ...prev, [name]: w }))
      bumpRevision()
    }

    const applyDash = (d) => {
      setSeriesDashes(prev => ({ ...prev, [name]: d }))
      bumpRevision()
    }

    // Local state to keep slider perfectly smooth
    const [localFill, setLocalFill] = useState(currentFill !== undefined ? currentFill : 20)

    useEffect(() => {
      if (currentFill !== undefined) setLocalFill(currentFill)
    }, [currentFill])

    const toggleFill = () => {
      setSeriesFills(prev => {
        const next = { ...prev }
        if (next[name] !== undefined) delete next[name]
        else next[name] = localFill
        return next
      })
      bumpRevision()
    }

    const handleSliderChange = (e) => {
      setLocalFill(parseInt(e.target.value))
    }

    const applyFillToChart = () => {
      if (currentFill !== undefined && localFill !== currentFill) {
        setSeriesFills(prev => ({ ...prev, [name]: localFill }))
        bumpRevision()
      }
    }

    return (
      <>
        <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={onClose} />
        <SharedColorPicker color={currentColor} onChange={applyColor} onClose={onClose}>
          {/* Divisor */}
          <div style={{ height: 1, background: '#e5e7eb', margin: '12px -10px' }} />

          {/* ESTILO DA LINHA */}
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>
            Estilo da Linha
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            {/* Espessura */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>ESPESSURA</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '4px 8px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                {[1, 1.5, 2.5, 3.5, 5].map((w) => (
                  <button
                    key={`width-${w}`}
                    onClick={() => applyWidth(w)}
                    title={`Espessura: ${w}`}
                    style={{
                      width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: currentWidth === w ? '#0f172a' : 'transparent',
                      border: 'none', cursor: 'pointer', padding: 0
                    }}
                  >
                    <div style={{ width: 12, height: w, background: currentWidth === w ? '#fff' : '#64748b', borderRadius: w / 2 }} />
                  </button>
                ))}
              </div>
            </div>

            {/* Tipo */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>TIPO</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '4px 8px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                {[
                  { id: 'solid', label: 'Contínua', dashArray: 'none' },
                  { id: 'dash',  label: 'Tracejada', dashArray: '4, 3' },
                  { id: 'dot',   label: 'Pontilhada', dashArray: '2, 2' }
                ].map((type) => (
                  <button
                    key={type.id}
                    onClick={() => applyDash(type.id)}
                    title={type.label}
                    style={{
                      width: 24, height: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: currentDash === type.id ? '#0f172a' : 'transparent',
                      border: 'none', cursor: 'pointer', padding: 0
                    }}
                  >
                    <svg width="16" height="4" xmlns="http://www.w3.org/2000/svg">
                      <line x1="0" y1="2" x2="16" y2="2" stroke={currentDash === type.id ? '#fff' : '#64748b'} strokeWidth="2" strokeDasharray={type.dashArray} strokeLinecap="round" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* PREENCHIMENTO */}
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '6px 8px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" id={`fill-${name}`} checked={currentFill !== undefined} onChange={toggleFill} style={{ cursor: 'pointer' }} />
              <label htmlFor={`fill-${name}`} style={{ fontSize: 10, fontWeight: 600, color: '#64748b', cursor: 'pointer', margin: 0 }}>
                Preencher área
              </label>
            </div>
            {currentFill !== undefined && (
              <div 
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                onPointerDown={e => e.stopPropagation()}
              >
                <input type="range" min="0" max="100" value={localFill} onChange={handleSliderChange} onPointerUp={applyFillToChart} style={{ width: 60, height: 4 }} />
                <span style={{ fontSize: 10, color: '#64748b', width: 24, textAlign: 'right', fontWeight: 600 }}>{localFill}%</span>
              </div>
            )}
          </div>
        </SharedColorPicker>
      </>
    )
  }

  // ── Series Chip ───────────────────────────────────────────────────
  const SeriesChip = ({ name }) => {
    const isHidden     = seriesAxisMap[name] === 'hidden'
    const color        = getColor(name)
    const isPickerOpen = colorPickerFor === name

    // Chip colorido quando ativo
    const activeStyle = {
      background: color + '18', // ~10% opacidade
      color,
      border: `1.5px solid ${color}55`,
      cursor: 'grab',
    }

    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <div
          draggable
          onDragStart={e => { e.dataTransfer.setData('text/plain', name); e.dataTransfer.effectAllowed = 'move' }}
          title="Arraste para trocar de eixo"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 11, padding: '3px 7px 3px 5px', borderRadius: 5,
            fontWeight: 600, userSelect: 'none', transition: 'opacity 0.15s',
            ...(isHidden ? CHIP_HIDDEN : activeStyle),
          }}
        >
          {/* Swatch clicável para trocar cor */}
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation()
              if (isHidden) return
              setColorPickerFor(prev => prev === name ? null : name)
            }}
            title={isHidden ? '' : 'Trocar cor'}
            style={{
              width: 13, height: 13, borderRadius: 3, flexShrink: 0,
              background: isHidden ? '#94a3b8' : color,
              border: 'none', padding: 0,
              cursor: isHidden ? 'default' : 'pointer',
              transition: 'transform 0.12s',
              boxShadow: isHidden ? 'none' : `0 0 0 1.5px ${color}44`,
            }}
            onMouseEnter={e => !isHidden && (e.currentTarget.style.transform = 'scale(1.3)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          />

          <span style={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </span>

          <button
            onClick={() => hideShow(name)}
            title={isHidden ? 'Mostrar no gráfico' : 'Ocultar do gráfico'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: 13, lineHeight: 1, color: 'inherit', opacity: 0.55,
              display: 'flex', alignItems: 'center',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => e.currentTarget.style.opacity = '0.55'}
          >
            {isHidden ? '👁' : '×'}
          </button>
        </div>

        {isPickerOpen && (
          <ColorPickerWrapper name={name} onClose={() => setColorPickerFor(null)} />
        )}
      </div>
    )
  }

  // ── Drop Zone ─────────────────────────────────────────────────────
  const DropZone = ({ axis, label, names }) => {
    const isOver = dragOver === axis
    return (
      <div
        onDragOver={handleDragOver(axis)}
        onDragLeave={() => setDragOver(null)}
        onDrop={handleDrop(axis)}
        style={{
          flex: 1, borderRadius: 8, padding: '8px 10px', minHeight: 56,
          background: isOver ? 'rgba(100,116,139,0.08)' : '#f9fafb',
          border: `2px dashed ${isOver ? '#64748b' : 'var(--border)'}`,
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
          color: 'var(--text-secondary)', marginBottom: 6,
        }}>
          {label}
          {names.length > 0 && (
            <span style={{ fontWeight: 400, marginLeft: 6, color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>
              ({names.length})
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {names.map(n => <SeriesChip key={n} name={n} />)}
          {names.length === 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Arraste séries aqui
            </span>
          )}
        </div>
      </div>
    )
  }

  const YLimitsControl = ({ limits, setLimits, applyFn }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <input type="number" placeholder="Min" className="input" style={{ width: 60, height: 28, padding: '4px 6px' }}
        value={limits.min} onChange={e => setLimits(p => ({...p, min: e.target.value}))}
        onBlur={applyFn} onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
      <input type="number" placeholder="Max" className="input" style={{ width: 60, height: 28, padding: '4px 6px' }}
        value={limits.max} onChange={e => setLimits(p => ({...p, max: e.target.value}))}
        onBlur={applyFn} onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
    </div>
  )

  const AxisGroup = ({ title, children }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px',
      background: 'rgba(241,245,249,0.4)', border: '1px solid var(--border)', borderRadius: 8,
    }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{title}</span>
      {children}
    </div>
  )

  const VerticalSubDivider = () => null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>

      {/* ── Controles ─────────────────────────────────────────── */}
      <div style={{
        backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '8px', padding: '6px 8px',
        display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center'
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginRight: 2 }}>Eixos</span>
          <AxisGroup title="X">
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <input type="time" className="input" style={{ width: 80, height: 28, padding: '4px 6px' }}
              value={xLimits.min} onChange={e => setXLimits(p => ({...p, min: e.target.value}))}
              onBlur={applyXLimits} onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
            <input type="time" className="input" style={{ width: 80, height: 28, padding: '4px 6px' }}
              value={xLimits.max} onChange={e => setXLimits(p => ({...p, max: e.target.value}))}
              onBlur={applyXLimits} onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
          </div>


          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Intervalo:</span>
            <select className="input" style={{ padding: '2px 24px 2px 6px', minWidth: 60, fontSize: 12 }}
              value={xGridSpacing}
              onChange={e => { setXGridSpacing(e.target.value); bumpRevision() }}>
              <option value="">Auto</option>
              <option value="1">1h</option>
              <option value="2">2h</option>
              <option value="3">3h</option>
              <option value="4">4h</option>
              <option value="6">6h</option>
            </select>
          </div>


          <label className="checkbox-row" style={{ padding: 0 }}>
            <input type="checkbox" checked={gridX} onChange={e => { setGridX(e.target.checked); bumpRevision() }} />
            <span style={{ fontSize: '11px', fontWeight: 600 }}>Grade</span>
          </label>
        </AxisGroup>

        <AxisGroup title="Y1">
          <YLimitsControl limits={y1Limits} setLimits={setY1Limits} applyFn={makeApplyY('y1', y1Limits)} />
          <label className="checkbox-row" style={{ padding: 0 }}>
            <input type="checkbox" checked={gridY1} onChange={e => { setGridY1(e.target.checked); bumpRevision() }} />
            <span style={{ fontSize: '11px', fontWeight: 600 }}>Grade</span>
          </label>
        </AxisGroup>

        <AxisGroup title="Y2">
          <YLimitsControl limits={y2Limits} setLimits={setY2Limits} applyFn={makeApplyY('y2', y2Limits)} />
          <label className="checkbox-row" style={{ padding: 0 }}>
            <input type="checkbox" checked={gridY2} onChange={e => { setGridY2(e.target.checked); bumpRevision() }} />
            <span style={{ fontSize: '11px', fontWeight: 600 }}>Grade</span>
          </label>
        </AxisGroup>

        <AxisGroup title="Y3">
          <YLimitsControl limits={y3Limits} setLimits={setY3Limits} applyFn={makeApplyY('y3', y3Limits)} />
          <label className="checkbox-row" style={{ padding: 0 }}>
            <input type="checkbox" checked={gridY3} onChange={e => { setGridY3(e.target.checked); bumpRevision() }} />
            <span style={{ fontSize: '11px', fontWeight: 600 }}>Grade</span>
          </label>
        </AxisGroup>

      </div>

      {/* ── Eixos (drag & drop) ──────────────────────────────── */}
      <div style={{
        backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 8, overflow: 'visible', flexShrink: 0, position: 'relative',
      }}>
        <button
          onClick={() => setAxesOpen(o => !o)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 12px', background: 'none', border: 'none',
            cursor: 'pointer', textAlign: 'left', borderRadius: 8,
          }}
        >
          <span style={{
            fontSize: 11, color: 'var(--text-secondary)',
            display: 'inline-block', transition: 'transform 0.2s', flexShrink: 0,
            transform: axesOpen ? 'rotate(90deg)' : 'rotate(0deg)',
          }}>▶</span>

          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>
            Séries
          </span>

          {/* Preview compacto quando fechado — usando cor da série */}
          {!axesOpen && (
            <div style={{
              display: 'flex', gap: 4, flexWrap: 'nowrap', overflow: 'hidden', flex: 1,
              maskImage: 'linear-gradient(to right, black 80%, transparent)',
              WebkitMaskImage: 'linear-gradient(to right, black 80%, transparent)',
            }}>
              {seriesNames.map(name => {
                const isHidden = seriesAxisMap[name] === 'hidden'
                const color = getColor(name)
                return (
                  <span key={name} style={{
                    fontSize: 11, padding: '1px 8px 1px 6px', borderRadius: 4,
                    whiteSpace: 'nowrap', flexShrink: 0, cursor: 'default',
                    display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600,
                    ...(isHidden
                      ? { ...CHIP_HIDDEN, cursor: 'default' }
                      : { background: color + '18', color, border: `1.5px solid ${color}55` }
                    ),
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: isHidden ? '#94a3b8' : color, display: 'inline-block', flexShrink: 0 }} />
                    {name}
                  </span>
                )
              })}
            </div>
          )}

          {hiddenNames.length > 0 && (
            <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {hiddenNames.length} oculta{hiddenNames.length > 1 ? 's' : ''}
            </span>
          )}

          <span style={{
            fontSize: 10, color: 'var(--text-muted)',
            marginLeft: hiddenNames.length > 0 ? 8 : 'auto',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            arraste · clique na cor · × ocultar
          </span>
        </button>

        {axesOpen && (
          <div style={{ padding: '8px 10px 10px', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <DropZone axis="y1" label="Eixo Y1" names={y1Names} />
              <DropZone axis="y2" label="Eixo Y2" names={y2Names} />
              <DropZone axis="y3" label="Eixo Y3" names={y3Names} />
            </div>

            {hiddenNames.length > 0 && (
              <div
                onDragOver={handleDragOver('hidden')}
                onDragLeave={() => setDragOver(null)}
                onDrop={handleDrop('hidden')}
                style={{
                  marginTop: 8, borderRadius: 8, padding: '7px 10px',
                  border: `2px dashed ${dragOver === 'hidden' ? '#64748b' : '#e2e8f0'}`,
                  background: dragOver === 'hidden' ? 'rgba(100,116,139,0.06)' : 'transparent',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
                  color: 'var(--text-muted)', marginBottom: 6,
                }}>
                  Ocultas ({hiddenNames.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {hiddenNames.map(n => <SeriesChip key={n} name={n} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Gráfico ──────────────────────────────────────────── */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 380 }}>
        <Plot
          key={plotMountKey}
          data={traces}
          layout={layout}
          revision={plotRevision}
          onRelayout={handleRelayout}
          config={{
            responsive: true,
            displaylogo: false,
            displayModeBar: true,
            modeBarButtonsToRemove: [
              'lasso2d', 'select2d',
              'zoomIn2d', 'zoomOut2d',
              'autoScale2d', 'hoverClosestCartesian', 'hoverCompareCartesian', 'toggleSpikelines',
            ],
            toImageButtonOptions: {
              format: 'png',
              filename: [
                'causa-raiz',
                usina  || 'usina',
                data?.date || 'data',
                `${visibleNames.length}series`,
              ].join('_'),
              height: null, width: null, scale: 2,
            },
          }}
          style={{ width: '100%', height: '100%' }}
          useResizeHandler
        />
      </div>
    </div>
  )
}
