import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import './index.css'

import App from './App.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import DiagramPage from './pages/DiagramPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import { UsinaProvider } from './hooks/UsinaContext.jsx'
import { ChartSettingsProvider } from './hooks/ChartSettingsContext.jsx'
import { AuthProvider, useAuth } from './hooks/AuthContext.jsx'

// ── Proteção de rota ──────────────────────────────────────────────────────────
function PrivateRoute({ children, adminOnly = false, analystOrAdminOnly = false }) {
  const { isAuthenticated, isAdmin, isAnalystOrAdmin } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />
  if (analystOrAdminOnly && !isAnalystOrAdmin) return <Navigate to="/dashboard" replace />
  return children
}

// ── Router ────────────────────────────────────────────────────────────────────
const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <PrivateRoute>
        <App />
      </PrivateRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'diagram',   element: <DiagramPage /> },
      {
        path: 'settings',
        element: (
          <PrivateRoute analystOrAdminOnly>
            <SettingsPage />
          </PrivateRoute>
        ),
      },
    ],
  },
])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <UsinaProvider>
        <ChartSettingsProvider>
          <RouterProvider router={router} />
        </ChartSettingsProvider>
      </UsinaProvider>
    </AuthProvider>
  </StrictMode>
)
