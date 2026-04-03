import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link, useNavigate } from 'react-router-dom'
import { exportToJSON } from '../lib/utils'
import { Folder, Plus, LogOut, Code, Shield, ChevronRight, FolderOpen, Clock, MoreVertical, Check, X, Download, Link as LinkIcon, Database, Trash2, Loader2 } from 'lucide-react'
import BoltIcon from '../components/BoltIcon'
import ConfirmModal from '../components/ConfirmModal'

const ProjectCard = ({ project, index, onExport, onDelete }) => {
  const [hovered, setHovered] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [copied, setCopied] = useState(false)
  
  const handleCopyLink = () => {
    const link = `${window.location.origin}/dashboard/project/${project.id}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    setShowMenu(false)
  }

  const handleExport = () => {
    onExport(project)
    setShowMenu(false)
  }

  const handleDelete = (e) => {
    e.preventDefault()
    e.stopPropagation()
    onDelete(project)
    setShowMenu(false)
  }
  
  return (
    <Link 
      to={`/dashboard/project/${project.id}`} 
      className="project-card-link"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false)
        setShowMenu(false)
      }}
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <div className={`project-card ${hovered ? 'hovered' : ''}`}>
        <div className="project-card-header">
          <div className="project-icon">
            <Folder size={20} />
          </div>
          <div 
            className="project-menu"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setShowMenu(!showMenu)
            }}
          >
            <MoreVertical size={16} />
            {showMenu && (
              <div className="project-menu-dropdown">
                <button 
                  className="menu-option"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleCopyLink()
                  }}
                >
                  {copied ? <Check size={14} /> : <LinkIcon size={14} />}
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
                <button 
                  className="menu-option"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleExport()
                  }}
                >
                  <Download size={14} />
                  Export JSON
                </button>
                <button 
                  className="menu-option danger"
                  onClick={handleDelete}
                >
                  <Trash2 size={14} />
                  Delete Project
                </button>
              </div>
            )}
          </div>
        </div>
        <h3 className="project-name">{project.name}</h3>
        <div className="project-meta">
          <span className="meta-item">
            <Clock size={12} />
            {new Date(project.created_at).toLocaleDateString()}
          </span>
          <span className="project-arrow">
            <ChevronRight size={18} />
          </span>
        </div>
        <div className="project-glow" />
      </div>
    </Link>
  )
}

const LoadingSkeleton = ({ type = 'card' }) => {
  if (type === 'card') {
    return (
      <div className="skeleton-card">
        <div className="skeleton-icon"></div>
        <div className="skeleton-title"></div>
        <div className="skeleton-meta"></div>
      </div>
    )
  }
  return (
    <div className="skeleton-badge">
      <div className="skeleton-badge-icon"></div>
      <div className="skeleton-badge-text"></div>
    </div>
  )
}

const StatCard = ({ icon, value, label, color }) => (
  <div className="stat-card-mini" style={{ '--stat-color': color }}>
    <div className="stat-icon">{icon}</div>
    <div className="stat-content">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  </div>
)

export default function Dashboard({ session }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingCredits, setLoadingCredits] = useState(true)
  const [newProjectName, setNewProjectName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [paymentMessage, setPaymentMessage] = useState('')
  const [credits, setCredits] = useState(null)
  const [creditsLoading, setCreditsLoading] = useState(null)
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, project: null })
  const [deletingProject, setDeletingProject] = useState(null)
  const navigate = useNavigate()

  const showToast = (message, type = 'info') => {
    const event = new CustomEvent('showToast', { detail: { message, type } })
    window.dispatchEvent(event)
  }

  useEffect(() => {
    fetchProjects()
    fetchCredits()
    setMounted(true)
    
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('payment') === 'success') {
      setPaymentMessage('Payment successful! Your credits have been added.')
      fetchCredits()
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const fetchCredits = async () => {
    setLoadingCredits(true)
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('credits')
        .eq('user_id', session.user.id)
        .single()
      
      if (error) {
        console.error('Error fetching credits:', error)
      } else if (data) {
        setCredits(data.credits)
      }
    } catch (err) {
      console.error('Failed to fetch credits:', err)
    } finally {
      setLoadingCredits(false)
    }
  }

  const fetchProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) {
        showToast('Failed to load projects. Please refresh the page.', 'error')
        console.error('Error fetching projects:', error)
      } else {
        setProjects(data || [])
      }
    } catch (err) {
      showToast('Network error loading projects. Please try again.', 'error')
      console.error('Failed to fetch projects:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateProject = async (e) => {
    e.preventDefault()
    if (!newProjectName.trim()) return
    setIsCreating(true)
    
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert([{ name: newProjectName, user_id: session.user.id }])
        .select()
      
      if (error) {
        showToast('Failed to create project. Please try again.', 'error')
        console.error('Error creating project:', error)
      } else if (data) {
        showToast('Project created successfully!', 'success')
        setProjects([data[0], ...projects])
        setNewProjectName('')
        navigate(`/dashboard/project/${data[0].id}`)
      }
    } catch (err) {
      showToast('Network error creating project. Please try again.', 'error')
      console.error('Failed to create project:', err)
    } finally {
      setIsCreating(false)
    }
  }

  const handleDeleteProject = async () => {
    if (!deleteModal.project) return
    setDeletingProject(deleteModal.project.id)

    try {
      const { error: uploadError } = await supabase
        .from('uploads')
        .delete()
        .eq('project_id', deleteModal.project.id)

      if (uploadError) {
        console.error('Error deleting uploads:', uploadError)
      }

      const { error: projectError } = await supabase
        .from('projects')
        .delete()
        .eq('id', deleteModal.project.id)

      if (projectError) {
        showToast('Failed to delete project. Please try again.', 'error')
        console.error('Error deleting project:', projectError)
      } else {
        setProjects(projects.filter(p => p.id !== deleteModal.project.id))
        showToast('Project deleted successfully', 'success')
      }
    } catch (err) {
      showToast('Network error deleting project. Please try again.', 'error')
      console.error('Failed to delete project:', err)
    } finally {
      setDeletingProject(null)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  const handleExportProject = async (project) => {
    try {
      const { data: uploads } = await supabase
        .from('uploads')
        .select('*')
        .eq('project_id', project.id)
      
      exportToJSON({
        project: {
          id: project.id,
          name: project.name,
          createdAt: project.created_at
        },
        uploads: uploads || []
      }, `neurox-project-${project.name}`)
      showToast('Project exported successfully!', 'success')
    } catch (err) {
      showToast('Failed to export project. Please try again.', 'error')
      console.error('Failed to export project:', err)
    }
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-bg">
        <div className="dashboard-grid" />
        <div className="dashboard-glow dashboard-glow-1" />
        <div className="dashboard-glow dashboard-glow-2" />
      </div>

      <header className={`dashboard-header ${mounted ? 'mounted' : ''}`}>
        <div className="header-left">
          <Link to="/" className="header-logo">
            <div className="logo-icon-small">
              <img src="/neurox-logo.png" alt="NEUROX" className="logo-img" />
            </div>
            <span>NEUROX</span>
          </Link>
          <div className="header-divider" />
          <span className="header-location">
            <FolderOpen size={16} />
            Dashboard
          </span>
        </div>
        <div className="header-right">
          {!loadingCredits ? (
            <div className={`credit-badge ${credits <= 5 ? 'credit-low' : ''}`}>
              <Database size={13} />
              <span className="credit-count">{credits !== null ? credits : '—'}</span>
              <span className="credit-label">CREDITS</span>
            </div>
          ) : (
            <div className="credit-badge loading">
              <Loader2 size={13} className="spin" />
              <span className="credit-count">...</span>
            </div>
          )}
          <Link to="/admin" className="header-btn admin-btn">
            <Shield size={16} />
            <span className="btn-text">Admin</span>
          </Link>
          <button onClick={handleLogout} className="header-btn logout-btn">
            <LogOut size={16} />
            <span className="btn-text">Exit</span>
          </button>
        </div>
      </header>

      <main className={`dashboard-main ${mounted ? 'mounted' : ''}`}>
        <div className="dashboard-welcome">
          <h1>Welcome back, Operator</h1>
          <p>Manage your projects and analyze viral potential</p>
        </div>

        {paymentMessage && (
          <div className="payment-success-banner">
            <Check size={18} />
            {paymentMessage}
            <button onClick={() => setPaymentMessage('')} className="dismiss-btn">
              <X size={16} />
            </button>
          </div>
        )}

        <div className="dashboard-grid-layout">
          {/* Projects Section */}
          <section className="projects-section">
            <div className="section-header-row">
              <div className="section-title-group">
                <Folder size={20} className="section-icon" />
                <h2>Active Projects</h2>
                <span className="project-count">{projects.length}</span>
              </div>
            </div>

            {loading ? (
              <div className="projects-grid">
                {[1, 2, 3].map(i => (
                  <LoadingSkeleton key={i} type="card" />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Code size={48} />
                </div>
                <h3>No Projects Detected</h3>
                <p>Initialize a new workspace to begin analysis</p>
              </div>
            ) : (
              <div className="projects-grid">
                  {projects.map((project, i) => (
                  <ProjectCard 
                    key={project.id} 
                    project={project} 
                    index={i} 
                    onExport={handleExportProject}
                    onDelete={(p) => setDeleteModal({ isOpen: true, project: p })}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Create Project Section */}
          <section className="create-section">
            <div className="create-card">
              <div className="create-header">
                <div className="create-icon">
                  <Plus size={24} />
                </div>
                <h3>New Project</h3>
              </div>
              
              <form onSubmit={handleCreateProject} className="create-form">
                <input 
                  type="text" 
                  placeholder="PROJECT_CODENAME" 
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  required
                  className="create-input"
                />
                <button 
                  disabled={isCreating} 
                  type="submit"
                  className="create-button"
                >
                  {isCreating ? (
                    <>
                      <div className="btn-spinner" />
                      Initializing...
                    </>
                  ) : (
                    <>
                      <BoltIcon size={18} />
                      Create Project
                    </>
                  )}
                </button>
              </form>

              <div className="create-tips">
                <h4>Quick Tips</h4>
                <ul>
                  <li>Use descriptive names for easy identification</li>
                  <li>Each project can hold up to 10 files</li>
                  <li>Videos must be under 20 seconds</li>
                </ul>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="quick-stats">
              <StatCard 
                icon={<Folder size={18} />}
                value={projects.length}
                label="Projects"
                color="var(--color-primary)"
              />
              <StatCard 
                icon={<Database size={18} />}
                value={credits === null ? '—' : credits}
                label="Scan Credits"
                color={credits !== null && credits <= 5 ? 'var(--color-danger)' : 'var(--color-accent)'}
              />
            </div>

            {credits !== null && credits <= 5 && (
              <div className="credits-warning">
                <BoltIcon size={14} />
                <span>Low credits! You have <strong>{credits}</strong> scan{credits !== 1 ? 's' : ''} remaining.</span>
              </div>
            )}
          </section>
        </div>
      </main>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, project: null })}
        onConfirm={handleDeleteProject}
        title="Delete Project"
        message={`Are you sure you want to delete "${deleteModal.project?.name}"? This will permanently remove all uploads and analysis data associated with this project.`}
        confirmText={deletingProject === deleteModal.project?.id ? 'Deleting...' : 'Delete Project'}
        type="danger"
        loading={deletingProject === deleteModal.project?.id}
      />

      <style>{`
        .dashboard-page {
          min-height: 100vh;
          position: relative;
          padding-top: 80px;
        }

        .dashboard-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
        }

        .dashboard-grid {
          position: absolute;
          inset: 0;
          background-image: 
            linear-gradient(rgba(255, 111, 55, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 111, 55, 0.02) 1px, transparent 1px);
          background-size: 40px 40px;
        }

        .dashboard-glow {
          position: absolute;
          width: 500px;
          height: 500px;
          border-radius: 50%;
          filter: blur(120px);
          opacity: 0.1;
        }

        .dashboard-glow-1 {
          top: 0;
          right: 0;
          background: var(--color-primary);
        }

        .dashboard-glow-2 {
          bottom: 0;
          left: 0;
          background: var(--color-secondary);
        }

        .dashboard-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 70px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 2rem;
          background: rgba(5, 0, 16, 0.9);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          z-index: 100;
          opacity: 0;
          transform: translateY(-20px);
          transition: all 0.5s ease;
        }

        .dashboard-header.mounted {
          opacity: 1;
          transform: translateY(0);
        }

        .header-left, .header-right {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .header-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          font-weight: 800;
          font-size: 1.1rem;
          letter-spacing: 2px;
          color: var(--color-text);
        }

        .logo-icon-small {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          box-shadow: 0 0 15px var(--color-primary-glow);
        }

        .logo-icon-small .logo-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: inherit;
        }

        .header-divider {
          width: 1px;
          height: 24px;
          background: rgba(255, 255, 255, 0.1);
        }

        .header-location {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--color-text-muted);
          font-size: 0.9rem;
        }

        .credit-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0.45rem 0.9rem;
          background: rgba(0, 212, 170, 0.08);
          border: 1px solid rgba(0, 212, 170, 0.25);
          border-radius: 8px;
          color: var(--color-accent);
          font-family: var(--font-mono);
          font-size: 0.78rem;
          font-weight: 600;
          letter-spacing: 0.5px;
          transition: var(--transition);
        }

        .credit-badge.credit-low {
          background: rgba(255, 59, 59, 0.1);
          border-color: rgba(255, 59, 59, 0.4);
          color: var(--color-danger);
          animation: creditPulse 1.5s ease infinite;
        }

        @keyframes creditPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255, 59, 59, 0); }
          50% { box-shadow: 0 0 12px 2px rgba(255, 59, 59, 0.3); }
        }

        .credit-count {
          font-size: 1rem;
          font-weight: 800;
        }

        .credit-label {
          opacity: 0.7;
          font-size: 0.7rem;
        }

        .credits-warning {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0.75rem 1rem;
          background: rgba(255, 59, 59, 0.08);
          border: 1px solid rgba(255, 59, 59, 0.25);
          border-radius: 10px;
          color: var(--color-danger);
          font-size: 0.85rem;
          margin-top: 0.75rem;
          animation: slideDown 0.3s ease;
        }

        .credits-warning strong {
          font-weight: 800;
        }

        .header-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0.6rem 1rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          color: var(--color-text-muted);
          font-size: 0.85rem;
          font-weight: 500;
          text-decoration: none;
          cursor: pointer;
          transition: var(--transition);
        }

        .header-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: var(--color-text);
        }

        .admin-btn:hover {
          border-color: var(--color-danger);
          color: var(--color-danger);
        }

        .logout-btn:hover {
          border-color: var(--color-primary);
          color: var(--color-primary);
        }

        .dashboard-main {
          max-width: 1400px;
          margin: 0 auto;
          padding: 3rem 2rem;
          position: relative;
          z-index: 5;
          opacity: 0;
          transform: translateY(20px);
          transition: all 0.6s ease 0.2s;
        }

        .dashboard-main.mounted {
          opacity: 1;
          transform: translateY(0);
        }

        .dashboard-welcome {
          margin-bottom: 3rem;
        }

        .dashboard-welcome h1 {
          font-size: 2rem;
          font-weight: 800;
          margin-bottom: 0.5rem;
          background: linear-gradient(135deg, var(--color-text), var(--color-primary));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .dashboard-welcome p {
          color: var(--color-text-muted);
          font-size: 1rem;
        }

        .payment-success-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 1rem 1.5rem;
          background: rgba(0, 212, 170, 0.1);
          border: 1px solid rgba(0, 212, 170, 0.3);
          border-radius: 12px;
          color: var(--color-accent);
          font-size: 0.95rem;
          font-weight: 600;
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
          color: var(--color-accent);
          cursor: pointer;
          padding: 4px;
          display: flex;
          opacity: 0.7;
          transition: var(--transition);
        }

        .dismiss-btn:hover {
          opacity: 1;
        }

        .dashboard-grid-layout {
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 2rem;
        }

        .section-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.5rem;
        }

        .section-title-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .section-icon {
          color: var(--color-primary);
        }

        .section-title-group h2 {
          font-size: 1.25rem;
          font-weight: 700;
        }

        .project-count {
          background: var(--color-primary-soft);
          color: var(--color-primary);
          padding: 4px 12px;
          border-radius: 100px;
          font-size: 0.8rem;
          font-weight: 600;
          font-family: var(--font-mono);
        }

        .projects-loading {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 3rem;
          background: rgba(255, 255, 255, 0.02);
          border: 1px dashed rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          color: var(--color-text-muted);
        }

        .loading-spinner {
          width: 24px;
          height: 24px;
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-top-color: var(--color-primary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .empty-state {
          text-align: center;
          padding: 4rem 2rem;
          background: linear-gradient(135deg, rgba(25, 15, 40, 0.6) 0%, rgba(15, 8, 25, 0.8) 100%);
          border: 1px dashed rgba(255, 255, 255, 0.1);
          border-radius: 16px;
        }

        .empty-icon {
          width: 80px;
          height: 80px;
          margin: 0 auto 1.5rem;
          background: rgba(255, 111, 55, 0.1);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-dim);
        }

        .empty-state h3 {
          font-size: 1.25rem;
          margin-bottom: 0.5rem;
          color: var(--color-text);
        }

        .empty-state p {
          color: var(--color-text-muted);
          font-size: 0.9rem;
        }

        .projects-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1rem;
        }

        .project-card-link {
          text-decoration: none;
          animation: fadeSlideIn 0.5s ease forwards;
          opacity: 0;
        }

        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .project-card {
          position: relative;
          padding: 1.5rem;
          background: linear-gradient(135deg, rgba(25, 15, 40, 0.8) 0%, rgba(15, 8, 25, 0.9) 100%);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          transition: var(--transition-bounce);
          overflow: hidden;
        }

        .project-card:hover,
        .project-card.hovered {
          transform: translateY(-5px);
          border-color: var(--color-primary);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), 0 0 30px var(--color-primary-soft);
        }

        .project-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .project-icon {
          width: 40px;
          height: 40px;
          background: rgba(255, 111, 55, 0.1);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-primary);
        }

        .project-menu {
          color: var(--color-text-dim);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: var(--transition);
          position: relative;
        }

        .project-menu:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--color-text);
        }

        .project-menu-dropdown {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 8px;
          background: linear-gradient(135deg, rgba(25, 15, 40, 0.98) 0%, rgba(15, 8, 25, 0.99) 100%);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          padding: 6px;
          z-index: 50;
          min-width: 140px;
          animation: menuSlide 0.2s ease;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        }

        @keyframes menuSlide {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .menu-option {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px 12px;
          background: transparent;
          border: none;
          border-radius: 6px;
          color: var(--color-text-muted);
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          transition: var(--transition);
          text-decoration: none;
        }

        .menu-option:hover {
          background: rgba(255, 111, 55, 0.15);
          color: var(--color-primary);
        }

        .menu-option.danger {
          color: var(--color-danger);
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          margin-top: 6px;
          padding-top: 12px;
        }

        .menu-option.danger:hover {
          background: rgba(252, 25, 53, 0.15);
          color: var(--color-danger);
        }

        /* Loading Skeleton */
        .skeleton-card {
          padding: 1.5rem;
          background: linear-gradient(135deg, rgba(25, 15, 40, 0.8) 0%, rgba(15, 8, 25, 0.9) 100%);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          animation: skeletonPulse 1.5s ease infinite;
        }

        @keyframes skeletonPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        .skeleton-icon {
          width: 40px;
          height: 40px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          margin-bottom: 1rem;
        }

        .skeleton-title {
          width: 70%;
          height: 20px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          margin-bottom: 0.75rem;
        }

        .skeleton-meta {
          width: 50%;
          height: 14px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 4px;
        }

        .credit-badge.loading {
          animation: skeletonPulse 1s ease infinite;
        }

        .project-name {
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--color-text);
          margin-bottom: 0.75rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .project-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8rem;
          color: var(--color-text-dim);
        }

        .project-arrow {
          color: var(--color-text-dim);
          opacity: 0;
          transform: translateX(-10px);
          transition: var(--transition);
        }

        .project-card:hover .project-arrow {
          opacity: 1;
          transform: translateX(0);
          color: var(--color-primary);
        }

        .project-glow {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, var(--color-primary), transparent);
          opacity: 0;
          transition: var(--transition);
        }

        .project-card:hover .project-glow {
          opacity: 1;
        }

        /* Create Section */
        .create-section {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .create-card {
          padding: 2rem;
          background: linear-gradient(135deg, rgba(25, 15, 40, 0.8) 0%, rgba(15, 8, 25, 0.9) 100%);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
        }

        .create-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 1.5rem;
        }

        .create-icon {
          width: 44px;
          height: 44px;
          background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          box-shadow: 0 8px 25px var(--color-primary-glow);
        }

        .create-header h3 {
          font-size: 1.1rem;
          font-weight: 700;
        }

        .create-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .create-input {
          padding: 1rem 1.25rem;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          color: var(--color-text);
          font-size: 0.95rem;
          font-family: var(--font-mono);
          outline: none;
          transition: var(--transition);
        }

        .create-input:focus {
          border-color: var(--color-primary);
          box-shadow: 0 0 20px var(--color-primary-soft);
        }

        .create-input::placeholder {
          color: var(--color-text-dim);
        }

        .create-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 1rem;
          background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          transition: var(--transition-bounce);
          box-shadow: 0 8px 25px var(--color-primary-glow);
        }

        .create-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 12px 35px var(--color-primary-glow);
        }

        .create-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .btn-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .create-tips {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .create-tips h4 {
          font-size: 0.85rem;
          color: var(--color-text-muted);
          margin-bottom: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .create-tips ul {
          list-style: none;
        }

        .create-tips li {
          font-size: 0.85rem;
          color: var(--color-text-dim);
          padding: 0.4rem 0;
          padding-left: 1rem;
          position: relative;
        }

        .create-tips li::before {
          content: '>';
          position: absolute;
          left: 0;
          color: var(--color-primary);
          font-family: var(--font-mono);
        }

        /* Quick Stats */
        .quick-stats {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .stat-card-mini {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1.25rem;
          background: linear-gradient(135deg, rgba(25, 15, 40, 0.6) 0%, rgba(15, 8, 25, 0.8) 100%);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 14px;
          transition: var(--transition);
        }

        .stat-card-mini:hover {
          border-color: var(--stat-color);
          transform: translateX(5px);
        }

        .stat-icon {
          width: 44px;
          height: 44px;
          background: rgba(255, 111, 55, 0.1);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--stat-color);
        }

        .stat-content {
          flex: 1;
        }

        .stat-value {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--color-text);
        }

        .stat-label {
          font-size: 0.8rem;
          color: var(--color-text-muted);
        }

        @media (max-width: 1100px) {
          .dashboard-grid-layout {
            grid-template-columns: 1fr;
          }
          .create-section {
            order: -1;
          }
          .quick-stats {
            flex-direction: row;
          }
          .stat-card-mini {
            flex: 1;
          }
        }

        @media (max-width: 768px) {
          .header-right {
            gap: 0.5rem;
          }
          .header-btn {
            padding: 0.5rem 0.75rem;
          }
          .credit-badge {
            padding: 0.4rem 0.75rem;
            font-size: 0.7rem;
          }
          .credit-count {
            font-size: 0.9rem;
          }
        }

        @media (max-width: 600px) {
          .dashboard-page {
            min-height: 100dvh;
          }
          .dashboard-header {
            padding: 0 1rem;
            height: 60px;
          }
          .header-left {
            flex: 1;
            min-width: 0;
          }
          .header-logo {
            font-size: 0.95rem;
            letter-spacing: 1px;
          }
          .logo-icon-small {
            width: 28px;
            height: 28px;
          }
          .header-divider {
            display: none;
          }
          .header-location {
            display: none;
          }
          .header-right {
            flex-shrink: 0;
          }
          .btn-text {
            display: none;
          }
          .header-btn {
            padding: 0.5rem;
            min-width: 40px;
            justify-content: center;
          }
          .dashboard-main {
            padding: 1.5rem 1rem;
            padding-top: 80px;
          }
          .dashboard-welcome h1 {
            font-size: 1.5rem;
          }
          .dashboard-welcome p {
            font-size: 0.9rem;
          }
          .dashboard-grid-layout {
            gap: 1.5rem;
          }
          .projects-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
          .project-card {
            padding: 1.25rem;
          }
          .project-name {
            font-size: 1rem;
          }
          .quick-stats {
            flex-direction: column;
          }
          .stat-card-mini {
            padding: 1rem;
          }
          .stat-icon {
            width: 40px;
            height: 40px;
          }
          .stat-value {
            font-size: 1.25rem;
          }
          .create-card {
            padding: 1.5rem;
          }
          .create-input {
            font-size: 16px;
          }
          .create-button {
            padding: 0.875rem 1.5rem;
          }
          .section-title-group h2 {
            font-size: 1.1rem;
          }
        }

        @media (max-width: 400px) {
          .header-logo span:not(.logo-icon-small) {
            display: none;
          }
          .logo-icon-small {
            width: 32px;
            height: 32px;
          }
          .admin-btn {
            display: none;
          }
        }
      `}</style>
    </div>
  )
}
