import React, { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Film, FileImageIcon, Trash2, Play, AlertCircle } from 'lucide-react'
import LazyImage from './LazyImage'
import BoltIcon from './BoltIcon'

export default function MediaCard({ 
  upload, 
  onDelete, 
  onAnalyze,
  isDeleting = false 
}) {
  const [hovered, setHovered] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const videoRef = useRef(null)

  const isVideo = upload.media_type === 'video'
  const hasError = isVideo ? false : imageError

  useEffect(() => {
    if (isVideo && videoRef.current && hovered) {
      videoRef.current.play().catch(() => {})
    } else if (isVideo && videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    }
  }, [hovered, isVideo])

  const handleDeleteClick = (e) => {
    e.stopPropagation()
    setShowDeleteConfirm(true)
  }

  const confirmDelete = () => {
    onDelete(upload)
    setShowDeleteConfirm(false)
  }

  const cancelDelete = () => {
    setShowDeleteConfirm(false)
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div 
      className={`media-card ${hovered ? 'hovered' : ''} ${hasError ? 'has-error' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="media-preview">
        {isVideo ? (
          <>
            <video
              ref={videoRef}
              src={upload.file_url}
              muted
              loop
              playsInline
              preload="metadata"
              className="media-video"
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
            />
            <div className="media-video-overlay">
              <div className="play-button">
                <Play size={24} fill="white" />
              </div>
            </div>
          </>
        ) : (
          <LazyImage
            src={upload.file_url}
            alt={upload.file_name}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
            fallbackSrc={null}
          />
        )}

        {hasError && (
          <div className="media-error">
            <AlertCircle size={24} />
            <span>Failed to load</span>
          </div>
        )}

        <div className={`media-overlay ${hovered ? 'visible' : ''}`}>
          <Link 
            to={`/dashboard/analysis/${upload.id}`} 
            className="media-action analyze"
            onClick={(e) => hovered && onAnalyze && onAnalyze(upload)}
          >
            <BoltIcon size={18} />
            <span>Analyze</span>
          </Link>
          <button 
            className="media-action delete"
            onClick={handleDeleteClick}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <div className="spinner" />
            ) : (
              <Trash2 size={18} />
            )}
          </button>
        </div>

        <div className="media-type-badge">
          {isVideo ? <Film size={12} /> : <FileImageIcon size={12} />}
        </div>

        {upload.admin_feedback && (
          <div className="media-feedback-badge" title={upload.admin_feedback}>
            <span>Feedback</span>
          </div>
        )}
      </div>

      <div className="media-info">
        <span className="media-name" title={upload.file_name}>
          {upload.file_name}
        </span>
        <span className="media-size">{formatFileSize(upload.file_size)}</span>
      </div>

      {showDeleteConfirm && (
        <div className="delete-confirm-overlay" onClick={cancelDelete}>
          <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <AlertCircle size={24} className="warning-icon" />
            <p>Delete this file?</p>
            <div className="delete-confirm-actions">
              <button className="cancel-btn" onClick={cancelDelete}>Cancel</button>
              <button className="confirm-btn" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .media-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          overflow: hidden;
          transition: all 0.3s ease;
        }

        .media-card:hover,
        .media-card.hovered {
          border-color: rgba(255, 111, 55, 0.3);
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
        }

        .media-card.has-error {
          border-color: rgba(252, 25, 53, 0.3);
        }

        .media-preview {
          position: relative;
          aspect-ratio: 1;
          background: rgba(0, 0, 0, 0.3);
          overflow: hidden;
        }

        .media-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .media-video-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.3);
          opacity: 0;
          transition: opacity 0.2s ease;
        }

        .media-card:hover .media-video-overlay {
          opacity: 1;
        }

        .play-button {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: rgba(255, 111, 55, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .media-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            to top,
            rgba(0, 0, 0, 0.8) 0%,
            rgba(0, 0, 0, 0.4) 50%,
            transparent 100%
          );
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 8px;
          padding: 12px;
          opacity: 0;
          transition: opacity 0.2s ease;
        }

        .media-overlay.visible {
          opacity: 1;
        }

        .media-action {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 8px 16px;
          border: none;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          text-decoration: none;
        }

        .media-action.analyze {
          background: linear-gradient(135deg, #ff6f37, #ff8f5a);
          color: white;
        }

        .media-action.analyze:hover {
          transform: scale(1.05);
          box-shadow: 0 4px 15px rgba(255, 111, 55, 0.4);
        }

        .media-action.delete {
          background: rgba(252, 25, 53, 0.8);
          color: white;
          padding: 8px;
        }

        .media-action.delete:hover {
          background: #fc1935;
        }

        .media-action:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .media-type-badge {
          position: absolute;
          top: 8px;
          left: 8px;
          padding: 4px 8px;
          background: rgba(0, 0, 0, 0.6);
          border-radius: 6px;
          color: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(4px);
        }

        .media-feedback-badge {
          position: absolute;
          top: 8px;
          right: 8px;
          padding: 4px 8px;
          background: rgba(0, 212, 170, 0.8);
          border-radius: 6px;
          color: white;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .media-error {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: rgba(252, 25, 53, 0.1);
          color: #fc1935;
        }

        .media-info {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .media-name {
          font-size: 0.85rem;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.9);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .media-size {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.5);
        }

        .delete-confirm-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .delete-confirm-modal {
          background: linear-gradient(135deg, rgba(25, 15, 40, 0.98), rgba(15, 8, 25, 0.99));
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 24px;
          text-align: center;
          max-width: 300px;
        }

        .delete-confirm-modal .warning-icon {
          color: #f59e0b;
          margin-bottom: 12px;
        }

        .delete-confirm-modal p {
          color: white;
          margin: 0 0 20px 0;
          font-size: 1rem;
        }

        .delete-confirm-actions {
          display: flex;
          gap: 12px;
        }

        .delete-confirm-actions button {
          flex: 1;
          padding: 10px 16px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .cancel-btn {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: rgba(255, 255, 255, 0.8);
        }

        .cancel-btn:hover {
          background: rgba(255, 255, 255, 0.15);
        }

        .confirm-btn {
          background: #fc1935;
          border: none;
          color: white;
        }

        .confirm-btn:hover {
          background: #d4143e;
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  )
}
