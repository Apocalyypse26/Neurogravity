import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import AuthPage from './pages/AuthPage'
import Dashboard from './pages/Dashboard'
import ProjectView from './pages/ProjectView'
import ResultsView from './pages/ResultsView'
import AdminDashboard from './pages/AdminDashboard'
import Documentation from './pages/Documentation'
import ErrorBoundary from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import '../style.css'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [supabase, setSupabase] = useState(null)
  
  useEffect(() => {
    import('./lib/supabase')
      .then(module => {
        setSupabase(module.supabase)
      })
      .catch(e => {
        console.warn('Supabase not available:', e.message)
        setLoading(false)
      })
  }, [])
  
  useEffect(() => {
    if (!supabase) return
    
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
  }, [supabase])
  
  const RequireAuth = ({ children }) => {
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

  const RequireAdmin = ({ children }) => {
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

  return (
    <ErrorBoundary>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Home session={session} />} />
          <Route path="/auth" element={<AuthPage session={session} />} />
          <Route path="/docs" element={<Documentation />} />
          <Route path="/dashboard" element={
            <RequireAuth>
              <Dashboard session={session} />
            </RequireAuth>
          } />
          <Route path="/dashboard/project/:projectId" element={
            <RequireAuth>
              <ProjectView session={session} />
            </RequireAuth>
          } />
          <Route path="/dashboard/analysis/:uploadId" element={
            <RequireAuth>
              <ResultsView session={session} />
            </RequireAuth>
          } />
          <Route path="/admin" element={
            <RequireAdmin>
              <AdminDashboard session={session} />
            </RequireAdmin>
          } />
        </Routes>
      </ToastProvider>
    </ErrorBoundary>
  )
}
