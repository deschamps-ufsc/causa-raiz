import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { fetchElementSettings, saveElementSettings } from '../services/api'
import { useAuth } from './AuthContext'

const ChartSettingsContext = createContext(null)

export function ChartSettingsProvider({ children }) {
  const { user } = useAuth()
  const [elementSettings, setElementSettings] = useState([])
  const [loading, setLoading] = useState(true)

  // Use ref to avoid saving on the very first mount fetch
  const isFirstLoad = useRef(true)

  useEffect(() => {
    let isMounted = true
    fetchElementSettings()
      .then((data) => {
        if (isMounted) {
          setElementSettings(data)
          setLoading(false)
        }
      })
      .catch((e) => {
        console.error("Erro ao carregar configurações de elementos", e)
        if (isMounted) setLoading(false)
      })
    return () => { isMounted = false }
  }, [user])

  useEffect(() => {
    if (isFirstLoad.current) {
      if (!loading) isFirstLoad.current = false
      return
    }
    // Auto-save changes to the backend (only for admin, backend also restricts this)
    if (user?.role === 'admin') {
      const timeout = setTimeout(() => {
        saveElementSettings(elementSettings).catch(console.error)
      }, 500)
      return () => clearTimeout(timeout)
    }
  }, [elementSettings, user, loading])

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
  }

  // Dado um nome de elemento, retorna a configuração completa
  const getSettingForElement = (elementName) => {
    return elementSettings.find(s =>
      elementName && s.element.toLowerCase() === elementName.toLowerCase()
    ) || null
  }

  return (
    <ChartSettingsContext.Provider value={{
      elementSettings,
      loading,
      updateElementSetting,
      getSettingForElement,
      addCustomElement,
      removeCustomElement,
    }}>
      {children}
    </ChartSettingsContext.Provider>
  )
}

export function useChartSettings() {
  return useContext(ChartSettingsContext)
}
