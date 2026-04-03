import React, { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { validateVideo } from '../lib/api'
import { useDropzone } from 'react-dropzone'
import StripeCheckout from '../components/StripeCheckout'
import ConfirmModal from '../components/ConfirmModal'
import MediaCard from '../components/MediaCard'
import { 
  ChevronLeft, Upload, AlertCircle, 
  Lock, CreditCard, FolderOpen, X, Check, Loader2, Grid, List,
  RefreshCw
} from 'lucide-react'

const getVideoDuration = (file) => {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = function () {
      window.URL.revokeObjectURL(video.src)
      resolve(video.duration)
    }
    video.src = URL.createObjectURL(file)
  })
}

const UploadProgress = ({ file, progress, status }) => (
  <div className="upload-progress-item">
    <div className="progress-icon">
      {status === 'complete' ? <Check size={16} /> : status === 'error' ? <X size={16} /> : <Loader2 size={16} className="spin" />}
    </div>
    <div className="progress-info">
      <span className="progress-name">{file.name}</span>
      <div className="progress-bar-container">
        <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
    <span className="progress-percent">{Math.round(progress)}%</span>
  </div>
)

export default function ProjectView({ session }) {
  const { projectId } = useParams()
  const [project, setProject] = useState(null)
  const [uploads, setUploads] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState([])
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [credits, setCredits] = useState(null)
  const [creditsLoading, setCreditsLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [viewMode, setViewMode] = useState('grid')
  const [isDragActive, setIsDragActive] = useState(false)
  const [showStripe, setShowStripe] = useState(false)
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, upload: null })
  const [deletingUpload, setDeletingUpload] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const showToast = (message, type = 'info') => {
    const event = new CustomEvent('showToast', { detail: { message, type } })
    window.dispatchEvent(event)
  }

  useEffect(() => {
    fetchProject()
    fetchUploads()
    fetchProfile()
    setMounted(true)
    
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('payment') === 'success') {
      setSuccessMsg('Payment successful! Your credits have been added.')
      fetchProfile()
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [projectId])

  const fetchProfile = async () => {
    setCreditsLoading(true)
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('credits')
        .eq('user_id', session.user.id)
        .single()
      
      if (error) {
        console.error('Error fetching profile:', error)
      } else if (data) {
        setCredits(data.credits)
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err)
    } finally {
      setCreditsLoading(false)
    }
  }

  const handleBuyCredits = () => {
    setShowStripe(true)
  }

  const handleStripeSuccess = () => {
    setShowStripe(false)
    setSuccessMsg('Credits purchased successfully!')
    fetchProfile()
    showToast('Credits added to your account!', 'success')
  }

  const fetchProject = async () => {
    try {
      const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).single()
      if (error) {
        showToast('Failed to load project. Please try again.', 'error')
        console.error('Error fetching project:', error)
      } else {
        setProject(data)
      }
    } catch (err) {
      showToast('Network error loading project.', 'error')
      console.error('Failed to fetch project:', err)
    }
  }

  const fetchUploads = async () => {
    try {
      const { data, error } = await supabase
        .from('uploads')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
      
      if (error) {
        showToast('Failed to load uploads. Please try again.', 'error')
        console.error('Error fetching uploads:', error)
      } else {
        setUploads(data || [])
      }
    } catch (err) {
      showToast('Network error loading uploads.', 'error')
      console.error('Failed to fetch uploads:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([fetchProject(), fetchUploads(), fetchProfile()])
    setRefreshing(false)
    showToast('Data refreshed successfully', 'success')
  }

  const handleDeleteUpload = async () => {
    if (!deleteModal.upload) return
    setDeletingUpload(deleteModal.upload.id)

    try {
      const fileName = deleteModal.upload.file_url.split('/').pop()
      
      const { error: storageError } = await supabase.storage
        .from('project_files')
        .remove([fileName])

      if (storageError) {
        console.error('Error deleting file from storage:', storageError)
      }

      const { error: dbError } = await supabase
        .from('uploads')
        .delete()
        .eq('id', deleteModal.upload.id)

      if (dbError) {
        showToast('Failed to delete file. Please try again.', 'error')
        console.error('Error deleting upload:', dbError)
      } else {
        setUploads(uploads.filter(u => u.id !== deleteModal.upload.id))
        showToast('File deleted successfully', 'success')
      }
    } catch (err) {
      showToast('Network error deleting file.', 'error')
      console.error('Failed to delete upload:', err)
    } finally {
      setDeletingUpload(null)
    }
  }

  const onDrop = useCallback(async (acceptedFiles) => {
    setErrorMsg('')
    setSuccessMsg('')
    
    if (uploads.length + acceptedFiles.length > 10) {
      setErrorMsg('Limit exceeded: A project can hold a maximum of 10 files.')
      return
    }

    setUploading(true)
    setUploadProgress(acceptedFiles.map(f => ({ file: f, progress: 0, status: 'uploading' })))
    
    let completedCount = 0
    let failedCount = 0
    
    for (const file of acceptedFiles) {
      const isVideo = file.type.startsWith('video/')
      const isImage = file.type.startsWith('image/')
      
      if (isImage && file.size > 8 * 1024 * 1024) {
        setUploadProgress(prev => prev.map(p => 
          p.file === file ? { ...p, status: 'error' } : p
        ))
        setErrorMsg(`Image rejected: "${file.name}" exceeds 8MB limit.`)
        failedCount++
        continue
      }
      
      if (isVideo && file.size > 25 * 1024 * 1024) {
        setUploadProgress(prev => prev.map(p => 
          p.file === file ? { ...p, status: 'error' } : p
        ))
        setErrorMsg(`Video rejected: "${file.name}" exceeds 25MB limit.`)
        failedCount++
        continue
      }

      if (isVideo) {
        try {
          const duration = await getVideoDuration(file)
          if (duration > 20) {
            setUploadProgress(prev => prev.map(p => 
              p.file === file ? { ...p, status: 'error' } : p
            ))
            setErrorMsg(`Video rejected: "${file.name}" exceeds 20 seconds duration.`)
            failedCount++
            continue
          }
        } catch (err) {
          console.error('Error checking video duration:', err)
        }
      }

      const fileExt = file.name.split('.').pop()
      const safeName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`
      
      for (let p = 0; p <= 100; p += 20) {
        await new Promise(r => setTimeout(r, 50))
        setUploadProgress(prev => prev.map(pr => 
          pr.file === file ? { ...pr, progress: p } : pr
        ))
      }
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('project_files')
        .upload(safeName, file)

      if (uploadError) {
        setUploadProgress(prev => prev.map(p => 
          p.file === file ? { ...p, status: 'error' } : p
        ))
        setErrorMsg(`Upload failed: ${file.name}. Please try again.`)
        failedCount++
        continue
      }

      const { data: publicUrlData } = supabase.storage.from('project_files').getPublicUrl(safeName)

      if (isVideo) {
        try {
          setUploadProgress(prev => prev.map(p => 
            p.file === file ? { ...p, progress: 50 } : p
          ))
          
          const validation = await validateVideo(publicUrlData.publicUrl, 20)
          
          setUploadProgress(prev => prev.map(p => 
            p.file === file ? { ...p, progress: 75 } : p
          ))
        } catch (validationError) {
          console.error('Video validation failed:', validationError)
          
          await supabase.storage.from('project_files').remove([safeName])
          
          setUploadProgress(prev => prev.map(p => 
            p.file === file ? { ...p, status: 'error' } : p
          ))
          setErrorMsg(`Video validation failed: ${validationError.message}`)
          failedCount++
          continue
        }
      }

      const { data: dbData, error: dbError } = await supabase
        .from('uploads')
        .insert([{
          project_id: projectId,
          user_id: session.user.id,
          file_name: file.name,
          file_url: publicUrlData.publicUrl,
          media_type: isVideo ? 'video' : 'image',
          file_size: file.size
        }])
        .select()
        
      if (dbData) {
        setUploadProgress(prev => prev.map(p => 
          p.file === file ? { ...p, status: 'complete' } : p
        ))
        setUploads(prev => [dbData[0], ...prev])
        completedCount++
      } else {
        setUploadProgress(prev => prev.map(p => 
          p.file === file ? { ...p, status: 'error' } : p
        ))
        failedCount++
      }
    }
    
    if (completedCount > 0) {
      setSuccessMsg(`Successfully uploaded ${completedCount} file${completedCount > 1 ? 's' : ''}.`)
      showToast(`Uploaded ${completedCount} file${completedCount > 1 ? 's' : ''} successfully!`, 'success')
    }
    
    if (failedCount > 0 && completedCount === 0) {
      showToast(`Failed to upload ${failedCount} file${failedCount > 1 ? 's' : ''}.`, 'error')
    }
    
    setTimeout(() => {
      setUploading(false)
      setUploadProgress([])
    }, 1500)
  }, [projectId, session, uploads.length])

  const { getRootProps, getInputProps, isDragActive: isDropzoneActive } = useDropzone({ 
    onDrop,
    accept: {
      'image/jpeg': ['.jpeg', '.jpg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'video/mp4': ['.mp4']
    },
    disabled: uploading || uploads.length >= 10
  })

  return (
    <div className="project-page">
      <div className="project-bg">
        <div className="project-grid" />
      </div>

      <header className={`project-header ${mounted ? 'mounted' : ''}`}>
        <Link to="/dashboard" className="back-link">
          <ChevronLeft size={20} />
          <span className="back-text">Dashboard</span>
        </Link>
        <div className="header-stats">
          <button 
            className={`refresh-btn ${refreshing ? 'spinning' : ''}`}
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh data"
          >
            <RefreshCw size={16} />
          </button>
          <div className={`stat-pill credits ${credits === 0 ? 'danger' : ''}`}>
            <Zap size={14} />
            <span>SCANS:</span>
            {!creditsLoading ? (
              <strong>{credits !== null ? credits : '—'}</strong>
            ) : (
              <strong className="loading">...</strong>
            )}
          </div>
          <div className="stat-pill">
            <span>FILES:</span>
            <strong>{uploads.length}/10</strong>
          </div>
        </div>
      </header>

      <main className={`project-main ${mounted ? 'mounted' : ''}`}>
        <div className="project-title-section">
          <div className="folder-icon">
            <FolderOpen size={28} />
          </div>
          <h1>{project ? project.name : 'Loading...'}</h1>
        </div>

        {errorMsg && (
          <div className="error-banner">
            <AlertCircle size={18} />
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg('')} className="dismiss-btn">
              <X size={16} />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="success-banner">
            <Check size={18} />
            <span>{successMsg}</span>
            <button onClick={() => setSuccessMsg('')} className="dismiss-btn success">
              <X size={16} />
            </button>
          </div>
        )}

        <div className="project-content">
          {/* Upload Zone */}
          <div className="upload-zone-section">
            {credits === 0 ? (
              <div className="credits-locked">
                <div className="locked-icon">
                  <Lock size={40} />
                </div>
                <h3>Enterprise Limit Reached</h3>
                <p>Your account holds 0 available scans. Acquire more to continue analysis.</p>
                <button onClick={handleBuyCredits} className="buy-credits-btn">
                  <CreditCard size={20} />
                  Acquire 10 Scans ($15)
                </button>
              </div>
            ) : (
              <div 
                {...getRootProps()} 
                className={`upload-zone ${isDropzoneActive ? 'active' : ''} ${uploading ? 'uploading' : ''}`}
              >
                <input {...getInputProps()} />
                <div className="upload-zone-content">
                  {uploading ? (
                    <>
                      <div className="upload-spinner" />
                      <span className="upload-text">Uploading...</span>
                    </>
                  ) : isDropzoneActive ? (
                    <>
                      <div className="upload-icon active">
                        <Upload size={32} />
                      </div>
                      <span className="upload-text highlight">Drop to Inject</span>
                    </>
                  ) : (
                    <>
                      <div className="upload-icon">
                        <Upload size={32} />
                      </div>
                      <span className="upload-text">Drag & Drop or Click</span>
                      <span className="upload-hint">JPG, PNG, WEBP (8MB) • MP4 (25MB, 20s)</span>
                    </>
                  )}
                </div>
                {uploading && uploadProgress.length > 0 && (
                  <div className="upload-progress-list">
                    {uploadProgress.map((item, i) => (
                      <UploadProgress key={i} {...item} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Gallery */}
          <div className="gallery-section">
            <div className="gallery-header">
              <h2>
                <span className="gallery-icon"><Grid size={18} /></span>
                Visual Stream
                <span className="count-badge">{uploads.length}</span>
              </h2>
              <div className="view-toggle">
                <button 
                  className={viewMode === 'grid' ? 'active' : ''} 
                  onClick={() => setViewMode('grid')}
                >
                  <Grid size={16} />
                </button>
                <button 
                  className={viewMode === 'list' ? 'active' : ''} 
                  onClick={() => setViewMode('list')}
                >
                  <List size={16} />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="gallery-loading">
                <Loader2 size={32} className="spin" />
                <span>Compiling visual intelligence...</span>
              </div>
            ) : uploads.length === 0 ? (
              <div className="gallery-empty">
                <div className="empty-icon-large">
                  <FileImageIcon size={48} />
                </div>
                <h3>No Targets Acquired</h3>
                <p>Upload files to begin Neuro-Virality analysis</p>
              </div>
            ) : (
              <div className={`media-gallery ${viewMode}`}>
                {uploads.map(u => (
                  <MediaCard 
                    key={u.id} 
                    upload={u} 
                    onDelete={(upload) => setDeleteModal({ isOpen: true, upload })}
                    onAnalyze={() => {}}
                    isDeleting={deletingUpload === u.id}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {showStripe && (
        <StripeCheckout
          userId={session.user.id}
          email={session.user.email}
          onClose={() => setShowStripe(false)}
          onSuccess={handleStripeSuccess}
        />
      )}

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, upload: null })}
        onConfirm={handleDeleteUpload}
        title="Delete File"
        message={`Are you sure you want to delete "${deleteModal.upload?.file_name}"? This action cannot be undone.`}
        confirmText={deletingUpload === deleteModal.upload?.id ? 'Deleting...' : 'Delete File'}
        type="danger"
        loading={deletingUpload === deleteModal.upload?.id}
      />

      <style>{`
        .project-page {
          min-height: 100vh;
          position: relative;
          padding-top: 80px;
        }

        .project-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
        }

        .project-grid {
          position: absolute;
          inset: 0;
          background-image: 
            linear-gradient(rgba(255, 111, 55, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 111, 55, 0.02) 1px, transparent 1px);
          background-size: 40px 40px;
        }

        .project-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 70px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 2rem;
          background: rgba(5, 0, 16, 0.95);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          z-index: 100;
          opacity: 0;
          transform: translateY(-20px);
          transition: all 0.5s ease;
        }

        .project-header.mounted {
          opacity: 1;
          transform: translateY(0);
        }

        .back-link {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--color-text-muted);
          text-decoration: none;
          font-weight: 500;
          transition: var(--transition);
        }

        .back-link:hover {
          color: var(--color-primary);
        }

        .header-stats {
          display: flex;
          gap: 1rem;
        }

        .stat-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0.5rem 1rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 100px;
          font-size: 0.85rem;
          color: var(--color-text-muted);
        }

        .stat-pill strong {
          color: var(--color-text);
          font-family: var(--font-mono);
        }

        .stat-pill.credits {
          border-color: var(--color-primary);
          background: var(--color-primary-soft);
        }

        .stat-pill.credits svg {
          color: var(--color-primary);
        }

        .stat-pill .danger {
          color: var(--color-danger);
        }

        .project-main {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
          position: relative;
          z-index: 5;
          opacity: 0;
          transform: translateY(20px);
          transition: all 0.6s ease 0.2s;
        }

        .project-main.mounted {
          opacity: 1;
          transform: translateY(0);
        }

        .project-title-section {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 2rem;
        }

        .folder-icon {
          width: 56px;
          height: 56px;
          background: linear-gradient(135deg, var(--color-primary-soft), transparent);
          border: 1px solid rgba(255, 111, 55, 0.2);
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-primary);
        }

        .project-title-section h1 {
          font-size: 2rem;
          font-weight: 800;
        }

        .error-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 1rem 1.5rem;
          background: rgba(252, 25, 53, 0.1);
          border: 1px solid rgba(252, 25, 53, 0.2);
          border-radius: 12px;
          color: var(--color-danger);
          margin-bottom: 2rem;
          animation: slideDown 0.3s ease;
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
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
          transition: var(--transition);
        }

        .dismiss-btn:hover {
          opacity: 1;
        }

        .project-content {
          display: grid;
          grid-template-columns: 350px 1fr;
          gap: 2rem;
        }

        /* Upload Zone */
        .upload-zone-section {
          height: fit-content;
        }

        .credits-locked {
          text-align: center;
          padding: 3rem 2rem;
          background: linear-gradient(135deg, rgba(25, 15, 40, 0.8) 0%, rgba(15, 8, 25, 0.9) 100%);
          border: 1px solid rgba(252, 25, 53, 0.2);
          border-radius: 20px;
        }

        .locked-icon {
          width: 80px;
          height: 80px;
          margin: 0 auto 1.5rem;
          background: rgba(252, 25, 53, 0.1);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-danger);
        }

        .credits-locked h3 {
          font-size: 1.25rem;
          margin-bottom: 0.75rem;
        }

        .credits-locked p {
          color: var(--color-text-muted);
          font-size: 0.9rem;
          margin-bottom: 2rem;
        }

        .buy-credits-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 1rem 2rem;
          background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          transition: var(--transition-bounce);
          box-shadow: 0 8px 25px var(--color-primary-glow);
        }

        .buy-credits-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 35px var(--color-primary-glow);
        }

        .upload-zone {
          padding: 3rem 2rem;
          background: linear-gradient(135deg, rgba(25, 15, 40, 0.8) 0%, rgba(15, 8, 25, 0.9) 100%);
          border: 2px dashed rgba(255, 111, 55, 0.3);
          border-radius: 20px;
          text-align: center;
          cursor: pointer;
          transition: var(--transition);
        }

        .upload-zone:hover {
          border-color: var(--color-primary);
          background: linear-gradient(135deg, rgba(255, 111, 55, 0.05) 0%, rgba(15, 8, 25, 0.9) 100%);
        }

        .upload-zone.active {
          border-color: var(--color-primary);
          background: rgba(255, 111, 55, 0.1);
          transform: scale(1.02);
        }

        .upload-zone.uploading {
          cursor: wait;
        }

        .upload-zone-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        .upload-icon {
          width: 64px;
          height: 64px;
          background: var(--color-primary-soft);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-primary);
          transition: var(--transition);
        }

        .upload-icon.active {
          background: var(--color-primary);
          color: white;
          animation: pulse 1s ease infinite;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }

        .upload-text {
          font-size: 1rem;
          font-weight: 600;
          color: var(--color-text);
        }

        .upload-text.highlight {
          color: var(--color-primary);
          font-size: 1.25rem;
        }

        .upload-hint {
          font-size: 0.8rem;
          color: var(--color-text-dim);
          font-family: var(--font-mono);
        }

        .upload-spinner {
          width: 48px;
          height: 48px;
          border: 3px solid rgba(255, 111, 55, 0.2);
          border-top-color: var(--color-primary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .upload-progress-list {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .upload-progress-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0.75rem 0;
        }

        .progress-icon {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.05);
          color: var(--color-primary);
        }

        .progress-info {
          flex: 1;
        }

        .progress-name {
          display: block;
          font-size: 0.85rem;
          color: var(--color-text);
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 180px;
        }

        .progress-bar-container {
          height: 4px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
          overflow: hidden;
        }

        .progress-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--color-primary), var(--color-secondary));
          border-radius: 2px;
          transition: width 0.3s ease;
        }

        .progress-percent {
          font-size: 0.8rem;
          font-family: var(--font-mono);
          color: var(--color-text-muted);
        }

        /* Gallery */
        .gallery-section {
          background: linear-gradient(135deg, rgba(25, 15, 40, 0.6) 0%, rgba(15, 8, 25, 0.8) 100%);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 20px;
          padding: 1.5rem;
        }

        .gallery-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.5rem;
        }

        .gallery-header h2 {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 1.1rem;
          font-weight: 700;
        }

        .gallery-icon {
          color: var(--color-primary);
        }

        .count-badge {
          background: var(--color-primary-soft);
          color: var(--color-primary);
          padding: 4px 10px;
          border-radius: 100px;
          font-size: 0.75rem;
          font-family: var(--font-mono);
        }

        .view-toggle {
          display: flex;
          gap: 4px;
          background: rgba(0, 0, 0, 0.3);
          padding: 4px;
          border-radius: 8px;
        }

        .view-toggle button {
          padding: 8px 12px;
          background: transparent;
          border: none;
          border-radius: 6px;
          color: var(--color-text-dim);
          cursor: pointer;
          transition: var(--transition);
          display: flex;
        }

        .view-toggle button:hover {
          color: var(--color-text);
        }

        .view-toggle button.active {
          background: var(--color-primary);
          color: white;
        }

        .gallery-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          padding: 4rem;
          color: var(--color-text-muted);
        }

        .gallery-empty {
          text-align: center;
          padding: 4rem 2rem;
        }

        .empty-icon-large {
          width: 100px;
          height: 100px;
          margin: 0 auto 1.5rem;
          background: rgba(255, 111, 55, 0.1);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-dim);
        }

        .gallery-empty h3 {
          font-size: 1.25rem;
          margin-bottom: 0.5rem;
        }

        .gallery-empty p {
          color: var(--color-text-muted);
          font-size: 0.9rem;
        }

        .media-gallery {
          display: grid;
          gap: 1rem;
        }

        .media-gallery.grid {
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        }

        .media-gallery.list {
          grid-template-columns: 1fr;
        }

        .media-card {
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          overflow: hidden;
          transition: var(--transition);
          animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }

        .media-card:hover {
          border-color: var(--color-primary);
          transform: translateY(-3px);
          box-shadow: 0 15px 30px rgba(0, 0, 0, 0.4);
        }

        .media-preview {
          position: relative;
          aspect-ratio: 16/10;
          background: #000;
        }

        .media-preview img,
        .media-preview video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .media-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          opacity: 0;
          transition: var(--transition);
        }

        .media-card:hover .media-overlay {
          opacity: 1;
        }

        .media-action {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: 10px;
          text-decoration: none;
          transition: var(--transition);
          cursor: pointer;
          background: none;
          border: none;
        }

        .media-action.analyze {
          background: var(--color-primary);
          color: white;
        }

        .media-action.analyze:hover {
          background: var(--color-secondary);
          transform: scale(1.1);
        }

        .media-action.delete {
          background: rgba(252, 25, 53, 0.2);
          color: var(--color-danger);
        }

        .media-action.delete:hover {
          background: var(--color-danger);
          color: white;
        }

        .media-type-badge {
          position: absolute;
          top: 8px;
          left: 8px;
          padding: 4px 8px;
          background: rgba(0, 0, 0, 0.7);
          border-radius: 6px;
          color: var(--color-primary);
        }

        .media-info {
          padding: 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .media-name {
          font-size: 0.8rem;
          color: var(--color-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 120px;
        }

        .media-size {
          font-size: 0.75rem;
          color: var(--color-text-dim);
          font-family: var(--font-mono);
        }

        @media (max-width: 1000px) {
          .project-content {
            grid-template-columns: 1fr;
          }
          .upload-zone-section {
            order: -1;
          }
        }

        @media (max-width: 768px) {
          .back-text {
            display: none;
          }
          .header-stats {
            gap: 0.5rem;
          }
          .stat-pill {
            padding: 0.4rem 0.75rem;
            font-size: 0.75rem;
          }
        }

        @media (max-width: 600px) {
          .project-header {
            padding: 0 1rem;
            height: 60px;
          }
          .back-link {
            font-size: 0.85rem;
          }
          .project-main {
            padding: 1rem;
            padding-top: 80px;
          }
          .project-title-section h1 {
            font-size: 1.5rem;
          }
          .media-gallery.grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .media-gallery.list {
            grid-template-columns: 1fr;
          }
          .stat-pill strong {
            font-size: 0.9rem;
          }
        }

        @media (max-width: 400px) {
          .back-text {
            display: none;
          }
          .stat-pill span {
            display: none;
          }
        }

        /* Success Banner */
        .success-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 1rem 1.5rem;
          background: rgba(0, 212, 170, 0.1);
          border: 1px solid rgba(0, 212, 170, 0.2);
          border-radius: 12px;
          color: #00d4aa;
          margin-bottom: 1.5rem;
          animation: slideDown 0.3s ease;
        }

        .dismiss-btn.success {
          color: #00d4aa;
        }

        .dismiss-btn.success:hover {
          opacity: 1;
          background: rgba(0, 212, 170, 0.1);
        }

        /* Refresh Button */
        .refresh-btn {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          color: var(--color-text-muted);
          cursor: pointer;
          transition: var(--transition);
        }

        .refresh-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          color: var(--color-primary);
        }

        .refresh-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .refresh-btn.spinning svg {
          animation: spin 1s linear infinite;
        }

        .stat-pill.danger {
          border-color: var(--color-danger);
          background: rgba(252, 25, 53, 0.1);
        }

        .stat-pill.danger svg {
          color: var(--color-danger);
        }

        .stat-pill.danger strong {
          color: var(--color-danger);
        }

        .stat-pill strong.loading {
          animation: skeletonPulse 1s ease infinite;
        }

        @keyframes skeletonPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Improved touch targets */
        .media-action {
          min-width: 44px;
          min-height: 44px;
        }

        .view-toggle button {
          min-width: 44px;
          min-height: 44px;
        }
      `}</style>
    </div>
  )
}
