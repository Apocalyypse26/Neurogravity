import React, { useState, useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Shield, Home, Target, ChevronRight, MessageSquare, ExternalLink, Loader2, RefreshCw, Send, AlertCircle } from 'lucide-react'

const UploadCardSkeleton = () => (
  <div className="admin-upload-skeleton">
    <div className="skeleton-thumbnail"></div>
    <div className="skeleton-content">
      <div className="skeleton-title"></div>
      <div className="skeleton-meta"></div>
      <div className="skeleton-feedback"></div>
    </div>
  </div>
)

export default function AdminDashboard({ session }) {
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [globalUploads, setGlobalUploads] = useState([])
  const [feedbackInputs, setFeedbackInputs] = useState({})
  const [submitting, setSubmitting] = useState({})
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const showToast = (message, type = 'info') => {
    const event = new CustomEvent('showToast', { detail: { message, type } })
    window.dispatchEvent(event)
  }
  
  useEffect(() => {
    checkAdminStatus()
  }, [])

  const checkAdminStatus = async () => {
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      
      if (!currentSession) {
        console.log('No session found')
        setLoading(false)
        return
      }
      
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/api/admin/verify`, {
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`
        }
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to verify admin status' }))
        throw new Error(errorData.detail || 'Failed to verify admin status')
      }
      
      const { is_admin } = await response.json()
      
      if (is_admin) {
        setIsAdmin(true)
        await fetchGlobalUploads()
      }
    } catch (err) {
      console.error('Admin verification failed:', err)
      setError('Failed to verify admin access. Please try again.')
      showToast('Admin verification failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchGlobalUploads = async () => {
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      
      if (!currentSession) {
        showToast('Session expired. Please log in again.', 'error')
        return
      }
      
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/api/admin/uploads`, {
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`
        }
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to fetch uploads' }))
        throw new Error(errorData.detail || 'Failed to fetch uploads')
      }
      
      const { uploads } = await response.json()
      setGlobalUploads(uploads || [])
    } catch (err) {
      console.error('Failed to fetch uploads:', err)
      showToast('Failed to load uploads. Please try again.', 'error')
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchGlobalUploads()
    setRefreshing(false)
    showToast('Data refreshed successfully', 'success')
  }

  const handleFeedbackChange = (id, val) => {
    setFeedbackInputs(prev => ({ ...prev, [id]: val }))
  }

  const submitFeedback = async (id) => {
    const feedback = feedbackInputs[id]
    if (!feedback?.trim()) {
      showToast('Please enter feedback before submitting', 'warning')
      return
    }

    setSubmitting(prev => ({ ...prev, [id]: true }))

    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      
      if (!currentSession) {
        showToast('Session expired. Please log in again.', 'error')
        return
      }
      
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/api/admin/feedback`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          upload_id: id,
          feedback: feedback.trim()
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to submit feedback' }))
        throw new Error(errorData.detail || 'Failed to submit feedback')
      }
      
      setGlobalUploads(prev => prev.map(u => u.id === id ? { ...u, admin_feedback: feedback.trim() } : u))
      showToast('Feedback submitted successfully!', 'success')
    } catch (err) {
      console.error('Failed to submit feedback:', err)
      showToast('Failed to submit feedback. Please try again.', 'error')
    } finally {
      setSubmitting(prev => ({ ...prev, [id]: false }))
    }
  }

  if (loading) {
    return (
      <div className="hud-layout" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
        <div className="admin-loading">
          <div className="loading-ring-large" />
          <Shield size={32} />
        </div>
        <h2 style={{ color: '#fff', fontFamily: 'monospace', animation: 'blink 1.5s infinite'}}>VERIFYING CLEARANCE...</h2>
        <p style={{ color: 'var(--color-text-muted)', fontFamily: 'monospace', fontSize: '0.85rem' }}>Checking biometric signature...</p>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="hud-layout" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px', padding: '2rem' }}>
        <div className="error-icon-large">
          <Shield size={48} />
        </div>
        <h2 className="error-text" style={{ fontSize: '1.5rem', textAlign: 'center' }}>SECURITY CLEARANCE REJECTED</h2>
        <p style={{ color: 'var(--color-text-muted)', fontFamily: 'monospace', textAlign: 'center', maxWidth: '400px' }}>
          Your biometric signature is not mapped to the Admin Directory.
        </p>
        <Link to="/dashboard" className="btn btn-outline" style={{ marginTop: '20px' }}>RETURN TO DASHBOARD</Link>
      </div>
    )
  }

  return (
    <div className="hud-layout admin-dashboard">
      <header className="admin-header">
        <div className="admin-header-left">
          <Shield className="text-primary admin-icon"/>
          <h1 className="admin-title">NEUROX GLOBAL COMMAND</h1>
        </div>
        <div className="admin-header-right">
          <button 
            className={`refresh-btn ${refreshing ? 'spinning' : ''}`}
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh uploads"
          >
            <RefreshCw size={16} />
          </button>
          <Link to="/dashboard" className="btn btn-outline btn-sm">
            <Home size={16} /> Dashboard
          </Link>
        </div>
      </header>

      <div className="admin-section">
        <div className="section-header">
          <h2 className="section-title">GLOBAL TARGET POOL_</h2>
          <span className="count-badge">{globalUploads.length} targets</span>
        </div>
        
        {error && (
          <div className="error-banner">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button onClick={() => setError('')} className="dismiss-btn">
              <AlertCircle size={16} />
            </button>
          </div>
        )}
        
        {loading ? (
          <div className="uploads-list">
            {[1, 2, 3].map(i => (
              <UploadCardSkeleton key={i} />
            ))}
          </div>
        ) : globalUploads.length === 0 ? (
          <div className="glass-panel empty-panel">
            <Target size={48} className="empty-icon" />
            <h3>No Targets Found</h3>
            <p>No uploaded targets exist in the global platform yet.</p>
          </div>
        ) : (
          <div className="uploads-list">
            {globalUploads.map(upload => (
              <div key={upload.id} className="glass-panel upload-card">
                
                <div className="upload-thumbnail">
                   {upload.media_type === 'video' ? (
                     <video src={upload.file_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted loop />
                   ) : (
                     <img src={upload.file_url} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(1.2)' }} alt="Upload" loading="lazy" />
                   )}
                   <div className="media-badge">{upload.media_type.toUpperCase()}</div>
                </div>

                <div className="upload-content">
                  <div className="upload-header">
                    <div>
                      <h3 className="upload-title">{upload.file_name}</h3>
                      <div className="upload-meta">
                        PROJECT // {upload.projects?.name || 'Unknown'} | {new Date(upload.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    {upload.score_data ? (
                       <div className="score-card-mini">
                         <div className="score-label">VIRALITY</div>
                         <div className="score-number" style={{ color: upload.score_data.globalScore > 80 ? 'var(--color-primary)' : 'var(--color-warning)' }}>{upload.score_data.globalScore}</div>
                       </div>
                    ) : (
                       <div className="not-scanned-badge">
                         NOT YET SCANNED
                       </div>
                    )}
                  </div>
                   
                   {upload.user_feedback && (
                     <div className="feedback-card user-feedback">
                       <div className="feedback-label">TARGET DEMOGRAPHIC OVERRIDE LOG</div>
                       <div className="feedback-content">
                         <span className={`feedback-tag ${upload.user_feedback.sentiment === 'Accurate' ? 'positive' : 'negative'}`}>
                           [{upload.user_feedback.sentiment.toUpperCase()}]
                         </span>
                         {upload.user_feedback.note || 'No additional notes provided.'}
                       </div>
                     </div>
                   )}

                  <div className="feedback-card admin-feedback">
                    <div className="feedback-label">
                      <MessageSquare size={14} /> ADMIN FEEDBACK LOG
                    </div>
                    
                    <div className="feedback-form">
                      <input 
                        type="text" 
                        value={feedbackInputs[upload.id] !== undefined ? feedbackInputs[upload.id] : (upload.admin_feedback || '')}
                        onChange={(e) => handleFeedbackChange(upload.id, e.target.value)}
                        placeholder="Leave a threat-level review note..."
                        className="feedback-input"
                        disabled={submitting[upload.id]}
                      />
                      <button 
                         onClick={() => submitFeedback(upload.id)}
                         className="btn btn-outline btn-sm"
                         disabled={submitting[upload.id]}
                      >
                        {submitting[upload.id] ? (
                          <><Loader2 size={14} className="spin" /> Saving...</>
                        ) : (
                          <><Send size={14} /> SUBMIT</>
                        )}
                      </button>
                      <Link to={`/dashboard/analysis/${upload.id}`} className="btn btn-primary" title="View Deep Scan">
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

const adminStyles = `
  .admin-dashboard {
    min-height: 100vh;
    padding: 80px 5% 40px;
  }

  .admin-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 20px;
    margin-bottom: 30px;
    border-bottom: 1px solid rgba(255,111,55,0.2);
    flex-wrap: wrap;
    gap: 1rem;
  }

  .admin-header-left {
    display: flex;
    align-items: center;
    gap: 15px;
  }

  .admin-icon {
    width: 48px;
    height: 48px;
  }

  .admin-title {
    color: #fff;
    font-weight: 900;
    letter-spacing: 4px;
    font-size: 1.25rem;
    text-shadow: 0 0 10px rgba(255,111,55,0.5);
    margin: 0;
  }

  .admin-header-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .refresh-btn {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .refresh-btn:hover:not(:disabled) {
    background: rgba(255,255,255,0.1);
    color: var(--color-primary);
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .refresh-btn.spinning svg {
    animation: spin 1s linear infinite;
  }

  .admin-section {
    margin-bottom: 40px;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .section-title {
    color: var(--color-text-muted);
    font-size: 1rem;
    font-family: monospace;
    margin: 0;
  }

  .count-badge {
    background: var(--color-primary-soft);
    color: var(--color-primary);
    padding: 4px 12px;
    border-radius: 100px;
    font-size: 0.75rem;
    font-family: monospace;
  }

  .empty-panel {
    text-align: center;
    padding: 60px 40px;
  }

  .empty-icon {
    color: var(--color-text-dim);
    margin-bottom: 1rem;
  }

  .empty-panel h3 {
    color: var(--color-text);
    margin-bottom: 0.5rem;
  }

  .empty-panel p {
    color: var(--color-text-muted);
  }

  .uploads-list {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .upload-card {
    padding: 25px;
    display: flex;
    gap: 25px;
    align-items: stretch;
  }

  .upload-thumbnail {
    width: 200px;
    background: rgba(0,0,0,0.6);
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.05);
    flex-shrink: 0;
    position: relative;
    box-shadow: inset 0 0 20px rgba(0,0,0,0.8);
    aspect-ratio: 16/10;
  }

  .media-badge {
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(0,0,0,0.8);
    padding: 4px 8px;
    font-size: 0.65rem;
    color: #fff;
    border: 1px solid var(--color-primary);
    border-radius: 4px;
    backdrop-filter: blur(5px);
  }

  .upload-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .upload-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 15px;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .upload-title {
    color: #fff;
    font-size: 1.25rem;
    margin-bottom: 8px;
    word-break: break-word;
    text-shadow: 0 2px 4px rgba(0,0,0,0.8);
  }

  .upload-meta {
    color: var(--color-text-muted);
    font-size: 0.8rem;
    font-family: monospace;
    background: rgba(255,255,255,0.05);
    padding: 4px 10px;
    border-radius: 4px;
    display: inline-block;
    word-break: break-all;
  }

  .score-card-mini {
    padding: 15px 25px;
    min-width: 120px;
    text-align: center;
  }

  .score-label {
    color: var(--color-text-muted);
    font-size: 0.75rem;
    font-family: monospace;
    margin-bottom: 5px;
  }

  .score-number {
    font-size: 2rem;
    font-weight: 900;
    margin: 0;
    line-height: 1;
  }

  .not-scanned-badge {
    padding: 15px 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255,255,255,0.4);
    font-size: 0.7rem;
    font-family: monospace;
  }

  .feedback-card {
    margin-top: auto;
    padding: 15px;
    border-left: 4px solid var(--color-danger);
  }

  .feedback-card.user-feedback {
    border-left-color: var(--color-primary);
    margin-top: 15px;
  }

  .feedback-label {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text-muted);
    font-size: 0.75rem;
    font-family: monospace;
    margin-bottom: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .feedback-content {
    color: #fff;
    font-size: 0.9rem;
    font-family: monospace;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: baseline;
  }

  .feedback-tag {
    font-weight: bold;
  }

  .feedback-tag.positive {
    color: var(--color-primary);
  }

  .feedback-tag.negative {
    color: var(--color-danger);
  }

  .feedback-form {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .feedback-input {
    flex: 1;
    min-width: 200px;
    background: rgba(0,0,0,0.4);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    color: #fff;
    padding: 10px 15px;
    outline: none;
    font-family: monospace;
    font-size: 0.9rem;
    box-shadow: inset 0 2px 10px rgba(0,0,0,0.5);
    transition: border-color 0.2s ease;
  }

  .feedback-input:focus {
    border-color: var(--color-primary);
  }

  .feedback-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-sm {
    padding: 8px 16px;
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .admin-loading {
    position: relative;
    width: 80px;
    height: 80px;
    margin-bottom: 1rem;
  }

  .loading-ring-large {
    position: absolute;
    inset: 0;
    border: 3px solid transparent;
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 1.5s linear infinite;
  }

  .admin-loading svg {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: var(--color-primary);
  }

  .error-icon-large {
    width: 80px;
    height: 80px;
    background: rgba(252,25,53,0.1);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-danger);
    margin-bottom: 1.5rem;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 1rem 1.5rem;
    background: rgba(252,25,53,0.1);
    border: 1px solid rgba(252,25,53,0.2);
    border-radius: 12px;
    color: var(--color-danger);
    margin-bottom: 1.5rem;
  }

  .dismiss-btn {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--color-danger);
    cursor: pointer;
    padding: 4px;
    display: flex;
    opacity: 0.7;
    transition: opacity 0.2s;
  }

  .dismiss-btn:hover {
    opacity: 1;
  }

  /* Loading Skeleton */
  .admin-upload-skeleton {
    display: flex;
    gap: 25px;
    padding: 25px;
    background: linear-gradient(135deg, rgba(25,15,40,0.6) 0%, rgba(15,8,25,0.8) 100%);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
  }

  .skeleton-thumbnail {
    width: 200px;
    background: rgba(255,255,255,0.05);
    border-radius: 12px;
    aspect-ratio: 16/10;
    animation: skeletonPulse 1.5s ease infinite;
  }

  .skeleton-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .skeleton-title {
    width: 60%;
    height: 24px;
    background: rgba(255,255,255,0.1);
    border-radius: 4px;
    animation: skeletonPulse 1.5s ease infinite;
  }

  .skeleton-meta {
    width: 40%;
    height: 16px;
    background: rgba(255,255,255,0.05);
    border-radius: 4px;
    animation: skeletonPulse 1.5s ease infinite;
  }

  .skeleton-feedback {
    width: 80%;
    height: 40px;
    background: rgba(255,255,255,0.05);
    border-radius: 6px;
    margin-top: auto;
    animation: skeletonPulse 1.5s ease infinite;
  }

  @keyframes skeletonPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Mobile Responsiveness */
  @media (max-width: 900px) {
    .upload-card {
      flex-direction: column;
    }

    .upload-thumbnail {
      width: 100%;
      aspect-ratio: 16/9;
    }

    .upload-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .score-card-mini {
      align-self: flex-start;
    }
  }

  @media (max-width: 600px) {
    .admin-dashboard {
      padding: 70px 1rem 2rem;
    }

    .admin-title {
      font-size: 1rem;
      letter-spacing: 2px;
    }

    .admin-icon {
      width: 40px;
      height: 40px;
    }

    .upload-title {
      font-size: 1.1rem;
    }

    .feedback-form {
      flex-direction: column;
    }

    .feedback-input {
      min-width: 100%;
    }

    .btn-sm {
      width: 100%;
      justify-content: center;
    }
  }

  @media (max-width: 400px) {
    .admin-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .admin-header-right {
      width: 100%;
      justify-content: space-between;
    }
  }
`

const styleSheet = document.createElement('style')
styleSheet.textContent = adminStyles
document.head.appendChild(styleSheet)

