import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Home from './pages/Home'
import AuthPage from './pages/AuthPage'
import Dashboard from './pages/Dashboard'
import ProjectView from './pages/ProjectView'
import ResultsView from './pages/ResultsView'
import AdminDashboard from './pages/AdminDashboard'
import '../style.css'

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
    
    return () => subscription.unsubscribe()
  }, [])
  
  const RequireAuth = ({ children }) => {
    if (loading) {
      return (
        <div className="hud-layout" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ color: '#fff', fontFamily: 'monospace', animation: 'blink 1.5s infinite'}}>AUTHENTICATING TERMINAL...</h2>
        </div>
      )
    }
    if (!session) return <Navigate to="/auth" replace />
    return children
  }

  return (
    <Routes>
      <Route path="/" element={<Home session={session} />} />
      <Route path="/auth" element={<AuthPage session={session} />} />
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
        <RequireAuth>
          <AdminDashboard session={session} />
        </RequireAuth>
      } />
    </Routes>
  )
}
