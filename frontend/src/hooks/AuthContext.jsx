import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

const TOKEN_KEY = 'cr_auth_token'
const USER_KEY  = 'cr_auth_user'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user,  setUser]  = useState(() => {
    try {
      const raw = localStorage.getItem(USER_KEY)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })

  const login = useCallback((tokenStr, userData) => {
    localStorage.setItem(TOKEN_KEY, tokenStr)
    localStorage.setItem(USER_KEY, JSON.stringify(userData))
    setToken(tokenStr)
    setUser(userData)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
  }, [])

  const isAdmin           = user?.role === 'admin'
  const isAnalyst         = user?.role === 'analyst'
  const isAnalystOrAdmin  = isAdmin || isAnalyst
  const isAuthenticated   = !!token && !!user

  return (
    <AuthContext.Provider value={{ token, user, isAuthenticated, isAdmin, isAnalyst, isAnalystOrAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}

