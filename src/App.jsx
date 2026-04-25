import React, { useEffect, useState, lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import AuthPage from './pages/AuthPage'
import Dashboard from './pages/Dashboard'
import ProjectView from './pages/ProjectView'
import ResultsView from './pages/ResultsView'
import Documentation from './pages/Documentation'
import ErrorBoundary from './components/ErrorBoundary'
import React, { useEffect, useState, lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import AuthPage from './pages/AuthPage'
import Dashboard from './pages/Dashboard'
import ProjectView from './pages/ProjectView'
import ResultsView from './pages/ResultsView'
import Documentation from './pages/Documentation'
import ErrorBoundary from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { supabase } from './lib/supabase'
import '../style.css'

const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))

const RequireAuth = ({ children, session, loading }) => {
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050010' }}>
        <h2 style={{ color: '#FF6F37', fontFamily: 'monospace' }}>LOADING...</h2>
      </div>
    )
  }
  if (!session) return <Navigate to="/auth" replace />
  return children
}

const RequireAdmin = ({ children, session, loading }) => {
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050010' }}>
        <h2 style={{ color: '#FF6F37', fontFamily: 'monospace' }}>LOADING...</h2>
      </div>
    )
  }
  if (!session) return <Navigate to="/auth" replace />
  return children
}

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setLoading(false)
    })

    return () => subscription?.unsubscribe()
  }, [])

  return (
    <ErrorBoundary>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Home session={session} />} />
          <Route path="/auth" element={<AuthPage session={session} />} />
          <Route path="/docs" element={<Documentation />} />
          <Route path="/dashboard" element={
            <RequireAuth session={session} loading={loading}>
              <Dashboard session={session} />
            </RequireAuth>
          } />
          <Route path="/dashboard/project/:projectId" element={
            <RequireAuth session={session} loading={loading}>
              <ProjectView session={session} />
            </RequireAuth>
          } />
          <Route path="/dashboard/analysis/:uploadId" element={
            <RequireAuth session={session} loading={loading}>
              <ResultsView session={session} />
            </RequireAuth>
          } />
          <Route path="/admin" element={
            <RequireAdmin session={session} loading={loading}>
              <Suspense fallback={null}>
                <AdminDashboard session={session} />
              </Suspense>
            </RequireAdmin>
          } />
        </Routes>
      </ToastProvider>
    </ErrorBoundary>
  )
}
