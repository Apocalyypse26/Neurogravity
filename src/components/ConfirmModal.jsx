import React, { useState } from 'react'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'

export default function ConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger',
  loading = false
}) {
  if (!isOpen) return null

  const handleConfirm = async () => {
    try {
      await onConfirm()
      onClose()
    } catch (error) {
      console.error('Confirm action failed:', error)
    }
  }

  const typeConfig = {
    danger: {
      icon: <Trash2 size={24} />,
      iconBg: 'rgba(252, 25, 53, 0.1)',
      iconColor: '#fc1935',
      buttonBg: 'linear-gradient(135deg, #fc1935, #d4143e)',
      buttonHover: 'linear-gradient(135deg, #d4143e, #b30d34)',
    },
    warning: {
      icon: <AlertTriangle size={24} />,
      iconBg: 'rgba(245, 158, 11, 0.1)',
      iconColor: '#f59e0b',
      buttonBg: 'linear-gradient(135deg, #f59e0b, #d97706)',
      buttonHover: 'linear-gradient(135deg, #d97706, #b45309)',
    },
  }

  const config = typeConfig[type] || typeConfig.danger

  return (
    <div className="confirm-modal-overlay" onClick={onClose}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-icon-wrapper" style={{ background: config.iconBg }}>
          <div style={{ color: config.iconColor }}>{config.icon}</div>
        </div>
        
        <h3 className="confirm-title">{title}</h3>
        <p className="confirm-message">{message}</p>
        
        <div className="confirm-actions">
          <button 
            className="confirm-cancel" 
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </button>
          <button 
            className="confirm-proceed"
            onClick={handleConfirm}
            disabled={loading}
            style={{ 
              background: loading ? 'rgba(255,255,255,0.1)' : config.buttonBg,
            }}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spin" />
                Processing...
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>

      <style>{`
        .confirm-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 1rem;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .confirm-modal {
          background: linear-gradient(135deg, rgba(25, 15, 40, 0.98) 0%, rgba(15, 8, 25, 0.99) 100%);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 2rem;
          text-align: center;
          max-width: 400px;
          width: 100%;
          animation: slideUp 0.3s ease;
          box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
        }

        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to { 
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .confirm-icon-wrapper {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1.5rem;
        }

        .confirm-title {
          font-size: 1.25rem;
          font-weight: 700;
          color: #fff;
          margin-bottom: 0.75rem;
        }

        .confirm-message {
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.95rem;
          line-height: 1.5;
          margin-bottom: 2rem;
        }

        .confirm-actions {
          display: flex;
          gap: 12px;
        }

        .confirm-cancel {
          flex: 1;
          padding: 0.875rem 1.5rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .confirm-cancel:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .confirm-cancel:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .confirm-proceed {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0.875rem 1.5rem;
          border: none;
          border-radius: 10px;
          color: #fff;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        }

        .confirm-proceed:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4);
        }

        .confirm-proceed:disabled {
          cursor: not-allowed;
          transform: none;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 600px) {
          .confirm-modal {
            padding: 1.5rem;
          }

          .confirm-actions {
            flex-direction: column-reverse;
          }
        }
      `}</style>
    </div>
  )
}
