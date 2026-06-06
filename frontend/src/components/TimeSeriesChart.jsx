import { useState, useEffect, useMemo, useRef, memo } from 'react'
import ReactDOM from 'react-dom'
import PlotWrapper from 'react-plotly.js'
const Plot = PlotWrapper.default || PlotWrapper
import Plotly from 'plotly.js/dist/plotly'

import { EXCEL_THEME, COLORS, LINE_WIDTHS } from '../constants/palette'
import SharedColorPicker from './SharedColorPicker'
import { useChartSettings } from '../hooks/ChartSettingsContext'

const CHIP_HIDDEN = {
  background: '#f1f5f9', color: '#94a3b8',
  border: '1.5px solid #e2e8f0', cursor: 'grab',
  textDecoration: 'line-through', opacity: 0.7,
}

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
  if (nameLower === 'energia') return 'Potência';
  return name;
}

export default memo(function TimeSeriesChart({ data, usina, seriesDict = {}, filterColors = {}, chartConfig, setChartConfig, showEixosMenu, showSeriesMenu, visibleFilters = [] }) {
  const {
    gridX, gridY1, gridY2, gridY3, gridY4,
    xGridSpacing, xLimits, y1Limits, y2Limits, y3Limits, y4Limits, appliedRanges,
    seriesAxisMap, seriesColors, seriesWidths, seriesDashes, seriesFills, legendPosition = 'right'
  } = chartConfig || {
    gridX: true, gridY1: true, gridY2: false, gridY3: false, gridY4: false,
    xGridSpacing: '',
    xLimits: { min: '', max: '' }, y1Limits: { min: '', max: '' }, y2Limits: { min: '', max: '' }, y3Limits: { min: '', max: '' }, y4Limits: { min: '', max: '' },
    appliedRanges: { x: undefined, y1: undefined, y2: undefined, y3: undefined, y4: undefined },
    seriesAxisMap: {}, seriesColors: {}, seriesWidths: {}, seriesDashes: {}, seriesFills: {}, legendPosition: 'right'
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
  const setGridY4 = val => setConfigVal('gridY4', val)
  const setXGridSpacing = val => setConfigVal('xGridSpacing', val)
  const setXLimits = val => setConfigVal('xLimits', val)
  const setY1Limits = val => setConfigVal('y1Limits', val)
  const setY2Limits = val => setConfigVal('y2Limits', val)
  const setY3Limits = val => setConfigVal('y3Limits', val)
  const setY4Limits = val => setConfigVal('y4Limits', val)
  const setAppliedRanges = val => setConfigVal('appliedRanges', val)
  const setSeriesAxisMap = val => setConfigVal('seriesAxisMap', val)
  const setSeriesColors = val => setConfigVal('seriesColors', val)
  const setSeriesWidths = val => setConfigVal('seriesWidths', val)
  const setSeriesDashes = val => setConfigVal('seriesDashes', val)
  const setSeriesFills = val => setConfigVal('seriesFills', val)
  const setLegendPosition = val => setConfigVal('legendPosition', val)
  const [colorPickerFor,  setColorPickerFor]  = useState(null) // nome da série com picker aberto
  const [axesOpen,        setAxesOpen]        = useState(false)
  const [dragOver,        setDragOver]        = useState(null)
  const [plotRevision,    setPlotRevision]    = useState(0)
  const [plotMountKey,    setPlotMountKey]    = useState(0)
  const containerRef    = useRef(null)
  const plotDivRef      = useRef(null)
  const plotWrapperRef  = useRef(null)
  const xDomainEndRef   = useRef(1.0)
  
  const [plotSize, setPlotSize] = useState({ width: 800, height: 400 })

  const [hoverState, setHoverState] = useState(null)
  const [hoverIndex, setHoverIndex] = useState(null)
  const hoverMarkerCountRef = useRef(0)
  const mousePosRef = useRef({ x: 0, y: 0 })

  // Navegação por janela de dias
  const [windowDays, setWindowDays] = useState(null)   // null = Max (sem filtro)
  const [windowStartIdx, setWindowStartIdx] = useState(0)

  // Dias únicos — declarado antes de qualquer useEffect que o referencia (evita TDZ)
  const uniqueDays = useMemo(() => {
    if (!data?.timestamps?.length) return []
    const seen = new Set()
    const days = []
    for (const t of data.timestamps) {
      const d = t.substring(0, 10)
      if (!seen.has(d)) { seen.add(d); days.push(d) }
    }
    return days
  }, [data])

  const handlePlotHover = (eventData) => {
    if (!eventData || !eventData.points || eventData.points.length === 0) return
    const point = eventData.points[0]
    const xVal = point.x
    
    const targetTime = new Date(xVal).getTime()
    const globalIdx = data.timestamps.findIndex(t => new Date(t).getTime() === targetTime)
    
    if (globalIdx === -1) {
      console.log('Hover time not found:', xVal)
      return
    }

    const mouseEvent = eventData.event
    if (!mouseEvent || !plotWrapperRef.current) return
    
    const containerRect = plotWrapperRef.current.getBoundingClientRect()
    const mouseY = mouseEvent.clientY - containerRect.top
    const containerWidth = containerRect.width
    const containerHeight = containerRect.height

    // Calcula as margens para saber o tamanho útil do gráfico
    const y2Names = seriesNames.filter(n => seriesAxisMap[n] === 'y2')
    const y3Names = seriesNames.filter(n => seriesAxisMap[n] === 'y3')
    const y4Names = seriesNames.filter(n => seriesAxisMap[n] === 'y4')
    const rightMargin = (y2Names.length > 0 || gridY2 ? 50 : 0) + 
                        (y3Names.length > 0 || gridY3 ? 50 : 0) + 
                        (y4Names.length > 0 || gridY4 ? 50 : 0) || 45

    const plotWidth = containerWidth - 45 - rightMargin // margin.l = 45
    const plotHeight = containerHeight - 45 - 50 // margin.t = 45, margin.b = 50

    // Calcula a posição X exata matematicamente (infalível contra falhas do c2p do Plotly)
    let spikePixelX = mouseEvent.clientX - containerRect.left
    if (point.xaxis && point.xaxis.range) {
      const r0 = point.xaxis.range[0]
      const r1 = point.xaxis.range[1]
      const minT = new Date(r0).getTime() || Number(r0)
      const maxT = new Date(r1).getTime() || Number(r1)
      const pT = new Date(point.x).getTime()
      
      if (maxT > minT && !isNaN(pT)) {
        const ratioX = (pT - minT) / (maxT - minT)
        if (ratioX >= 0 && ratioX <= 1) {
          spikePixelX = 45 + ratioX * plotWidth
        }
      }
    }

    const points = visibleNames
      .map(name => {
        const val = data.series[name]?.[globalIdx]
        return {
          name,
          value: val,
          color: getColor(name),
        }
      })
      .filter(pt => pt.value !== null && pt.value !== undefined && !Number.isNaN(pt.value))

    if (points.length === 0) {
      setHoverState(null)
      return
    }

    const timeStr = typeof xVal === 'string' && xVal.length >= 16 ? xVal.substring(11, 16) : String(xVal)

    // Usa a posição real do mouse (capturada via onMouseMove nativo, sem conversões)
    const tooltipWidth = 240
    const cursorX = mousePosRef.current.x
    const cursorY = mousePosRef.current.y
    const showOnLeft = cursorX + tooltipWidth + 14 > window.innerWidth
    const fixedLeft = showOnLeft ? cursorX - tooltipWidth - 10 : cursorX + 12

    const approxHalfHeight = (points.length * 20 + 40) / 2
    const clampedTop = Math.max(
      approxHalfHeight + 10,
      Math.min(window.innerHeight - approxHalfHeight - 10, cursorY)
    )

    setHoverIndex(globalIdx)
    setHoverState({
      timeStr,
      points,
      fixedLeft,
      fixedTop: clampedTop,
    })
  }

  const handlePlotUnhover = () => {
    setHoverState(null)
    setHoverIndex(null)
  }

  // ── Hover Marker Traces (imperativo) ───────────────────────────────
  // Usa a API imperativa do Plotly para adicionar/remover pontos sem re-render do React.
  // Isso evita que o autorange dos eixos Y seja recalculado a cada hover.
  useEffect(() => {
    const gd = plotDivRef.current
    if (!gd || !gd.data) return

    // Remove os traces de marcadores anteriores
    if (hoverMarkerCountRef.current > 0) {
      const totalTraces = gd.data.length
      const indicesToDelete = []
      for (let i = totalTraces - hoverMarkerCountRef.current; i < totalTraces; i++) {
        indicesToDelete.push(i)
      }
      if (indicesToDelete.length > 0) {
        Plotly.deleteTraces(gd, indicesToDelete)
      }
      hoverMarkerCountRef.current = 0
    }

    // Adiciona novos traces de marcadores se há hover ativo
    if (hoverIndex !== null && data?.timestamps) {
      const markerTraces = visibleNames.flatMap(name => {
        const val = data.series[name]?.[hoverIndex]
        if (val === null || val === undefined || Number.isNaN(val)) return []
        const axis = seriesAxisMap[name] || 'y1'
        const ts = data.timestamps[hoverIndex]
        return [{
          type: 'scatter',
          mode: 'markers',
          x: [ts],
          y: [val],
          yaxis: axis === 'y1' ? 'y' : axis,
          marker: { color: getColor(name), size: 8, line: { color: '#ffffff', width: 1.5 } },
          hoverinfo: 'skip',
          showlegend: false,
          name: '',
        }]
      })

      if (markerTraces.length > 0) {
        // Captura os ranges atuais ANTES de adicionar os traces
        const currentLayout = gd.layout
        const rangeBefore = {}
        ;['xaxis', 'yaxis', 'yaxis2', 'yaxis3', 'yaxis4'].forEach(ax => {
          if (currentLayout[ax]?.range) {
            rangeBefore[ax] = [...currentLayout[ax].range]
          }
        })
        Plotly.addTraces(gd, markerTraces)
        // Restaura os ranges imediatamente para cancelar qualquer autorange
        const rangeUpdate = {}
        Object.entries(rangeBefore).forEach(([ax, range]) => {
          rangeUpdate[`${ax}.range`] = range
          rangeUpdate[`${ax}.autorange`] = false
        })
        if (Object.keys(rangeUpdate).length > 0) {
          Plotly.relayout(gd, rangeUpdate)
        }
        hoverMarkerCountRef.current = markerTraces.length
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverIndex])

  useEffect(() => {
    if (!plotWrapperRef.current) return
    const ro = new ResizeObserver(entries => {
      for (let entry of entries) {
        setPlotSize({ width: entry.contentRect.width, height: entry.contentRect.height })
        setPlotRevision(r => r + 1)
      }
    })
    ro.observe(plotWrapperRef.current)
    return () => ro.disconnect()
  }, [])


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

  // Aplica a janela de dias sempre que ela mudar
  useEffect(() => {
    // Pequeno delay para garantir que o Plotly já inicializou o gráfico
    const t = setTimeout(() => applyDayWindow(windowStartIdx, windowDays), 80)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowDays, windowStartIdx, uniqueDays])

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
    setAppliedRanges({ x: undefined, y1: undefined, y2: undefined, y3: undefined, y4: undefined })
    setXLimits({ min: '', max: '' })
    setY1Limits({ min: '', max: '' })
    setY2Limits({ min: '', max: '' })
    setY3Limits({ min: '', max: '' })
    setY4Limits({ min: '', max: '' })
  // data.timestamps muda de referência apenas em nova query da API.
  // Ao aplicar filtro de máscara, o spread {...rawData} reutiliza o mesmo array,
  // então este effect NÃO dispara, preservando os ranges do gráfico.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.timestamps])
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
  // Helpers para o formato 'hidden:y2' que preserva o eixo anterior ao ocultar
  const isHiddenSeries = (axisVal) => axisVal != null && String(axisVal).startsWith('hidden')
  const prevAxisOf     = (axisVal) => String(axisVal).split(':')[1] || 'y1'

  // Aplica janela de dias no eixo X via API imperativa (sem re-render)
  const applyDayWindow = (startIdx, days) => {
    const gd = plotDivRef.current
    if (!gd) return
    if (days === null || uniqueDays.length === 0) {
      // Max: mostra tudo (autorange)
      Plotly.relayout(gd, { 'xaxis.autorange': true })
      return
    }
    const clampedStart = Math.max(0, Math.min(startIdx, uniqueDays.length - 1))
    const endIdx = Math.min(clampedStart + days - 1, uniqueDays.length - 1)
    Plotly.relayout(gd, {
      'xaxis.range': [`${uniqueDays[clampedStart]} 00:00:00`, `${uniqueDays[endIdx]} 23:59:59`],
      'xaxis.autorange': false,
    })
  }

  const visibleNames = seriesNames.filter(n => !isHiddenSeries(seriesAxisMap[n] || 'y1'))
  const hiddenNames  = seriesNames.filter(n => isHiddenSeries(seriesAxisMap[n]))
  const y1Names      = seriesNames.filter(n => (seriesAxisMap[n] || 'y1') === 'y1')
  const y2Names      = seriesNames.filter(n => seriesAxisMap[n] === 'y2')
  const y3Names      = seriesNames.filter(n => seriesAxisMap[n] === 'y3')
  const y4Names      = seriesNames.filter(n => seriesAxisMap[n] === 'y4')
  const hasY3        = y3Names.length > 0
  const hasY4        = y4Names.length > 0

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
      if (isHiddenSeries(cur)) {
        // Desoculta: retorna ao eixo que estava antes de ocultar
        return { ...prev, [name]: prevAxisOf(cur) }
      } else {
        // Oculta: codifica o eixo atual no valor para poder restaurar depois
        return { ...prev, [name]: `hidden:${cur}` }
      }
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
        name: formatSeriesName(name),
        yaxis: axis === 'y1' ? 'y' : axis,
        line: { color: getColor(name), width: getWidth(name), dash: getDash(name) },
        fill: isFilled ? 'tozeroy' : 'none',
        fillcolor: isFilled ? hexToRgba(getColor(name), seriesFills[name] / 100) : undefined,
        hovertemplate: '<extra></extra>',
        connectgaps: false,
        legendgroup: name,
        showlegend: true
      }

      if (!isFilled) {
        return [{ ...baseTrace, x: data.timestamps, y: data.series[name] }]
      }

      // Plotly Bug: 'fill' bridges over nulls even when connectgaps is false.
      // Solução Otimizada: Em vez de criar centenas de traces (o que trava a renderização e hover do Plotly),
      // criamos apenas 2 traces:
      // 1. O trace da linha, sem preenchimento, que aceita nulls e corta a linha visualmente.
      // 2. O trace do preenchimento, que injeta 0 nas bordas dos dados nulos para forçar a descida do preenchimento ao eixo X.
      const fillX = []
      const fillY = []
      let inBlock = false
      const values = data.series[name]
      const times = data.timestamps

      for (let i = 0; i < values.length; i++) {
        const val = values[i]
        const isValid = val !== null && val !== undefined && !Number.isNaN(val)

        if (isValid) {
          if (!inBlock) {
            fillX.push(times[i])
            fillY.push(0)
            inBlock = true
          }
          fillX.push(times[i])
          fillY.push(val)
        } else {
          if (inBlock) {
            fillX.push(times[i - 1])
            fillY.push(0)
            inBlock = false
          }
        }
      }

      if (inBlock && values.length > 0) {
        fillX.push(times[values.length - 1])
        fillY.push(0)
      }

      const lineTrace = { ...baseTrace, mode: 'lines', fill: 'none', x: data.timestamps, y: data.series[name] }
      const fillTrace = { 
        ...baseTrace, 
        mode: 'none', 
        fill: 'tozeroy', 
        x: fillX, 
        y: fillY, 
        showlegend: false, 
        hoverinfo: 'skip', 
        name: `${formatSeriesName(name)} (fill)` 
      }

      // Adicionamos primeiro o fill (para ficar por baixo) e depois a linha
      return [fillTrace, lineTrace]
    })

    // ── Faixas de Filtro (Topo) ───────────────────────────────────────
    const filterTraces = visibleFilters.map((name, i) => {
      const yAxisRef = `y${i + 5}`
      const fillColor = filterColors?.[name] || getColor(name) || '#ef4444'
      
      // 0 onde flag=0 cria uma onda quadrada: fill só aparece onde y=1, não onde y=0.
      // Usar null causaria preenchimento contínuo pelo Plotly (preenche entre segmentos).
      const rawVals = data?.filterData?.[name] || data?.series?.[name] || []
      const yVals = rawVals.map(v => (v === 1 || v === 1.0 || v === "1" || v === true) ? 1 : 0)
      
      return {
        x: data.timestamps,
        y: yVals,
        type: 'scatter',
        mode: 'lines',
        fill: 'tozeroy',
        fillcolor: fillColor.startsWith('#') 
          ? `rgba(${parseInt(fillColor.slice(1,3),16)},${parseInt(fillColor.slice(3,5),16)},${parseInt(fillColor.slice(5,7),16)},0.35)` 
          : fillColor,
        name: `Filtro: ${formatSeriesName(name)}`,
        yaxis: yAxisRef,
        line: { color: 'transparent', width: 0, shape: 'hv' },
        hovertemplate: '<extra></extra>',
        connectgaps: false,
        showlegend: false,
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
  }, [data, seriesAxisMap, seriesColors, seriesWidths, seriesDashes, seriesFills, filterColors, visibleFilters])

  // ── Layout ────────────────────────────────────────────────────────
  const layout = useMemo(() => {
    // visibleFilters vem da prop — não de data (para evitar redraw desnecessario)

    // Margens e Domínios otimizados com base em pixels fixos
    const AXIS_SPACE_PX = 35 // Espaço fixo em pixels para cada eixo Y extra
    
    let extraAxesCount = 0
    if (hasY4) extraAxesCount = 3
    else if (hasY3) extraAxesCount = 2
    else if (y2Names.length > 0) extraAxesCount = 1

    const innerWidth = Math.max(100, plotSize.width - 45 - 15) // plotWidth - leftMargin - rightMargin
    const axisFraction = (extraAxesCount * AXIS_SPACE_PX) / innerWidth
    const xDomainEnd = Math.max(0.5, 1.0 - axisFraction)
    
    xDomainEndRef.current = xDomainEnd
    const xDomain = [0, xDomainEnd]

    const axisStep = AXIS_SPACE_PX / innerWidth
    const y2Pos = xDomainEnd
    const y3Pos = xDomainEnd + axisStep
    const y4Pos = xDomainEnd + axisStep * 2
    
    // Margem direita mínima — legenda é painel HTML externo ao canvas do Plotly
    const rightMargin = 15

    // Calcula altura das faixas de filtro para esmagar os eixos Y normais (REDUZIDO PELA METADE)
    const filterHeight = Math.max(0.02, Math.min(0.04, 0.15 / (visibleFilters.length || 1)))
    const totalFiltersHeight = visibleFilters.length * filterHeight
    const mainYTop = visibleFilters.length > 0 ? (1 - totalFiltersHeight - 0.02) : 1
    const yDomain = [0, mainYTop]

    // Anotações para os títulos dos eixos no topo e DATAS no eixo X
    let rangebreaks = []
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
          y: -0.05, // Logo abaixo dos ticks de hora
          text: `<b>${d.split('-').reverse().join('/')}</b>`,
          showarrow: false,
          font: { size: 12, color: '#334155' },
          xanchor: 'center',
          yanchor: 'top'
        })
      })

      // Calcular dias vazios para omiti-los no gráfico
      if (uniqueDays.length > 1) {
        const minDay = new Date(uniqueDays[0] + 'T00:00:00')
        const maxDay = new Date(uniqueDays[uniqueDays.length - 1] + 'T00:00:00')
        const missingDays = []
        
        let currentDay = new Date(minDay)
        currentDay.setDate(currentDay.getDate() + 1)
        
        while (currentDay < maxDay) {
          const dStr = currentDay.toISOString().substring(0, 10)
          if (!uniqueDays.includes(dStr)) {
            missingDays.push(dStr)
          }
          currentDay.setDate(currentDay.getDate() + 1)
        }
        
        if (missingDays.length > 0) {
          // values precisa ser um array de strings de datas (ex: '2025-11-26')
          rangebreaks = [{ values: missingDays }]
        }
      }
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

    if (hasY4 || gridY4) {
      annotations.push({
        text: '<b>Y4</b>',
        xref: 'paper', yref: 'paper',
        x: y4Pos, xanchor: 'center',
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
      width: plotSize.width,
      height: plotSize.height,
      paper_bgcolor: '#f8fafc',
      plot_bgcolor:  '#ffffff',
      font:   { family: 'Inter, sans-serif', color: '#475569', size: 12 },
      margin: { t: 45, r: rightMargin, b: 50, l: 45 },
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
        rangebreaks: rangebreaks.length > 0 ? rangebreaks : undefined,
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
      yaxis4: {
        visible:    hasY4 || gridY4,
        gridcolor:  gridY4 ? '#e2e8f0' : 'transparent',
        linecolor:  '#cbd5e1',
        tickfont:   { size: 11 },
        zeroline:   gridY4,
        zerolinecolor: '#cbd5e1',
        overlaying: 'y',
        side:       'right',
        anchor:     'free',
        position:   y4Pos,
        range:      appliedRanges.y4,
        rangemode:  'tozero',
        title:      { text: '', font: { size: 11 } },
      },
      showlegend: false,
      modebar: { bgcolor: 'transparent', color: '#94a3b8', activecolor: '#f59e0b' },
    }

    // Injeta os mini-eixos Y para cada Filtro visível
    visibleFilters.forEach((name, i) => {
      const bottom = mainYTop + 0.01 + (i * filterHeight)
      const top = Math.min(0.995, bottom + filterHeight * 0.85)
      baseLayout[`yaxis${i + 5}`] = {
        domain: [bottom, top],
        anchor: 'x',
        showgrid: false,
        zeroline: false,
        showticklabels: false,
        showline: false,
        ticks: '',
        range: [0, 1.05],
        fixedrange: true,
      }
    })

    return baseLayout
  }, [plotSize, gridX, gridY1, gridY2, gridY3, gridY4, xGridSpacing, appliedRanges, visibleNames.length, baseDate, hasY3, hasY4, data, filterColors, y2Names.length, y3Names.length, y4Names.length, visibleFilters])

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
    const y4Range = getRange('yaxis4')
    if (y4Range === 'auto') setY4Limits({ min: '', max: '' })
    else if (y4Range) setY4Limits({ min: Math.round(+y4Range[0]), max: Math.round(+y4Range[1]) })
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
            <div style={{ flex: 1.3 }}>
              <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>ESPESSURA</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '4px 6px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                {LINE_WIDTHS.map((w) => (
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
            <div style={{ flex: 0.7 }}>
              <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>TIPO</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '4px 6px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
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
    const isHidden     = isHiddenSeries(seriesAxisMap[name])
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
            {formatSeriesName(name)}
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

  // ── Exportar PNG com legenda (composição Canvas) ──────────────────
  const handleExportWithLegend = async () => {
    const gd = plotDivRef.current
      || containerRef.current?.querySelector('.js-plotly-plot')
    if (!gd) { alert('Gráfico ainda não inicializado. Aguarde e tente novamente.'); return }
    try {
      const scale = 2

      // 1. Captura o gráfico com a largura total do container (chart + painel legenda HTML).
      //    Sem isso, o toImage usa a largura comprimida do chart div, espremendo os eixos Y.
      const exportW = containerRef.current?.offsetWidth || gd.offsetWidth
      const exportH = gd.offsetHeight
      const chartDataUrl = await Plotly.toImage(gd, { format: 'png', scale, width: exportW, height: exportH })


      // 2. Carrega a imagem do gráfico num HTMLImageElement
      const chartImg = await new Promise((res, rej) => {
        const img = new Image()
        img.onload = () => res(img)
        img.onerror = rej
        img.src = chartDataUrl
      })

      // 3. Dimensões do painel de legenda (em pixels físicos = lógicos × scale)
      const PAD        = 14 * scale
      const ROW_H      = 20 * scale
      const LINE_W     = 22 * scale
      const FONT_SIZE  = 11 * scale
      const HEADER_H   = 28 * scale
      const MAX_TEXT_W = 220 * scale

      // Mede o nome mais largo para ajustar a largura do painel
      const tmpCanvas = document.createElement('canvas')
      const tmpCtx = tmpCanvas.getContext('2d')
      tmpCtx.font = `${FONT_SIZE}px Inter, sans-serif`
      let maxTextWidth = 0
      seriesNames.forEach(n => {
        const w = tmpCtx.measureText(n).width
        if (w > maxTextWidth) maxTextWidth = w
      })
      const textAreaW = Math.min(maxTextWidth, MAX_TEXT_W)

      const isHorizontal = legendPosition === 'bottom' || legendPosition === 'top'

      let canvasW, canvasH, itemW, cols, rows
      let legendW = 0, legendH = 0
      
      if (isHorizontal) {
        itemW = PAD + LINE_W + PAD + textAreaW + PAD
        cols = Math.max(1, Math.floor((chartImg.width - PAD * 2) / itemW))
        rows = Math.ceil(seriesNames.length / cols)
        
        legendH = PAD + rows * ROW_H + PAD
        canvasW = chartImg.width
        canvasH = chartImg.height + legendH
      } else {
        legendW = PAD + LINE_W + PAD + textAreaW + PAD
        legendH = Math.max(chartImg.height, HEADER_H + seriesNames.length * ROW_H + PAD)
        canvasW = chartImg.width + legendW
        canvasH = Math.max(chartImg.height, legendH)
      }

      // 4. Canvas final: gráfico + legenda
      const canvas = document.createElement('canvas')
      canvas.width  = canvasW
      canvas.height = canvasH
      const ctx = canvas.getContext('2d')

      // Fundo branco
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Calcula posições de desenho
      let chartX = 0, chartY = 0
      let legendX = 0, legendY = 0

      if (legendPosition === 'right') {
         legendX = chartImg.width
      } else if (legendPosition === 'left') {
         chartX = legendW
      } else if (legendPosition === 'bottom') {
         legendY = chartImg.height
      } else if (legendPosition === 'top') {
         chartY = legendH
      }

      // Gráfico
      ctx.drawImage(chartImg, chartX, chartY)

      // Desenha fundo da legenda
      ctx.fillStyle = '#ffffff'
      if (isHorizontal) {
        ctx.fillRect(0, legendY, canvas.width, legendH)
        ctx.strokeStyle = '#e2e8f0'
        ctx.lineWidth = 1 * scale
        ctx.beginPath()
        if (legendPosition === 'bottom') {
          ctx.moveTo(0, legendY); ctx.lineTo(canvas.width, legendY)
        } else {
          ctx.moveTo(0, legendH); ctx.lineTo(canvas.width, legendH)
        }
        ctx.stroke()
      } else {
        ctx.fillRect(legendX, 0, legendW, canvas.height)
        ctx.strokeStyle = '#e2e8f0'
        ctx.lineWidth = 1 * scale
        ctx.beginPath()
        if (legendPosition === 'right') {
           ctx.moveTo(legendX, 0); ctx.lineTo(legendX, canvas.height)
        } else {
           ctx.moveTo(legendW, 0); ctx.lineTo(legendW, canvas.height)
        }
        ctx.stroke()

        // Cabeçalho "LEGENDA"
        ctx.fillStyle = '#94a3b8'
        ctx.font = `700 ${9 * scale}px Inter, sans-serif`
        ctx.fillText('LEGENDA', legendX + PAD, HEADER_H * 0.65)
        ctx.strokeStyle = '#f1f5f9'
        ctx.beginPath(); ctx.moveTo(legendX, HEADER_H); ctx.lineTo(legendX + legendW, HEADER_H); ctx.stroke()
      }

      // Itens da legenda
      seriesNames.forEach((name, i) => {
        const isHidden = isHiddenSeries(seriesAxisMap[name])
        const color    = isHidden ? '#94a3b8' : getColor(name)
        const dash     = getDash(name)
        const lw       = Math.min(getWidth(name), 2.5) * scale
        
        let x, y
        if (isHorizontal) {
          const col = i % cols
          const row = Math.floor(i / cols)
          x = PAD + col * itemW
          y = legendY + PAD + row * ROW_H + ROW_H / 2
        } else {
          x = legendX + PAD
          y = legendY + HEADER_H + i * ROW_H + ROW_H / 2
        }

        // Linha
        ctx.strokeStyle = color
        ctx.lineWidth   = lw
        ctx.setLineDash(dash === 'dash' ? [4 * scale, 3 * scale] : dash === 'dot' ? [2 * scale, 2 * scale] : [])
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + LINE_W, y); ctx.stroke()
        ctx.setLineDash([])

        // Texto
        ctx.fillStyle = isHidden ? '#94a3b8' : '#334155'
        ctx.font = `${FONT_SIZE}px Inter, sans-serif`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        
        const formatted = formatSeriesName(name)
        let label = formatted
        while (label.length > 3 && ctx.measureText(label).width > MAX_TEXT_W) {
          label = label.slice(0, -1)
        }
        if (label !== formatted) label += '…'
        ctx.fillText(label, x + LINE_W + PAD, y)
      })

      // 5. Download
      const filename = ['causa-raiz', usina || 'usina', data?.date || 'data', `${visibleNames.length}series`].join('_') + '.png'
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err) {
      console.error('Export with legend failed:', err)
      alert('Falha ao exportar: ' + err.message)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>

      {/* ── Controles ─────────────────────────────────────────── */}
      {showEixosMenu && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          
          {/* Bloco Eixos */}
          <div style={{
            flex: 1,
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


            <label className="checkbox-row" style={{ padding: 0, gap: 4 }}>
              <input type="checkbox" checked={gridX} onChange={e => { setGridX(e.target.checked); bumpRevision() }} />
              <span style={{ fontSize: '11px', fontWeight: 600 }}>Grade</span>
            </label>
          </AxisGroup>

          <AxisGroup title="Y1">
            <YLimitsControl limits={y1Limits} setLimits={setY1Limits} applyFn={makeApplyY('y1', y1Limits)} />
            <label className="checkbox-row" style={{ padding: 0, gap: 4 }}>
              <input type="checkbox" checked={gridY1} onChange={e => { setGridY1(e.target.checked); bumpRevision() }} />
              <span style={{ fontSize: '11px', fontWeight: 600 }}>Grade</span>
            </label>
          </AxisGroup>

          <AxisGroup title="Y2">
            <YLimitsControl limits={y2Limits} setLimits={setY2Limits} applyFn={makeApplyY('y2', y2Limits)} />
            <label className="checkbox-row" style={{ padding: 0, gap: 4 }}>
              <input type="checkbox" checked={gridY2} onChange={e => { setGridY2(e.target.checked); bumpRevision() }} />
              <span style={{ fontSize: '11px', fontWeight: 600 }}>Grade</span>
            </label>
          </AxisGroup>

          <AxisGroup title="Y3">
            <YLimitsControl limits={y3Limits} setLimits={setY3Limits} applyFn={makeApplyY('y3', y3Limits)} />
            <label className="checkbox-row" style={{ padding: 0, gap: 4 }}>
              <input type="checkbox" checked={gridY3} onChange={e => { setGridY3(e.target.checked); bumpRevision() }} />
              <span style={{ fontSize: '11px', fontWeight: 600 }}>Grade</span>
            </label>
          </AxisGroup>

          <AxisGroup title="Y4">
            <YLimitsControl limits={y4Limits ?? { min: '', max: '' }} setLimits={setY4Limits} applyFn={makeApplyY('y4', y4Limits ?? { min: '', max: '' })} />
            <label className="checkbox-row" style={{ padding: 0, gap: 4 }}>
              <input type="checkbox" checked={gridY4 ?? false} onChange={e => { setGridY4(e.target.checked); bumpRevision() }} />
              <span style={{ fontSize: '11px', fontWeight: 600 }}>Grade</span>
            </label>
          </AxisGroup>

          </div>



        </div>
      )}

      {/* ── Eixos (drag & drop) ──────────────────────────────── */}
      {showSeriesMenu && (
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
                const isHidden = isHiddenSeries(seriesAxisMap[name])
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
                    {formatSeriesName(name)}
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
              <DropZone axis="y4" label="Eixo Y4" names={y4Names} />
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
      )}

      {/* ── Gráfico + Legenda HTML ────────────────────────── */}
      <div ref={containerRef} style={{ 
        flex: 1, minHeight: 380, display: 'flex', 
        flexDirection: (legendPosition === 'bottom' || legendPosition === 'top') ? 'column' : 'row', 
        minWidth: 0 
      }}>

        {/* Área do Plot – cresce para preencher o espaço restante */}
        <div 
          ref={plotWrapperRef} 
          onMouseMove={e => { mousePosRef.current = { x: e.clientX, y: e.clientY } }}
          onMouseLeave={handlePlotUnhover}
          style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', position: 'relative', order: 1 }}
        >
          {/* ── Controle de Janela de Dias ── */}
          {uniqueDays.length > 1 && (() => {
            const DAY_OPTIONS = [1, 2, 3, 5, 7, 10, 30, null] // null = Max
            const canPrev = windowDays !== null && windowStartIdx > 0
            const canNext = windowDays !== null && windowStartIdx + windowDays < uniqueDays.length

            const btnStyle = (enabled) => ({
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 5,
              color: enabled ? '#1e293b' : '#cbd5e1',
              cursor: enabled ? 'pointer' : 'default',
              fontFamily: 'Inter, sans-serif',
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1,
              padding: '4px 8px',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
              transition: 'background 0.15s, color 0.15s',
            })

            return (
              <div style={{
                position: 'absolute',
                top: 6,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 500,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                pointerEvents: 'all',
                background: '#ffffff',
                padding: '3px',
                borderRadius: '8px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                border: '1px solid #e2e8f0'
              }}>
                {DAY_OPTIONS.map(d => {
                  if (d !== null && d > uniqueDays.length) return null
                  const isActive = windowDays === d
                  const label = d === null ? 'Max' : `${d}D`
                  return (
                    <button
                      key={d === null ? 'max' : d}
                      onClick={() => {
                        setWindowDays(d)
                        setWindowStartIdx(0)
                        applyDayWindow(0, d)
                      }}
                      style={{
                        background: isActive ? '#f1f5f9' : 'transparent',
                        color: isActive ? '#0f172a' : '#64748b',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 12,
                        fontWeight: isActive ? 700 : 600,
                        padding: '4px 8px',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => !isActive && (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => !isActive && (e.currentTarget.style.background = 'transparent')}
                    >
                      {label}
                    </button>
                  )
                })}

                <div style={{ width: '1px', height: '14px', background: '#cbd5e1', margin: '0 4px' }} />

                {/* Seta esquerda */}
                <button
                  style={{ ...btnStyle(canPrev), border: 'none', background: 'transparent', boxShadow: 'none', padding: '4px 6px' }}
                  title="Dia anterior"
                  onClick={() => {
                    if (!canPrev) return
                    const next = windowStartIdx - 1
                    setWindowStartIdx(next)
                    applyDayWindow(next, windowDays)
                  }}
                  onMouseEnter={e => canPrev && (e.currentTarget.style.background = '#f1f5f9')}
                  onMouseLeave={e => canPrev && (e.currentTarget.style.background = 'transparent')}
                >‹</button>

                {/* Seta direita */}
                <button
                  style={{ ...btnStyle(canNext), border: 'none', background: 'transparent', boxShadow: 'none', padding: '4px 6px' }}
                  title="Próximo dia"
                  onClick={() => {
                    if (!canNext) return
                    const next = windowStartIdx + 1
                    setWindowStartIdx(next)
                    applyDayWindow(next, windowDays)
                  }}
                  onMouseEnter={e => canNext && (e.currentTarget.style.background = '#f1f5f9')}
                  onMouseLeave={e => canNext && (e.currentTarget.style.background = 'transparent')}
                >›</button>
              </div>
            )
          })()}

          <Plot
            key={plotMountKey}
            data={traces}
            layout={layout}
            revision={plotRevision}
            onInitialized={(_, gd) => { plotDivRef.current = gd }}
            onUpdate={(_, gd)       => { plotDivRef.current = gd }}
            onRelayout={handleRelayout}
            onHover={handlePlotHover}
            onUnhover={handlePlotUnhover}
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
                  usina || 'usina',
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

        {/* Painel de Legenda */}
        {legendPosition !== 'none' && (
          <div style={{
            order: (legendPosition === 'left' || legendPosition === 'top') ? 0 : 2,
            width: (legendPosition === 'bottom' || legendPosition === 'top') ? '100%' : 280,
            flexShrink: 0,
            overflowY: 'auto',
            overflowX: (legendPosition === 'bottom' || legendPosition === 'top') ? 'auto' : 'hidden',
            borderLeft: legendPosition === 'right' ? '1px solid #e2e8f0' : 'none',
            borderRight: legendPosition === 'left' ? '1px solid #e2e8f0' : 'none',
            borderTop: legendPosition === 'bottom' ? '1px solid #e2e8f0' : 'none',
            borderBottom: legendPosition === 'top' ? '1px solid #e2e8f0' : 'none',
            padding: (legendPosition === 'bottom' || legendPosition === 'top') ? '10px 16px' : '8px 6px 10px 8px',
            display: 'flex',
            flexDirection: (legendPosition === 'bottom' || legendPosition === 'top') ? 'row' : 'column',
            flexWrap: (legendPosition === 'bottom' || legendPosition === 'top') ? 'wrap' : 'nowrap',
            gap: (legendPosition === 'bottom' || legendPosition === 'top') ? 12 : 1,
            background: '#fff',
            maxHeight: (legendPosition === 'bottom' || legendPosition === 'top') ? 160 : 'none',
            alignItems: (legendPosition === 'bottom' || legendPosition === 'top') ? 'center' : 'stretch',
          }}>
            {/* Cabeçalho com botão de exportação */}
            <div style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
              marginBottom: (legendPosition === 'bottom' || legendPosition === 'top') ? 0 : 6, 
              paddingBottom: (legendPosition === 'bottom' || legendPosition === 'top') ? 0 : 5, 
              borderBottom: (legendPosition === 'bottom' || legendPosition === 'top') ? 'none' : '1px solid #f1f5f9',
              marginRight: (legendPosition === 'bottom' || legendPosition === 'top') ? 12 : 0,
              borderRight: (legendPosition === 'bottom' || legendPosition === 'top') ? '1px solid #e2e8f0' : 'none',
              paddingRight: (legendPosition === 'bottom' || legendPosition === 'top') ? 16 : 0,
            }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginRight: (legendPosition === 'bottom' || legendPosition === 'top') ? 12 : 0 }}>
                Legenda
              </span>
              <button
                onClick={handleExportWithLegend}
                title="Exportar PNG com legenda"
                style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 4, cursor: 'pointer', padding: '2px 5px', display: 'flex', alignItems: 'center', gap: 3, color: '#64748b', fontSize: 11 }}
                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                PNG
              </button>
            </div>
            {seriesNames.map(name => {
              const isHidden = isHiddenSeries(seriesAxisMap[name])
              const color    = getColor(name)
              const dash     = getDash(name)
              const w        = Math.min(getWidth(name), 2.5)
              const dashArr  = dash === 'dash' ? '4,3' : dash === 'dot' ? '2,2' : 'none'
              return (
                <div
                  key={name}
                  onClick={() => hideShow(name)}
                  title={name}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '3px 4px', borderRadius: 4, cursor: 'pointer',
                    opacity: isHidden ? 0.38 : 1,
                    transition: 'opacity 0.15s, background 0.12s',
                    width: (legendPosition === 'bottom' || legendPosition === 'top') ? 'max-content' : 'auto',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <svg width="22" height="10" style={{ flexShrink: 0 }}>
                    <line x1="1" y1="5" x2="21" y2="5"
                      stroke={isHidden ? '#94a3b8' : color}
                      strokeWidth={w}
                      strokeDasharray={dashArr}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span style={{
                    fontSize: 10.5, lineHeight: 1.3,
                    color: isHidden ? '#94a3b8' : '#334155',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flex: (legendPosition === 'bottom' || legendPosition === 'top') ? '0 1 auto' : 1, minWidth: 0,
                    maxWidth: (legendPosition === 'bottom' || legendPosition === 'top') ? 220 : 'none',
                  }}>
                    {formatSeriesName(name)}
                  </span>
                </div>
              )
            })}
          </div>
        )}

      </div>
      
      {/* Esconde as setas/balões nativos do Plotly mas mantém os círculos dos traces de marcadores */}
      <style>{`
        .js-plotly-plot .hoverlayer .hovertext { display: none !important; }
        .js-plotly-plot .hoverlayer .axistext { display: none !important; }
      `}</style>

      
      {hoverState && hoverState.points && hoverState.points.length > 0 && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            left: `${hoverState.fixedLeft}px`,
            top: `${hoverState.fixedTop}px`,
            transform: 'translate(0, -50%)',
            backgroundColor: 'rgba(8, 44, 55, 0.92)',
            backdropFilter: 'blur(4px)',
            border: '1.5px solid #00bcd4',
            borderRadius: '6px',
            padding: '10px 14px',
            color: '#ffffff',
            fontSize: '12px',
            fontFamily: 'Inter, sans-serif',
            boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
            pointerEvents: 'none',
            zIndex: 99999,
            minWidth: '220px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ 
            fontWeight: '700', 
            fontSize: '13px', 
            borderBottom: '1px solid rgba(255,255,255,0.15)', 
            paddingBottom: '6px',
            marginBottom: '4px',
            color: '#e2e8f0'
          }}>
            {hoverState.timeStr}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {hoverState.points.map((pt, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                  <span style={{ 
                    width: '8px', 
                    height: '8px', 
                    borderRadius: '50%', 
                    backgroundColor: pt.color, 
                    display: 'inline-block',
                    flexShrink: 0
                  }} />
                  <span style={{ color: '#cbd5e1' }} title={pt.name}>
                    {formatSeriesName(pt.name)}:
                  </span>
                </div>
                <span style={{ fontWeight: '700', color: '#ffffff', whiteSpace: 'nowrap' }}>
                  {pt.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
)
