import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info, Loader2 } from 'lucide-react'

const ToastContext = createContext(null)

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}

const toastIcons = {
  success: <CheckCircle size={20} />,
  error: <AlertCircle size={20} />,
  warning: <AlertTriangle size={20} />,
  info: <Info size={20} />,
  loading: <Loader2 size={20} className="spin" />,
}

const toastColors = {
  success: { bg: 'rgba(0, 212, 170, 0.1)', border: 'rgba(0, 212, 170, 0.3)', color: '#00d4aa' },
  error: { bg: 'rgba(252, 25, 53, 0.1)', border: 'rgba(252, 25, 53, 0.3)', color: '#fc1935' },
  warning: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', color: '#f59e0b' },
  info: { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.3)', color: '#3b82f6' },
  loading: { bg: 'rgba(255, 111, 55, 0.1)', border: 'rgba(255, 111, 55, 0.3)', color: '#ff6f37' },
}

let toastId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastId
    
    setToasts(prev => [...prev, { id, message, type, duration }])

    if (type !== 'loading' && duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }

    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  const updateToast = useCallback((id, updates) => {
    setToasts(prev => prev.map(toast => 
      toast.id === id ? { ...toast, ...updates } : toast
    ))
  }, [])

  useEffect(() => {
    const handleToastEvent = (event) => {
      const { message, type } = event.detail
      addToast(message, type)
    }
    
    window.addEventListener('toast', handleToastEvent)
    return () => window.removeEventListener('toast', handleToastEvent)
  }, [addToast])

  const toast = {
    success: (message, duration) => addToast(message, 'success', duration),
    error: (message, duration) => addToast(message, 'error', duration),
    warning: (message, duration) => addToast(message, 'warning', duration),
    info: (message, duration) => addToast(message, 'info', duration),
    loading: (message) => addToast(message, 'loading', 0),
    dismiss: removeToast,
    update: updateToast,
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  )
}

function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
      <style>{`
        .toast-container {
          position: fixed;
          top: 90px;
          right: 20px;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-width: 400px;
          pointer-events: none;
        }

        @media (max-width: 600px) {
          .toast-container {
            left: 20px;
            right: 20px;
            max-width: none;
          }
        }
      `}</style>
    </div>
  )
}

function Toast({ toast, onDismiss }) {
  const colors = toastColors[toast.type] || toastColors.info

  return (
    <div 
      className="toast-item"
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.color,
        '--toast-color': colors.color,
      }}
    >
      <div className="toast-icon">{toastIcons[toast.type]}</div>
      <div className="toast-message">{toast.message}</div>
      {toast.type !== 'loading' && (
        <button className="toast-dismiss" onClick={onDismiss}>
          <X size={16} />
        </button>
      )}
      <style>{`
        .toast-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 12px;
          backdrop-filter: blur(20px);
          animation: toastSlideIn 0.3s ease;
          pointer-events: auto;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
        }

        @keyframes toastSlideIn {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .toast-icon {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .toast-message {
          flex: 1;
          font-size: 0.9rem;
          font-weight: 500;
          line-height: 1.4;
        }

        .toast-dismiss {
          flex-shrink: 0;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          border-radius: 6px;
          color: var(--toast-color);
          opacity: 0.7;
          cursor: pointer;
          transition: opacity 0.2s, background 0.2s;
        }

        .toast-dismiss:hover {
          opacity: 1;
          background: rgba(255, 255, 255, 0.1);
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default ToastProvider
