import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { fetchElementSettings, saveElementSettings, fetchFilterSettings, saveFilterSettings } from '../services/api'
import { useAuth } from './AuthContext'

const ChartSettingsContext = createContext(null)

export function ChartSettingsProvider({ children }) {
  const { user } = useAuth()
  const [elementSettings, setElementSettings] = useState([])
  const [filterSettings, setFilterSettings] = useState([])
  const [loading, setLoading] = useState(true)

  // Use ref to avoid saving on the very first mount fetch
  const isFirstLoadElements = useRef(true)
  const isFirstLoadFilters = useRef(true)

  useEffect(() => {
    let isMounted = true
    Promise.all([
      fetchElementSettings(),
      fetchFilterSettings()
    ])
      .then(([elementsData, filtersData]) => {
        if (isMounted) {
          setElementSettings(elementsData)
          setFilterSettings(filtersData)
          setLoading(false)
        }
      })
      .catch((e) => {
        console.error("Erro ao carregar configurações (elementos/filtros)", e)
        if (isMounted) setLoading(false)
      })
    return () => { isMounted = false }
  }, [user])

  // Auto-save elements
  useEffect(() => {
    if (isFirstLoadElements.current) {
      if (!loading) isFirstLoadElements.current = false
      return
    }
    if (user?.role === 'admin') {
      const timeout = setTimeout(() => {
        saveElementSettings(elementSettings).catch(console.error)
      }, 500)
      return () => clearTimeout(timeout)
    }
  }, [elementSettings, user, loading])

  // Auto-save filters
  useEffect(() => {
    if (isFirstLoadFilters.current) {
      if (!loading) isFirstLoadFilters.current = false
      return
    }
    if (user?.role === 'admin') {
      const timeout = setTimeout(() => {
        saveFilterSettings(filterSettings).catch(console.error)
      }, 500)
      return () => clearTimeout(timeout)
    }
  }, [filterSettings, user, loading])

  const updateElementSetting = (index, field, value) => {
    setElementSettings(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s))
  }

  const addCustomElement = (elementName) => {
    setElementSettings(prev => [
      ...prev,
      { element: elementName, axis: 'y3', colors: ['#000000'], width: 1.5, dash: 'solid' }
    ])
  }

  const removeCustomElement = (elementName) => {
    setElementSettings(prev => prev.filter(s => s.element !== elementName))
    setFilterSettings(prev => prev.filter(s => s.element !== elementName)) // Remove filtro também
  }

  const getSettingForElement = (elementName) => {
    return elementSettings.find(s =>
      elementName && s.element.toLowerCase() === elementName.toLowerCase()
    ) || null
  }

  // Métodos para filtros
  const addFilterRule = (name, elementName) => {
    setFilterSettings(prev => {
      if (prev.some(s => s.name === name)) return prev
      return [...prev, { name, element: elementName, min_value: null, max_value: null, max_variation: null }]
    })
  }

  const updateFilterSetting = (name, field, value) => {
    setFilterSettings(prev => prev.map(s => 
      s.name === name ? { ...s, [field]: value } : s
    ))
  }

  const removeFilterRule = (name) => {
    setFilterSettings(prev => prev.filter(s => s.name !== name))
  }

  return (
    <ChartSettingsContext.Provider value={{
      elementSettings,
      filterSettings,
      loading,
      updateElementSetting,
      getSettingForElement,
      addCustomElement,
      removeCustomElement,
      addFilterRule,
      updateFilterSetting,
      removeFilterRule,
    }}>
      {children}
    </ChartSettingsContext.Provider>
  )
}

export function useChartSettings() {
  return useContext(ChartSettingsContext)
}
