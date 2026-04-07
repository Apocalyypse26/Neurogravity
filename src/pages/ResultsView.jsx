import React, { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { createAnalysisJob, getJobByUpload, checkApiHealth, subscribeToJob } from '../lib/api'
import { exportToJSON, shareToTwitter, shareToTelegram, generateShareableImage } from '../lib/utils'
import { logger } from '../lib/logger'
import LazyImage from '../components/LazyImage'
import BoltIcon from '../components/BoltIcon'
import { SkeletonScoreCard, SkeletonProgressBar, SkeletonMediaCard, SkeletonText, SkeletonAvatar } from '../components/SkeletonScreens'
import { 
  ChevronLeft, Target, AlertTriangle, CheckCircle, Eye, 
  Crosshair, Cpu, ThumbsUp, ThumbsDown, Send, Loader2, Share2,
  Download, Filter, Play, Pause, Volume2, Radio, BarChart3, Activity,
  Globe, MessageCircle, Image, ChevronDown, Copy, Check
} from 'lucide-react'

const AnimatedScore = ({ score, maxScore = 100, color }) => {
  const [animatedScore, setAnimatedScore] = useState(0)
  
  useEffect(() => {
    let start = 0
    const duration = 1500
    const startTime = performance.now()
    
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setAnimatedScore(Math.floor(eased * score))
      
      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }
    
    requestAnimationFrame(animate)
  }, [score])
  
  return (
    <span style={{ color, textShadow: `0 0 30px ${color}` }}>
      {animatedScore}
    </span>
  )
}

const ProgressBar = ({ value, label, color, delay = 0 }) => {
  const [width, setWidth] = useState(0)
  const barRef = useRef(null)
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setWidth(value), delay)
          observer.disconnect()
        }
      },
      { threshold: 0.5 }
    )
    
    if (barRef.current) observer.observe(barRef.current)
    return () => observer.disconnect()
  }, [value, delay])
  
  return (
    <div className="result-progress" ref={barRef}>
      <div className="progress-header">
        <span className="progress-label">{label}</span>
        <span className="progress-value" style={{ color }}>{value}%</span>
      </div>
      <div className="progress-track">
        <div 
          className="progress-fill" 
          style={{ 
            width: `${width}%`, 
            background: `linear-gradient(90deg, ${color}, ${color}88)`,
            boxShadow: `0 0 15px ${color}`
          }} 
        />
      </div>
    </div>
  )
}

