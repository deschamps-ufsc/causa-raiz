import { useState, useEffect } from 'react'
import { fetchSeries, fetchDates, fetchMappingData } from '../services/api'

/**
 * Hook para buscar e gerenciar a lista de séries disponíveis.
 * Inclui séries sintéticas do Mapeamento de Séries que não existem no Parquet.
 */
export function useSeries(selectedDates, usina) {
  const [series, setSeries] = useState([])      // Todas as séries do dia + sintéticas
  const [dates, setDates] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Carregar datas disponíveis sempre que a usina mudar
  useEffect(() => {
    if (!usina) { setDates([]); return }
    fetchDates(usina)
      .then(setDates)
      .catch((e) => console.error('Erro ao buscar datas:', e))
  }, [usina])

  // Carregar séries quando a data ou usina muda
  useEffect(() => {
    if (!selectedDates || selectedDates.length === 0 || !usina) return
    setLoading(true)
    setError(null)
    Promise.all([
      fetchSeries(usina, Array.isArray(selectedDates) ? selectedDates.join(',') : selectedDates),
      fetchMappingData(usina).catch(() => ({})),
    ])
      .then(([parquetSeries, mapping]) => {
        const parquetKeys = new Set(parquetSeries.map(s => s.coluna))
        const parquetSeriesWithData = parquetSeries.map(s => ({ ...s, hasData: true }))
        const missingFromParquet = []
        Object.entries(mapping).forEach(([col, meta]) => {
          if (!parquetKeys.has(col) && meta.elemento) {
            missingFromParquet.push({
              coluna: col,
              elemento: meta.elemento,
              skid: meta.skid || '',
              inversor: meta.inversor || '',
              stringbox: meta.stringbox || '',
              estacao: meta.estacao || '',
              string: meta.string || '',
              mapeada: true,
              sintetica: meta.sintetica || false,
              hasData: false,
            })
          }
        })
        setSeries([...parquetSeriesWithData, ...missingFromParquet])
        setLoading(false)
      })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [selectedDates, usina])

  // Filtrar localmente (sem re-fetch)
  const filterSeries = ({ elemento, skid, inversor, search }) => {
    return series.filter((s) => {
      if (elemento && s.elemento !== elemento) return false
      if (skid && s.skid !== skid) return false
      if (inversor && s.inversor !== inversor) return false
      if (search && !s.coluna.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }

  // Valores únicos para os filtros em cascata
  const getUniqueElements = () => [...new Set(series.map((s) => s.elemento).filter(Boolean))].sort()
  const getUniqueSkids = (elemento) => [
    ...new Set(series.filter((s) => !elemento || s.elemento === elemento).map((s) => s.skid).filter(Boolean)),
  ].sort()
  const getUniqueInversors = (skid) => [
    ...new Set(series.filter((s) => !skid || s.skid === skid).map((s) => s.inversor).filter(Boolean)),
  ].sort()

  const mapeadas = series.filter((s) => s.mapeada).length
  const semMapeamento = series.length - mapeadas

  return {
    series, dates, loading, error,
    filterSeries,
    getUniqueElements,
    getUniqueSkids,
    getUniqueInversors,
    stats: { total: series.length, mapeadas, semMapeamento },
  }
}
