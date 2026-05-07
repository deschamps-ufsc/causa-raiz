import { useState, useCallback } from 'react'
import { fetchData } from '../services/api'

/**
 * Hook para buscar dados temporais do backend.
 * Gerencia estados de loading, error e os dados em si.
 */
export function useSeriesData() {
  const [data, setData] = useState(null)          // DataResponse do backend
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastQuery, setLastQuery] = useState(null)

  const query = useCallback(async ({ usina, dates, series, elemento, skid, start, end }) => {
    if (!dates || dates.length === 0 || (!series?.length && !elemento && !skid)) return

    setLoading(true)
    setError(null)
    setLastQuery({ usina, dates, series, elemento, skid, start, end })

    try {
      const datesStr = Array.isArray(dates) ? dates.join(',') : dates;
      const result = await fetchData({ usina, dates: datesStr, series, elemento, skid, start, end })
      setData(result)
    } catch (e) {
      setError(e.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = () => { setData(null); setError(null); setLastQuery(null) }

  return { data, loading, error, lastQuery, query, clear }
}
