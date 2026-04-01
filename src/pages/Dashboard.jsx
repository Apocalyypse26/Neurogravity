import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link, useNavigate } from 'react-router-dom'
import { Folder, Plus, LogOut, Code, Shield, Zap, ChevronRight, FolderOpen, Clock, MoreVertical } from 'lucide-react'

const ProjectCard = ({ project, index }) => {
  const [hovered, setHovered] = useState(false)
  
  return (
    <Link 
      to={`/dashboard/project/${project.id}`} 
      className="project-card-link"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <div className={`project-card ${hovered ? 'hovered' : ''}`}>
        <div className="project-card-header">
          <div className="project-icon">
            <Folder size={20} />
          </div>
          <div className="project-menu">
            <MoreVertical size={16} />
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
  const [newProjectName, setNewProjectName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [mounted, setMounted] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetchProjects()
    setMounted(true)
  }, [])

  const fetchProjects = async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
      
    if (!error && data) setProjects(data)
    setLoading(false)
  }

  const handleCreateProject = async (e) => {
    e.preventDefault()
    if (!newProjectName.trim()) return
    setIsCreating(true)
    
    const { data, error } = await supabase
      .from('projects')
      .insert([{ name: newProjectName, user_id: session.user.id }])
      .select()
      
    if (!error && data) {
      setProjects([data[0], ...projects])
      setNewProjectName('')
      navigate(`/dashboard/project/${data[0].id}`)
    }
    setIsCreating(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/')
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
          <Link to="/admin" className="header-btn admin-btn">
            <Shield size={16} />
            Admin
          </Link>
          <button onClick={handleLogout} className="header-btn logout-btn">
            <LogOut size={16} />
            Exit
          </button>
        </div>
      </header>

      <main className={`dashboard-main ${mounted ? 'mounted' : ''}`}>
        <div className="dashboard-welcome">
          <h1>Welcome back, Operator</h1>
          <p>Manage your projects and analyze viral potential</p>
        </div>

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
              <div className="projects-loading">
                <div className="loading-spinner" />
                <span>Scanning project directory...</span>
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
                  <ProjectCard key={project.id} project={project} index={i} />
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
                      <Zap size={18} />
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
                icon={<Zap size={18} />}
                value={projects.length * 3}
                label="Avg Score"
                color="var(--color-accent)"
              />
            </div>
          </section>
        </div>
      </main>

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
        }

        .project-menu:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--color-text);
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

        @media (max-width: 600px) {
          .dashboard-page {
            min-height: 100dvh;
          }
          .dashboard-header {
            padding: 0 1rem;
            flex-wrap: wrap;
            gap: 0.5rem;
          }
          .header-location {
            display: none;
          }
          .header-actions {
            width: 100%;
            justify-content: space-between;
          }
          .dashboard-main {
            padding: 1.5rem 1rem;
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
            font-size: 16px; /* Prevents zoom on iOS */
          }
          .create-button {
            padding: 0.875rem 1.5rem;
          }
        }
      `}</style>
    </div>
  )
}
