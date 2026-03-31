import React, { useState, useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Shield, Home, Target, ChevronRight, MessageSquare, ExternalLink } from 'lucide-react'

export default function AdminDashboard({ session }) {
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [globalUploads, setGlobalUploads] = useState([])
  const [feedbackInputs, setFeedbackInputs] = useState({})
  
  useEffect(() => {
    checkAdminStatus()
  }, [])

  const checkAdminStatus = async () => {
    const { data: adminData } = await supabase
      .from('admin_users')
      .select('id')
      .eq('id', session.user.id)
      .single()

    if (adminData) {
      setIsAdmin(true)
      await fetchGlobalUploads()
    }
    setLoading(false)
  }

  const fetchGlobalUploads = async () => {
    // Because of RLS, since we are admin, this pulls EVERYTHING.
    const { data } = await supabase
      .from('uploads')
      .select('*, projects(name)')
      .order('created_at', { ascending: false })
      
    if (data) setGlobalUploads(data)
  }

  const handleFeedbackChange = (id, val) => {
    setFeedbackInputs(prev => ({ ...prev, [id]: val }))
  }

  const submitFeedback = async (id) => {
    const feedback = feedbackInputs[id]
    if (!feedback) return

    const { error } = await supabase
      .from('uploads')
      .update({ admin_feedback: feedback })
      .eq('id', id)
      
    if (!error) {
       // Re-sync local state to show it saved
       setGlobalUploads(prev => prev.map(u => u.id === id ? { ...u, admin_feedback: feedback } : u))
    } else {
       console.error("Failed to commit feedback", error)
    }
  }

  if (loading) {
    return (
      <div className="hud-layout" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h2 style={{ color: '#fff', fontFamily: 'monospace', animation: 'blink 1.5s infinite'}}>VERIFYING CLEARANCE...</h2>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="hud-layout" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
        <Shield size={64} className="text-danger" />
        <h2 className="error-text" style={{ fontSize: '2rem' }}>SECURITY CLEARANCE REJECTED.</h2>
        <p style={{ color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>Your biometric signature is not mapped to the Admin Directory.</p>
        <Link to="/dashboard" className="btn btn-outline" style={{ marginTop: '20px' }}>RETURN TO CIVILIAN DASHBOARD</Link>
      </div>
    )
  }

  return (
    <div className="hud-layout" style={{ minHeight: '100vh', padding: '40px 10%' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,111,55,0.2)', paddingBottom: '20px', marginBottom: '40px' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '15px', color: '#fff', fontWeight: '900', letterSpacing: '4px', textShadow: '0 0 10px rgba(255,111,55,0.5)' }}>
          <Shield className="text-primary"/> NEUROX GLOBAL COMMAND
        </h1>
        <Link to="/dashboard" className="btn btn-outline" style={{ padding: '8px 16px', fontSize: '0.8rem' }}><Home size={16} style={{ display: 'inline', marginRight: '5px', verticalAlign: 'text-bottom' }} /> Dashboard</Link>
      </header>

      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ color: 'var(--color-text-muted)', fontSize: '1rem', fontFamily: 'monospace', marginBottom: '20px' }}>GLOBAL TARGET POOL_</h2>
        
        {globalUploads.length === 0 ? (
          <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
             No uploaded targets exist in the global platform yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {globalUploads.map(upload => (
              <div key={upload.id} className="glass-panel" style={{ padding: '25px', display: 'flex', gap: '25px', alignItems: 'stretch' }}>
                
                {/* Visual Thumbnail */}
                <div style={{ width: '220px', background: 'rgba(0,0,0,0.6)', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)', flexShrink: 0, position: 'relative', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)' }}>
                   {upload.media_type === 'video' ? (
                     <video src={upload.file_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted loop />
                   ) : (
                     <img src={upload.file_url} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(1.2)' }} alt="Upload" />
                   )}
                   <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.8)', padding: '4px 8px', fontSize: '0.65rem', color: '#fff', border: '1px solid var(--color-primary)', borderRadius: '4px', backdropFilter: 'blur(5px)' }}>{upload.media_type.toUpperCase()}</div>
                </div>

                {/* Data Column */}
                <div style={{ flex: '1', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                    <div>
                      <h3 style={{ color: '#fff', fontSize: '1.4rem', marginBottom: '8px', wordBreak: 'break-all', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>{upload.file_name}</h3>
                      <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', fontFamily: 'monospace', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '4px', display: 'inline-block' }}>
                        PROJECT // {upload.projects?.name || 'Unknown'} | {new Date(upload.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    {/* The Score Box */}
                    {upload.score_data ? (
                       <div className="score-card" style={{ padding: '15px 30px', minWidth: '150px' }}>
                         <div className="score-desc" style={{ color: 'var(--color-text-muted)', marginBottom: '5px' }}>VIRALITY</div>
                         <div className="score-value" style={{ fontSize: '2.5rem', margin: '0', color: upload.score_data.globalScore > 80 ? 'var(--color-primary)' : 'var(--color-warning)' }}>{upload.score_data.globalScore}</div>
                       </div>
                    ) : (
                       <div className="metric-card" style={{ padding: '15px 30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', fontFamily: 'monospace' }}>NOT YET SCANNED</span>
                       </div>
                    )}
                  </div>
                  
                  {/* User Feedback Status */}
                   {upload.user_feedback && (
                     <div className="metric-card" style={{ marginTop: '15px', borderLeft: upload.user_feedback.sentiment === 'Accurate' ? '4px solid var(--color-primary)' : '4px solid var(--color-danger)' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--color-text-muted)', fontSize: '0.8rem', fontFamily: 'monospace', marginBottom: '10px' }}>
                         TARGET DEMOGRAPHIC OVERRIDE LOG
                       </div>
                       <div style={{ color: '#fff', fontSize: '0.9rem', fontFamily: 'monospace' }}>
                         <span style={{ fontWeight: 'bold', color: upload.user_feedback.sentiment === 'Accurate' ? 'var(--color-primary)' : 'var(--color-danger)', marginRight: '10px' }}>[{upload.user_feedback.sentiment.toUpperCase()}]</span>
                         {upload.user_feedback.note || 'No additional audio/visual notes provided.'}
                       </div>
                     </div>
                   )}

                  {/* Internal Feedback Module */}
                  <div className="metric-card" style={{ marginTop: 'auto', borderLeft: '4px solid var(--color-danger)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--color-text-muted)', fontSize: '0.8rem', fontFamily: 'monospace', marginBottom: '10px' }}>
                      <MessageSquare size={14} /> ADMIN FEEDBACK LOG
                    </div>
                    
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input 
                        type="text" 
                        value={feedbackInputs[upload.id] !== undefined ? feedbackInputs[upload.id] : (upload.admin_feedback || '')}
                        onChange={(e) => handleFeedbackChange(upload.id, e.target.value)}
                        placeholder="Leave a direct threat-level review note..."
                        style={{ flex: '1', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', padding: '10px 15px', outline: 'none', fontFamily: 'monospace', fontSize: '0.9rem', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)' }}
                      />
                      <button 
                         onClick={() => submitFeedback(upload.id)}
                         className="btn btn-outline"
                         style={{ padding: '8px 20px', fontSize: '0.8rem' }}
                      >
                         SUBMIT
                      </button>
                      <Link to={`/dashboard/analysis/${upload.id}`} className="btn btn-primary" title="Override and View Deep Scan">
                         <ExternalLink size={18} />
                      </Link>
                    </div>
                  </div>

                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