export default function ResultsView({ session }) {
  const { uploadId } = useParams()
  const [upload, setUpload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [analysisData, setAnalysisData] = useState(null)
  const [serverError, setServerError] = useState(false)
  const [feedbackSentiment, setFeedbackSentiment] = useState(null)
  const [feedbackNote, setFeedbackNote] = useState('')
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [imageFilter, setImageFilter] = useState('RAW')
  const [videoTime, setVideoTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [analysisStatus, setAnalysisStatus] = useState('initializing')
  const [jobProgress, setJobProgress] = useState(0)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [copied, setCopied] = useState(false)
  const sseRef = useRef(null)
  const videoRef = useRef(null)
  const timelineRef = useRef(null)

  useEffect(() => {
    fetchUpload()
    setMounted(true)
    
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, [uploadId])

  const fetchUpload = async () => {
    const { data } = await supabase.from('uploads').select('*, projects(id, name)').eq('id', uploadId).single()
    if (data) {
      setUpload(data)
      if (data.score_data) {
        setAnalysisData(data.score_data)
        setLoading(false)
      } else {
        await executeAnalysisHook(data)
      }
    } else {
      setLoading(false)
    }
  }

  const executeAnalysisHook = async (targetData) => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      console.log('[ANALYSIS] Starting analysis, API URL:', apiUrl);
      
      setAnalysisStatus('preparing');
      
      const existingJob = await getJobByUpload(targetData.id);
      let jobId;
      let jobToken = null;

      if (existingJob && existingJob.status === 'completed') {
        console.log('[ANALYSIS] Using cached result');
        const result = existingJob.result;
        setAnalysisData(result);
        setAnalysisStatus('complete');
        
        await supabase.from('uploads').update({ score_data: result }).eq('id', targetData.id);
        setLoading(false);
        return;
      }

      if (existingJob && existingJob.status !== 'failed') {
        jobId = existingJob.job_id;
        setAnalysisStatus('polling');
        
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            const tokenRes = await fetch(`${apiUrl}/api/jobs/${jobId}/token`, {
              headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (tokenRes.ok) {
              const tokenData = await tokenRes.json();
              jobToken = tokenData.token;
            }
          }
        } catch (e) {
          // Could not get job token for resume
        }
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        
        try {
          const createRes = await fetch(`${apiUrl}/api/jobs/create`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
            },
            body: JSON.stringify({
              upload_id: targetData.id,
              media_type: targetData.media_type,
              file_url: targetData.file_url
            })
          });
          
          if (createRes.ok) {
            const jobData = await createRes.json();
            jobId = jobData.job_id;
            jobToken = jobData.job_token;
            setAnalysisStatus('processing');
          } else {
            console.error('[ANALYSIS] Failed to create job:', createRes.status);
            // Fall back to direct analysis
            jobId = null;
          }
        } catch (e) {
          console.error('[ANALYSIS] Error creating job:', e);
          jobId = null;
        }
      }

      if (jobId && jobToken) {
        sseRef.current = subscribeToJob(jobId, {
          jobToken,
          onProgress: (progress, status) => {
            setJobProgress(progress);
            if (status === 'processing') setAnalysisStatus('analyzing');
            if (status === 'completed') setAnalysisStatus('complete');
            if (status === 'failed') setAnalysisStatus('failed');
          },
          onComplete: (result) => {
            setAnalysisData(result);
            setAnalysisStatus('complete');
            supabase.from('uploads').update({ score_data: result }).eq('id', targetData.id);
            setLoading(false);
          },
          onError: (error) => {
            console.error('[ANALYSIS] SSE error:', error);
            setServerError(error);
            setAnalysisStatus('failed');
            setLoading(false);
          }
        });
      } else {
        // Fallback: try direct analysis endpoint
        console.log('[ANALYSIS] No job created, attempting direct analysis');
        try {
          const analyzeRes = await fetch(`${apiUrl}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              upload_id: targetData.id,
              media_type: targetData.media_type,
              file_url: targetData.file_url
            })
          });
          
          if (analyzeRes.ok) {
            const result = await analyzeRes.json();
            setAnalysisData(result);
            setAnalysisStatus('complete');
            await supabase.from('uploads').update({ score_data: result }).eq('id', targetData.id);
          } else {
            throw new Error('Analysis failed');
          }
        } catch (e) {
          console.error('[ANALYSIS] Direct analysis error:', e);
          setServerError('Analysis failed. Please try again.');
          setAnalysisStatus('failed');
        }
        setLoading(false);
      }
    } catch (e) {
      console.error('[ANALYSIS] Error:', e);
      setServerError(e.message || 'Analysis failed');
      setAnalysisStatus('failed');
      setLoading(false);
    }
  }

  const submitFeedback = async () => {
    if (!feedbackSentiment) return
    const trimmedNote = feedbackNote?.trim() || ''
    if (trimmedNote.length > 1000) {
      return
    }
    const payload = { sentiment: feedbackSentiment, note: trimmedNote }
    
    setFeedbackSubmitted(true)
    const { error } = await supabase
      .from('uploads')
      .update({ user_feedback: payload })
      .eq('id', uploadId)
      
    if (error) {
      logger.error("Failed to submit telemetry feedback", error)
      setFeedbackSubmitted(false)
    }
  }

  const handleTimeUpdate = () => {
    if (videoRef.current) setVideoTime(videoRef.current.currentTime)
  }
  
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration)
    }
  }

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause()
      else videoRef.current.play()
      setIsPlaying(!isPlaying)
    }
  }

  const seekVideo = (e) => {
    if (videoRef.current && timelineRef.current) {
      const rect = timelineRef.current.getBoundingClientRect()
      const pos = (e.clientX - rect.left) / rect.width
      videoRef.current.currentTime = pos * videoDuration
    }
  }

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = Math.floor(secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const filterStyles = {
    RAW: 'none',
    THERMAL: 'sepia(100%) hue-rotate(280deg) saturate(400%) contrast(150%)',
    EDGE: 'invert(100%) grayscale(100%) contrast(300%)'
  }

  if (loading) {
    const statusMessages = {
      'initializing': { title: 'Initializing...', subtitle: 'Preparing analysis pipeline' },
      'preparing': { title: 'Connecting to NEUROX...', subtitle: 'Establishing neural link' },
      'creating': { title: 'Creating Analysis Job...', subtitle: 'Initializing TRIBE pipeline' },
      'polling': { title: 'Analyzing Content...', subtitle: `TRIBE v2 Processing (${jobProgress}%)` },
      'pending': { title: 'Job Queued...', subtitle: 'Waiting for processing' },
      'preprocessing': { title: 'Preprocessing Media...', subtitle: 'Normalizing content' },
      'ocr_extracting': { title: 'Extracting Text...', subtitle: 'OCR analysis in progress' },
      'tribe_analyzing': { title: 'TRIBE Analysis...', subtitle: 'Running neural mapping' },
      'mapping_scores': { title: 'Calculating Scores...', subtitle: 'Mapping to NEUROX metrics' },
      'completed': { title: 'Analysis Complete!', subtitle: 'Rendering results' },
      'failed': { title: 'Analysis Failed', subtitle: 'Check error details' },
    };
    
    const status = statusMessages[analysisStatus] || statusMessages['preparing'];
    
    return (
      <div className="results-loading">
        {/* Skeleton Layout Preview - shows what results will look like */}
        <div className="skeleton-preview" style={{ 
          display: 'grid', 
          gridTemplateColumns: '400px 1fr', 
          gap: '2rem',
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '2rem',
          width: '100%'
        }}>
          {/* Media Skeleton */}
          <div className="skeleton-media-section">
            <SkeletonMediaCard delay={1} />
            <div style={{ marginTop: '1rem' }}>
              <SkeletonText lines={2} delay={2} />
            </div>
          </div>
          
          {/* Score Skeleton */}
          <div className="skeleton-score-section">
            <SkeletonScoreCard size="large" delay={1} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '1rem' }}>
              <SkeletonProgressBar delay={2} />
              <SkeletonProgressBar delay={3} />
              <SkeletonProgressBar delay={4} />
              <SkeletonProgressBar delay={5} />
            </div>
            <div style={{ marginTop: '1rem' }}>
              <SkeletonText lines={3} delay={3} />
            </div>
          </div>
        </div>
        
        {/* Analysis Status Overlay */}
        <div className="analysis-status-container">
          <div className="status-indicator">
            <Activity size={16} className="status-icon pulse" />
            <span className="status-badge">{analysisStatus.replace('_', ' ').toUpperCase()}</span>
          </div>
          <h2>{status.title}</h2>
          <p>{status.subtitle}</p>
          {analysisStatus === 'polling' && jobProgress > 0 && (
            <div className="progress-indicator">
              <div className="progress-track">
                <div className="progress-fill-tribe" style={{ width: `${jobProgress}%` }} />
              </div>
              <span className="progress-text">{jobProgress}%</span>
            </div>
          )}
        </div>
        <div className="tribe-badge">
          <Radio size={12} />
          TRIBE v2 PIPELINE
        </div>
      </div>
    )
  }

  if (serverError) {
    return (
      <div className="results-error">
        <div className="error-icon">
          <AlertTriangle size={48} />
        </div>
        <h2>Edge Function Fault</h2>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {serverError.replace(/[&<>"']/g, (m) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
          }[m]))}
        </pre>
        <Link to="/dashboard" className="error-btn">Abort to Dashboard</Link>
      </div>
    )
  }

  if (!upload || !analysisData) {
    return (
      <div className="results-error">
        <h2>Target Not Found</h2>
        <Link to="/dashboard" className="error-btn">Return to Dashboard</Link>
      </div>
    )
  }

  const { globalScore, confidence, subScores, rank, fixes, bestPlatform, dropOffRisk } = analysisData
  const scoreColor = globalScore > 85 ? 'var(--color-primary)' : globalScore > 70 ? 'var(--color-warning)' : 'var(--color-danger)'
  const dropOffColor = dropOffRisk > 0.5 ? 'var(--color-danger)' : dropOffRisk > 0.3 ? 'var(--color-warning)' : 'var(--color-accent)'

  return (
    <div className="results-page">
      <div className="results-bg">
        <div className="results-grid" />
        <div className="results-glow" style={{ background: scoreColor }} />
      </div>

      <header className={`results-header ${mounted ? 'mounted' : ''}`}>
        <Link to={`/dashboard/project/${upload.project_id}`} className="back-link">
          <ChevronLeft size={20} />
          Return to Project
        </Link>
        <div className="header-meta">
          <span className="meta-label">TARGET:</span>
          <span className="meta-value">{upload.file_name}</span>
        </div>
      </header>

      <main className={`results-main ${mounted ? 'mounted' : ''}`}>
        <div className="results-grid-layout">
          {/* Left Column - Media Preview */}
          <div className="media-column">
            <div className="media-container">
              <div className="media-header">
                <span className="recording-indicator" />
                {upload.media_type === 'video' ? `VIDEO [${formatTime(videoTime)}]` : `IMAGE [${imageFilter}]`}
              </div>
              
              <div className="media-wrapper">
                {upload.media_type === 'video' ? (
                  <>
                    <video 
                      ref={videoRef}
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={handleLoadedMetadata}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      src={upload.file_url}
                      className="media-element"
                      controls
                    />
                    <div className="video-controls">
                      <button onClick={togglePlay} className="control-btn">
                        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                      </button>
                      <div className="timeline" ref={timelineRef} onClick={seekVideo}>
                        <div 
                          className="timeline-progress" 
                          style={{ width: `${(videoTime / videoDuration) * 100}%` }} 
                        />
                        <div 
                          className="timeline-handle" 
                          style={{ left: `${(videoTime / videoDuration) * 100}%` }} 
                        />
                      </div>
                      <span className="time-display">{formatTime(videoTime)} / {formatTime(videoDuration)}</span>
                    </div>
                  </>
                ) : (
                  <div className="image-wrapper">
                    <LazyImage 
                      src={upload.file_url} 
                      alt="Analyzed Target"
                      style={{ 
                        width: '100%', 
                        height: '100%',
                        filter: filterStyles[imageFilter]
                      }}
                      className="media-element"
                    />
                    <div className="image-filters">
                      {['RAW', 'THERMAL', 'EDGE'].map(mode => (
                        <button 
                          key={mode}
                          onClick={() => setImageFilter(mode)}
                          className={`filter-btn ${imageFilter === mode ? 'active' : ''}`}
                        >
                          {mode === 'THERMAL' ? <Crosshair size={14}/> : mode === 'EDGE' ? <Cpu size={14}/> : <Eye size={14}/>}
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="rank-box">
                <div className="rank-header">
                  <BoltIcon size={16} />
                  System Ranking
                </div>
                <p className="rank-text">{rank}</p>
              </div>
            </div>
          </div>

          {/* Right Column - Analysis Results */}
          <div className="analysis-column">
            {/* Main Score */}
            <div className="score-card-main" style={{ '--score-color': scoreColor }}>
              <div className="score-label">NEURO VIRALITY SCORE</div>
              <div className="score-display">
                <span className="score-number">
                  <AnimatedScore score={globalScore} color={scoreColor} />
                </span>
                <span className="score-max">/100</span>
              </div>
              <div className="confidence-badge" style={{ borderColor: confidence.color, color: confidence.color }}>
                <Target size={14} />
                {confidence.text}
              </div>
              {bestPlatform && (
                <div className="platform-recommendation">
                  <BarChart3 size={14} />
                  <span>Best: <strong>{bestPlatform}</strong></span>
                </div>
              )}
              {dropOffRisk !== undefined && (
                <div className="dropoff-risk" style={{ color: dropOffColor }}>
                  <Activity size={14} />
                  <span>Drop-off Risk: {(dropOffRisk * 100).toFixed(0)}%</span>
                </div>
              )}
            </div>

            {/* Sub-scores */}
            <div className="subscores-card">
              <h3 className="card-title">Sub-Routine Metrics</h3>
              <div className="subscores-list">
                {subScores.map((score, i) => (
                  <ProgressBar 
                    key={i}
                    label={score.name}
                    value={score.val}
                    color={score.val > 70 ? 'var(--color-primary)' : 'var(--color-warning)'}
                    delay={i * 150}
                  />
                ))}
              </div>
            </div>

            {/* Actionable Directives */}
            <div className="directives-card">
              <h3 className="card-title">
                <AlertTriangle size={18} className="warning-icon" />
                Actionable Directives
              </h3>
              <div className="directives-list">
                {fixes.map((fix, i) => (
                  <div key={i} className="directive-item" style={{ animationDelay: `${i * 0.1}s` }}>
                    <div className="directive-icon">
                      <CheckCircle size={16} />
                    </div>
                    <p>{fix}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Feedback Section */}
            <div className="feedback-card">
              {upload.user_feedback || feedbackSubmitted ? (
                <div className="feedback-submitted">
                  <CheckCircle size={32} />
                  <span>Telemetry Feedback Logged</span>
                </div>
              ) : (
                <>
                  <h4 className="feedback-title">Is this diagnostic accurate?</h4>
                  <div className="feedback-buttons">
                    <button 
                      onClick={() => setFeedbackSentiment('Accurate')}
                      className={`feedback-btn ${feedbackSentiment === 'Accurate' ? 'active positive' : ''}`}
                    >
                      <ThumbsUp size={18} />
                      Accurate
                    </button>
                    <button 
                      onClick={() => setFeedbackSentiment('Inaccurate')}
                      className={`feedback-btn ${feedbackSentiment === 'Inaccurate' ? 'active negative' : ''}`}
                    >
                      <ThumbsDown size={18} />
                      Inaccurate
                    </button>
                  </div>
                  
                   {feedbackSentiment && (
                    <div className="feedback-form">
                      <input 
                        type="text" 
                        placeholder={`Explain why it is ${feedbackSentiment.toLowerCase()}...`}
                        value={feedbackNote}
                        onChange={e => setFeedbackNote(e.target.value)}
                        className="feedback-input"
                        maxLength={1000}
                      />
                      <button onClick={submitFeedback} className="submit-btn">
                        <Send size={18} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div className="action-buttons">
              <div className="share-dropdown-container">
                <button 
                  className="action-btn secondary"
                  onClick={() => setShowShareMenu(!showShareMenu)}
                >
                  <Share2 size={18} />
                  Share Results
                  <ChevronDown size={14} />
                </button>
                {showShareMenu && (
                  <div className="share-dropdown">
                    <button 
                      className="share-option"
                      onClick={() => {
                        shareToTwitter({
                          score: globalScore,
                          fileName: upload.file_name,
                          bestPlatform
                        })
                        setShowShareMenu(false)
                      }}
                    >
                      <Globe size={16} />
                      Share on X
                    </button>
                    <button 
                      className="share-option"
                      onClick={() => {
                        shareToTelegram({
                          score: globalScore,
                          fileName: upload.file_name,
                          bestPlatform
                        })
                        setShowShareMenu(false)
                      }}
                    >
                      <MessageCircle size={16} />
                      Share on Telegram
                    </button>
                    <button 
                      className="share-option"
                      onClick={async () => {
                        await generateShareableImage({
                          score: globalScore,
                          fileName: upload.file_name,
                          bestPlatform,
                          confidence: confidence.text
                        })
                        setShowShareMenu(false)
                      }}
                    >
                      <Image size={16} />
                      Download as Image
                    </button>
                  </div>
                )}
              </div>
              <button 
                className="action-btn secondary"
                onClick={() => exportToJSON({
                  analysis: {
                    globalScore,
                    confidence,
                    subScores,
                    rank,
                    fixes,
                    bestPlatform,
                    dropOffRisk
                  },
                  media: {
                    fileName: upload.file_name,
                    mediaType: upload.media_type,
                    fileSize: upload.file_size,
                    url: upload.file_url
                  }
                }, `neurox-${upload.file_name}`)}
              >
                <Download size={18} />
                Export Report
              </button>
            </div>
          </div>
        </div>
      </main>

      <style>{`
        .results-page {
          min-height: 100vh;
          position: relative;
          padding-top: 80px;
        }

        .results-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
        }

        .results-grid {
          position: absolute;
          inset: 0;
          background-image: 
            linear-gradient(rgba(255, 111, 55, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 111, 55, 0.02) 1px, transparent 1px);
          background-size: 40px 40px;
        }

        .results-glow {
          position: absolute;
          top: 0;
          right: 0;
          width: 600px;
          height: 600px;
          filter: blur(150px);
          opacity: 0.1;
          transition: background 1s ease;
        }

        .results-header {
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

        .results-header.mounted {
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

        .header-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-mono);
          font-size: 0.85rem;
        }

        .meta-label {
          color: var(--color-text-dim);
        }

        .meta-value {
          color: var(--color-text);
          max-width: 200px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .results-main {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
          position: relative;
          z-index: 5;
          opacity: 0;
          transform: translateY(20px);
          transition: all 0.6s ease 0.2s;
        }

        .results-main.mounted {
          opacity: 1;
          transform: translateY(0);
        }

        .results-grid-layout {
          display: grid;
          grid-template-columns: 400px 1fr;
          gap: 2rem;
        }

        /* Media Column */
        .media-column {
          height: fit-content;
        }

        .media-container {
          background: linear-gradient(135deg, rgba(25, 15, 40, 0.8) 0%, rgba(15, 8, 25, 0.9) 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          overflow: hidden;
        }

        .media-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 1rem 1.25rem;
          background: rgba(0, 0, 0, 0.4);
          font-family: var(--font-mono);
          font-size: 0.8rem;
          color: var(--color-primary);
          letter-spacing: 1px;
        }

        .recording-indicator {
          width: 10px;
          height: 10px;
          background: var(--color-danger);
          border-radius: 50%;
          animation: blink 1s ease infinite;
          box-shadow: 0 0 10px var(--color-danger);
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        .media-wrapper {
          position: relative;
        }

        .media-element {
          width: 100%;
          display: block;
          aspect-ratio: 16/10;
          object-fit: cover;
        }

        .video-controls {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 1rem;
          background: linear-gradient(to top, rgba(0,0,0,0.9), transparent);
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .control-btn {
          width: 36px;
          height: 36px;
          background: var(--color-primary);
          border: none;
          border-radius: 50%;
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: var(--transition);
        }

        .control-btn:hover {
          transform: scale(1.1);
        }

        .timeline {
          flex: 1;
          height: 6px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
          cursor: pointer;
          position: relative;
        }

        .timeline-progress {
          height: 100%;
          background: var(--color-primary);
          border-radius: 3px;
          transition: width 0.1s linear;
        }

        .timeline-handle {
          position: absolute;
          top: 50%;
          width: 12px;
          height: 12px;
          background: white;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          opacity: 0;
          transition: opacity 0.2s;
        }

        .timeline:hover .timeline-handle {
          opacity: 1;
        }

        .time-display {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--color-text);
          white-space: nowrap;
        }

        .image-wrapper {
          position: relative;
        }

        .image-filters {
          position: absolute;
          bottom: 1rem;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 8px;
          background: rgba(0, 0, 0, 0.8);
          padding: 8px;
          border-radius: 100px;
        }

        .filter-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          background: transparent;
          border: none;
          border-radius: 100px;
          color: var(--color-text-muted);
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition);
        }

        .filter-btn:hover {
          color: var(--color-text);
        }

        .filter-btn.active {
          background: var(--color-primary);
          color: white;
        }

        .rank-box {
          padding: 1.25rem;
          background: rgba(252, 25, 53, 0.05);
          border-top: 1px solid rgba(252, 25, 53, 0.2);
        }

        .rank-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-mono);
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--color-danger);
          margin-bottom: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .rank-text {
          color: var(--color-text);
          font-size: 0.95rem;
          line-height: 1.5;
        }

        /* Analysis Column */
        .analysis-column {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .score-card-main {
          text-align: center;
          padding: 2.5rem;
          background: linear-gradient(135deg, rgba(25, 15, 40, 0.8) 0%, rgba(15, 8, 25, 0.9) 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          border-top: 4px solid var(--score-color);
        }

        .score-label {
          font-family: var(--font-mono);
          font-size: 0.85rem;
          color: var(--color-text-muted);
          letter-spacing: 3px;
          margin-bottom: 1rem;
        }

        .score-display {
          display: flex;
          align-items: baseline;
          justify-content: center;
          gap: 8px;
          margin-bottom: 1.5rem;
        }

        .score-number {
          font-size: 6rem;
          font-weight: 900;
          line-height: 1;
        }

        .score-max {
          font-size: 2rem;
          color: var(--color-text-dim);
          font-weight: 500;
        }

        .confidence-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 20px;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid;
          border-radius: 100px;
          font-size: 0.85rem;
          font-weight: 700;
          letter-spacing: 1px;
        }

        .subscores-card,
        .directives-card,
        .feedback-card {
          padding: 1.5rem;
          background: linear-gradient(135deg, rgba(25, 15, 40, 0.6) 0%, rgba(15, 8, 25, 0.8) 100%);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
        }

        .card-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 1rem;
          font-weight: 700;
          margin-bottom: 1.25rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .warning-icon {
          color: var(--color-warning);
        }

        .subscores-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .result-progress {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .progress-header {
          display: flex;
          justify-content: space-between;
          font-size: 0.85rem;
        }

        .progress-label {
          color: var(--color-text);
          text-transform: uppercase;
          letter-spacing: 1px;
          font-weight: 500;
        }

        .progress-value {
          font-family: var(--font-mono);
          font-weight: 700;
        }

        .progress-track {
          height: 8px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .directives-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .directive-item {
          display: flex;
          gap: 12px;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 10px;
          animation: fadeIn 0.5s ease forwards;
          opacity: 0;
        }

        @keyframes fadeIn {
          to { opacity: 1; }
        }

        .directive-icon {
          color: var(--color-primary);
          flex-shrink: 0;
          margin-top: 2px;
        }

        .directive-item p {
          color: var(--color-text);
          font-size: 0.9rem;
          line-height: 1.6;
        }

        .feedback-title {
          font-size: 0.9rem;
          color: var(--color-text-muted);
          margin-bottom: 1rem;
        }

        .feedback-buttons {
          display: flex;
          gap: 12px;
          margin-bottom: 1rem;
        }

        .feedback-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 1rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: var(--color-text-muted);
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition);
        }

        .feedback-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: var(--color-text);
        }

        .feedback-btn.active.positive {
          background: rgba(0, 212, 170, 0.2);
          border-color: var(--color-accent);
          color: var(--color-accent);
        }

        .feedback-btn.active.negative {
          background: rgba(252, 25, 53, 0.2);
          border-color: var(--color-danger);
          color: var(--color-danger);
        }

        .feedback-form {
          display: flex;
          gap: 10px;
        }

        .feedback-input {
          flex: 1;
          padding: 0.875rem 1rem;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          color: var(--color-text);
          font-size: 0.9rem;
          outline: none;
          transition: var(--transition);
        }

        .feedback-input:focus {
          border-color: var(--color-primary);
        }

        .submit-btn {
          width: 48px;
          height: 48px;
          background: var(--color-primary);
          border: none;
          border-radius: 10px;
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: var(--transition);
        }

        .submit-btn:hover {
          background: var(--color-secondary);
          transform: scale(1.05);
        }

        .feedback-submitted {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 2rem;
          color: var(--color-accent);
          font-weight: 600;
        }

        .action-buttons {
          display: flex;
          gap: 12px;
        }

        .action-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 1rem;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: var(--color-text-muted);
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition);
        }

        .action-btn:hover {
          border-color: var(--color-primary);
          color: var(--color-primary);
          background: var(--color-primary-soft);
        }

        .share-dropdown-container {
          position: relative;
          flex: 1;
        }

        .share-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          margin-top: 8px;
          background: linear-gradient(135deg, rgba(25, 15, 40, 0.95) 0%, rgba(15, 8, 25, 0.98) 100%);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 8px;
          z-index: 50;
          animation: dropdownSlide 0.2s ease;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        }

        @keyframes dropdownSlide {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .share-option {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 14px;
          background: transparent;
          border: none;
          border-radius: 8px;
          color: var(--color-text-muted);
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: var(--transition);
        }

        .share-option:hover {
          background: rgba(255, 111, 55, 0.15);
          color: var(--color-primary);
        }

        /* Loading & Error States */
        .results-loading,
        .results-error {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 2rem;
          position: relative;
          z-index: 10;
        }

        .loading-animation {
          position: relative;
          width: 120px;
          height: 120px;
          margin-bottom: 2rem;
        }

        .loading-ring {
          position: absolute;
          inset: 0;
          border: 2px solid transparent;
          border-top-color: var(--color-primary);
          border-radius: 50%;
          animation: spin 1.5s linear infinite;
        }

        .loading-ring:nth-child(2) {
          inset: 10px;
          animation-delay: 0.1s;
          border-top-color: var(--color-secondary);
        }

        .loading-ring:nth-child(3) {
          inset: 20px;
          animation-delay: 0.2s;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .loading-icon {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: var(--color-primary);
          animation: pulse 2s ease infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(0.9); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }

        .results-loading h2 {
          font-size: 1.5rem;
          margin-bottom: 0.5rem;
        }

        .results-loading p {
          color: var(--color-text-muted);
        }

        /* Skeleton Preview Layout */
        .skeleton-preview {
          animation: fadeIn 0.3s ease;
        }

        .skeleton-media-section {
          display: flex;
          flex-direction: column;
        }

        .skeleton-score-section {
          display: flex;
          flex-direction: column;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 1024px) {
          .skeleton-preview {
            grid-template-columns: 1fr !important;
          }
        }

        .error-icon {
          width: 100px;
          height: 100px;
          background: rgba(252, 25, 53, 0.1);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-danger);
          margin-bottom: 2rem;
        }

        .results-error h2 {
          font-size: 1.5rem;
          margin-bottom: 1rem;
          color: var(--color-danger);
        }

        .results-error pre {
          max-width: 600px;
          padding: 1.5rem;
          background: rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(252, 25, 53, 0.2);
          border-radius: 10px;
          font-family: var(--font-mono);
          font-size: 0.85rem;
          color: var(--color-danger);
          white-space: pre-wrap;
          margin-bottom: 2rem;
        }

        .error-btn {
          padding: 1rem 2rem;
          background: transparent;
          border: 1px solid var(--color-primary);
          border-radius: 10px;
          color: var(--color-primary);
          text-decoration: none;
          font-weight: 600;
          transition: var(--transition);
        }

        .error-btn:hover {
          background: var(--color-primary);
          color: white;
        }

        @media (max-width: 1000px) {
          .results-grid-layout {
            grid-template-columns: 1fr;
          }
          .media-column {
            order: -1;
          }
        }

        @media (max-width: 600px) {
          .results-main {
            padding: 1rem;
          }
          .score-number {
            font-size: 4rem;
          }
          .score-max {
            font-size: 1.5rem;
          }
        }

        /* TRIBE Analysis Status Styles */
        .analysis-status-container {
          margin-top: 1.5rem;
        }

        .status-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 1rem;
        }

        .status-icon {
          color: var(--color-primary);
        }

        .status-icon.pulse {
          animation: statusPulse 1s ease infinite;
        }

        @keyframes statusPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }

        .status-badge {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          padding: 4px 12px;
          background: var(--color-primary-soft);
          color: var(--color-primary);
          border-radius: 100px;
          letter-spacing: 1px;
        }

        .progress-indicator {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 1.5rem;
          width: 300px;
        }

        .progress-indicator .progress-track {
          flex: 1;
          height: 8px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          overflow: hidden;
        }

        .progress-fill-tribe {
          height: 100%;
          background: linear-gradient(90deg, var(--color-primary), var(--color-secondary));
          border-radius: 4px;
          transition: width 0.3s ease;
          box-shadow: 0 0 10px var(--color-primary);
        }

        .progress-text {
          font-family: var(--font-mono);
          font-size: 0.85rem;
          color: var(--color-primary);
          min-width: 45px;
        }

        .tribe-badge {
          position: absolute;
          bottom: 2rem;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          background: rgba(139, 92, 246, 0.1);
          border: 1px solid rgba(139, 92, 246, 0.3);
          border-radius: 100px;
          color: #8b5cf6;
          font-family: var(--font-mono);
          font-size: 0.7rem;
          letter-spacing: 1px;
        }

        /* Platform Recommendation */
        .platform-recommendation {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 1rem;
          padding: 8px 16px;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.2);
          border-radius: 8px;
          color: var(--color-accent);
          font-size: 0.85rem;
        }

        .platform-recommendation strong {
          color: var(--color-accent);
        }

        .dropoff-risk {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 0.5rem;
          padding: 6px 12px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 6px;
          font-size: 0.8rem;
          font-family: var(--font-mono);
        }
      `}</style>
    </div>
  )
}
