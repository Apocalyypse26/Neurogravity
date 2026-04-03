import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Navigate, useNavigate } from 'react-router-dom'
import { Mail, Shield, Zap, ArrowLeft, Loader2 } from 'lucide-react'

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
)

const AnimatedInput = ({ type, placeholder, value, onChange, required }) => {
  const [focused, setFocused] = useState(false)
  
  return (
    <div className="auth-input-wrapper" data-focused={focused}>
      <input 
        type={type} 
        placeholder=" " 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="auth-input"
      />
      <label className="auth-label">{placeholder}</label>
      <div className="input-glow" />
    </div>
  )
}

export default function AuthPage({ session }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [mounted, setMounted] = useState(false)
  
  const navigate = useNavigate()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (session) {
    return <Navigate to="/dashboard" replace />
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    setError(false)
    
    const redirectUrl = import.meta.env.VITE_SUPABASE_REDIRECT_URL || window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl + '/dashboard' }
    })

    if (error) {
      setError(true)
      // Make rate limit error human-readable
      if (error.message?.toLowerCase().includes('rate limit') || error.status === 429) {
        setMessage('Email rate limit reached. Please wait a few minutes and try again, or use Google login below.')
      } else if (error.message?.toLowerCase().includes('sending')) {
        setMessage('Email delivery failed. Please try Google login instead, or contact support.')
      } else {
        setMessage(error.message)
      }
    } else {
      setMessage('Secure uplink established. Check your email for the access link.')
    }
    setLoading(false)
  }

  const handleGoogleLogin = async () => {
    setGoogleLoading(true)
    setMessage('')
    setError(false)
    const redirectUrl = import.meta.env.VITE_SUPABASE_REDIRECT_URL || window.location.origin
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl + '/dashboard',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        }
      }
    })
    if (error) {
      setError(true)
      setMessage(error.message)
      setGoogleLoading(false)
    }
    // On success, Supabase redirects automatically — no need to setLoading(false)
  }

  return (
    <div className="auth-page">
      <div className="auth-background">
        <div className="auth-grid" />
        <div className="auth-glow auth-glow-1" />
        <div className="auth-glow auth-glow-2" />
      </div>
      
      <button onClick={() => navigate('/')} className="auth-back">
        <ArrowLeft size={18} />
        Return to Base
      </button>

      <div className={`auth-container ${mounted ? 'mounted' : ''}`}>
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-icon">
              <Shield size={28} />
            </div>
            <h1 className="auth-title">Terminal Access</h1>
            <p className="auth-subtitle">Enter your credentials to initialize the neuro-link</p>
          </div>
          
          <form onSubmit={handleLogin} className="auth-form">
            <div className="input-group">
              <div className="input-icon">
                <Mail size={18} />
              </div>
              <AnimatedInput
                type="email"
                placeholder="operative@domain.com"
                value={email}
                onChange={setEmail}
                required
              />
            </div>
            
            <button 
              type="submit"
              disabled={loading || googleLoading}
              className="auth-button"
            >
              {loading ? (
                <>
                  <Loader2 size={20} className="spin" />
                  Establishing Connection...
                </>
              ) : (
                <>
                  <Zap size={20} />
                  Transmit Magic Link
                </>
              )}
            </button>
          </form>

          <div className="auth-divider">
            <span className="auth-divider-line" />
            <span className="auth-divider-text">or continue with</span>
            <span className="auth-divider-line" />
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading || loading}
            className="google-button"
          >
            {googleLoading ? (
              <>
                <Loader2 size={20} className="spin" />
                Connecting to Google...
              </>
            ) : (
              <>
                <GoogleIcon />
                Continue with Google
              </>
            )}
          </button>

          {message && (
            <div className={`auth-message ${error ? 'error' : 'success'}`}>
              <div className="message-icon">
                {error ? '!' : '✓'}
              </div>
              <p>{message}</p>
            </div>
          )}

          <div className="auth-footer">
            <div className="security-badge">
              <Shield size={14} />
              <span>End-to-end encrypted transmission</span>
            </div>
          </div>
        </div>

        <div className="auth-decoration">
          <div className="decoration-ring ring-1" />
          <div className="decoration-ring ring-2" />
          <div className="decoration-ring ring-3" />
        </div>
      </div>

      <style>{`
        .auth-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          background: #050010;
        }

        .auth-background {
          position: absolute;
          inset: 0;
          z-index: 0;
        }

        .auth-grid {
          position: absolute;
          inset: 0;
          background-image: 
            linear-gradient(rgba(255, 111, 55, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 111, 55, 0.03) 1px, transparent 1px);
          background-size: 60px 60px;
          animation: gridPulse 4s ease-in-out infinite;
        }

        @keyframes gridPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }

        .auth-glow {
          position: absolute;
          width: 600px;
          height: 600px;
          border-radius: 50%;
          filter: blur(100px);
          opacity: 0.15;
        }

        .auth-glow-1 {
          top: -200px;
          right: -200px;
          background: #FF6F37;
          animation: glowFloat 8s ease-in-out infinite;
        }

        .auth-glow-2 {
          bottom: -200px;
          left: -200px;
          background: #FF2A55;
          animation: glowFloat 8s ease-in-out infinite reverse;
        }

        @keyframes glowFloat {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(30px, 30px); }
        }

        .auth-back {
          position: absolute;
          top: 2rem;
          left: 2rem;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0.75rem 1.25rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 100px;
          color: var(--color-text-muted);
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: var(--transition);
          z-index: 10;
        }

        .auth-back:hover {
          background: rgba(255, 255, 255, 0.1);
          color: var(--color-text);
          border-color: rgba(255, 111, 55, 0.3);
        }

        .auth-container {
          position: relative;
          z-index: 5;
          opacity: 0;
          transform: translateY(30px) scale(0.95);
          transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .auth-container.mounted {
          opacity: 1;
          transform: translateY(0) scale(1);
        }

        .auth-card {
          width: 100%;
          max-width: 440px;
          padding: 3rem;
          background: linear-gradient(135deg, rgba(25, 15, 40, 0.9) 0%, rgba(15, 8, 25, 0.95) 100%);
          backdrop-filter: blur(30px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          box-shadow: 
            0 25px 80px rgba(0, 0, 0, 0.8),
            0 0 60px rgba(255, 111, 55, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        .auth-header {
          text-align: center;
          margin-bottom: 2.5rem;
        }

        .auth-icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 1.5rem;
          background: linear-gradient(135deg, var(--color-primary-soft), transparent);
          border: 1px solid rgba(255, 111, 55, 0.2);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-primary);
          box-shadow: 0 0 30px var(--color-primary-soft);
        }

        .auth-title {
          font-size: 1.75rem;
          font-weight: 800;
          margin-bottom: 0.5rem;
          background: linear-gradient(135deg, #fff, var(--color-primary));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .auth-subtitle {
          font-size: 0.9rem;
          color: var(--color-text-muted);
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .input-group {
          position: relative;
        }

        .input-icon {
          position: absolute;
          left: 1.25rem;
          top: 50%;
          transform: translateY(-50%);
          color: var(--color-text-dim);
          z-index: 2;
          transition: var(--transition);
        }

        .input-group:has([data-focused="true"]) .input-icon {
          color: var(--color-primary);
        }

        .auth-input-wrapper {
          position: relative;
        }

        .auth-input {
          width: 100%;
          padding: 1.25rem 1.25rem 1.25rem 3.5rem;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          color: var(--color-text);
          font-size: 1rem;
          font-family: var(--font-heading);
          transition: var(--transition);
          outline: none;
        }

        .auth-input:focus {
          border-color: var(--color-primary);
          background: rgba(255, 111, 55, 0.05);
          box-shadow: 0 0 20px rgba(255, 111, 55, 0.15);
        }

        .auth-label {
          position: absolute;
          left: 3.5rem;
          top: 50%;
          transform: translateY(-50%);
          color: var(--color-text-dim);
          font-size: 0.95rem;
          pointer-events: none;
          transition: var(--transition);
        }

        .auth-input:not(:placeholder-shown) + .auth-label,
        .auth-input:focus + .auth-label {
          top: 0;
          left: 1.25rem;
          transform: translateY(-50%);
          font-size: 0.75rem;
          padding: 0 0.5rem;
          background: var(--color-bg);
          color: var(--color-primary);
        }

        .input-glow {
          position: absolute;
          bottom: 0;
          left: 50%;
          width: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, var(--color-primary), transparent);
          transition: var(--transition);
          transform: translateX(-50%);
          border-radius: 2px;
        }

        .auth-input-wrapper[data-focused="true"] .input-glow {
          width: 80%;
        }

        .auth-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 1.125rem 2rem;
          background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 1rem;
          font-weight: 700;
          font-family: var(--font-heading);
          letter-spacing: 0.5px;
          cursor: pointer;
          transition: var(--transition-bounce);
          box-shadow: 0 8px 30px var(--color-primary-glow);
        }

        .auth-button:hover:not(:disabled) {
          transform: translateY(-3px);
          box-shadow: 0 15px 50px var(--color-primary-glow);
        }

        .auth-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        .auth-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 1.5rem 0 0;
        }

        .auth-divider-line {
          flex: 1;
          height: 1px;
          background: rgba(255, 255, 255, 0.07);
        }

        .auth-divider-text {
          font-size: 0.75rem;
          color: var(--color-text-dim);
          white-space: nowrap;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .google-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          padding: 1rem 2rem;
          margin-top: 0.75rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: var(--color-text);
          font-size: 1rem;
          font-weight: 600;
          font-family: var(--font-heading);
          letter-spacing: 0.3px;
          cursor: pointer;
          transition: var(--transition);
          backdrop-filter: blur(10px);
        }

        .google-button:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4);
        }

        .google-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .auth-message {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 1rem;
          margin-top: 1.5rem;
          border-radius: 12px;
          font-size: 0.9rem;
          animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .auth-message.success {
          background: rgba(0, 212, 170, 0.1);
          border: 1px solid rgba(0, 212, 170, 0.2);
          color: var(--color-accent);
        }

        .auth-message.error {
          background: rgba(252, 25, 53, 0.1);
          border: 1px solid rgba(252, 25, 53, 0.2);
          color: var(--color-danger);
        }

        .message-icon {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.8rem;
          flex-shrink: 0;
        }

        .auth-message.success .message-icon {
          background: rgba(0, 212, 170, 0.2);
        }

        .auth-message.error .message-icon {
          background: rgba(252, 25, 53, 0.2);
        }

        .auth-footer {
          margin-top: 2rem;
          padding-top: 1.5rem;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .security-badge {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 0.8rem;
          color: var(--color-text-dim);
        }

        .auth-decoration {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 600px;
          height: 600px;
          pointer-events: none;
        }

        .decoration-ring {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          border: 1px solid rgba(255, 111, 55, 0.05);
          border-radius: 50%;
          animation: ringPulse 4s ease-in-out infinite;
        }

        .ring-1 { width: 100%; height: 100%; animation-delay: 0s; }
        .ring-2 { width: 120%; height: 120%; animation-delay: 0.5s; }
        .ring-3 { width: 140%; height: 140%; animation-delay: 1s; }

        @keyframes ringPulse {
          0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.6; transform: translate(-50%, -50%) scale(1.02); }
        }

        @media (max-width: 500px) {
          .auth-page {
            padding: 1rem;
          }
          .auth-card {
            padding: 1.5rem;
            margin: 0;
            border-radius: 16px;
          }
          .auth-back {
            top: 1rem;
            left: 1rem;
            padding: 0.5rem 1rem;
            font-size: 0.8rem;
          }
          .auth-icon {
            width: 56px;
            height: 56px;
          }
          .auth-title {
            font-size: 1.5rem;
          }
          .auth-subtitle {
            font-size: 0.85rem;
          }
          .auth-input {
            padding: 1rem 1rem 1rem 3rem;
            font-size: 16px; /* Prevents zoom on iOS */
          }
          .auth-button {
            padding: 1rem;
            font-size: 0.9rem;
          }
          .auth-message {
            padding: 0.75rem;
            font-size: 0.85rem;
          }
          .auth-glow {
            width: 300px;
            height: 300px;
          }
          .auth-glow-1 { top: -100px; right: -100px; }
          .auth-glow-2 { bottom: -100px; left: -100px; }
        }
      `}</style>
    </div>
  )
}
