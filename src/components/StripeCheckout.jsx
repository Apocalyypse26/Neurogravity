import React, { useState, useEffect } from 'react'
import { createCheckoutSession, getPackages } from '../lib/api'
import { CreditCard, Loader2, X, Check, Star } from 'lucide-react'
import BoltIcon from './BoltIcon'

export default function StripeCheckout({ userId, email, onClose, onSuccess }) {
  const [packages, setPackages] = useState(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    loadPackages()
  }, [])

  const loadPackages = async () => {
    try {
      const data = await getPackages()
      setPackages(data)
    } catch (err) {
      setError('Failed to load pricing')
    } finally {
      setLoading(false)
    }
  }

  const handlePurchase = async (packageId) => {
    setProcessing(packageId)
    setError('')
    try {
      const { url } = await createCheckoutSession(packageId, userId, email)
      window.location.href = url
    } catch (err) {
      setError(err.message || 'Failed to start checkout')
      setProcessing(null)
    }
  }

  const packageList = [
    {
      id: 'credits_10',
      name: '10 Scans',
      price: '$15',
      credits: 10,
      description: 'Perfect for testing',
      popular: false,
    },
    {
      id: 'credits_50',
      name: '50 Scans',
      price: '$49',
      credits: 50,
      description: 'Best value per scan',
      popular: true,
    },
    {
      id: 'credits_200',
      name: '200 Scans',
      price: '$99',
      credits: 200,
      description: 'For power operators',
      popular: false,
    },
  ]

  return (
    <div className="stripe-modal-overlay" onClick={onClose}>
      <div className="stripe-modal" onClick={(e) => e.stopPropagation()}>
        <div className="stripe-modal-header">
          <div className="stripe-modal-title">
            <CreditCard size={20} />
            <h2>Acquire Scan Credits</h2>
          </div>
          <button className="stripe-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="stripe-modal-body">
          {loading ? (
            <div className="stripe-loading">
              <Loader2 size={32} className="spin" />
              <span>Loading packages...</span>
            </div>
          ) : (
            <>
              <p className="stripe-desc">
                Select a credit package to continue your neuro-virality analysis
              </p>

              <div className="stripe-packages">
                {packageList.map((pkg) => (
                  <div
                    key={pkg.id}
                    className={`stripe-package ${pkg.popular ? 'popular' : ''}`}
                  >
                    {pkg.popular && (
                      <div className="popular-badge">
                        <Star size={12} />
                        Best Value
                      </div>
                    )}
                    <div className="package-header">
                      <h3>{pkg.name}</h3>
                      <div className="package-price">{pkg.price}</div>
                    </div>
                    <p className="package-desc">{pkg.description}</p>
                    <div className="package-credits">
                      <BoltIcon size={14} />
                      {pkg.credits} scans included
                    </div>
                    <button
                      className="package-btn"
                      onClick={() => handlePurchase(pkg.id)}
                      disabled={processing !== null}
                    >
                      {processing === pkg.id ? (
                        <>
                          <Loader2 size={16} className="spin" />
                          Redirecting...
                        </>
                      ) : (
                        <>
                          <CreditCard size={16} />
                          Purchase
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>

              {error && (
                <div className="stripe-error">
                  <X size={16} />
                  {error}
                </div>
              )}

              <div className="stripe-footer">
                <div className="stripe-security">
                  <Check size={14} />
                  <span>Secure checkout powered by Stripe</span>
                </div>
              </div>
            </>
          )}
        </div>

        <style>{`
          .stripe-modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 1rem;
            animation: fadeIn 0.2s ease;
          }

          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          .stripe-modal {
            width: 100%;
            max-width: 680px;
            background: linear-gradient(135deg, rgba(25, 15, 40, 0.98) 0%, rgba(15, 8, 25, 0.99) 100%);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            overflow: hidden;
            animation: slideUp 0.3s ease;
          }

          @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }

          .stripe-modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1.5rem 2rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          }

          .stripe-modal-title {
            display: flex;
            align-items: center;
            gap: 12px;
            color: var(--color-primary);
          }

          .stripe-modal-title h2 {
            font-size: 1.25rem;
            font-weight: 700;
            color: var(--color-text);
          }

          .stripe-close {
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            color: var(--color-text-muted);
            cursor: pointer;
            transition: var(--transition);
          }

          .stripe-close:hover {
            background: rgba(252, 25, 53, 0.2);
            border-color: var(--color-danger);
            color: var(--color-danger);
          }

          .stripe-modal-body {
            padding: 2rem;
          }

          .stripe-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
            padding: 3rem;
            color: var(--color-text-muted);
          }

          .spin {
            animation: spin 1s linear infinite;
          }

          @keyframes spin {
            to { transform: rotate(360deg); }
          }

          .stripe-desc {
            color: var(--color-text-muted);
            font-size: 0.95rem;
            margin-bottom: 1.5rem;
            text-align: center;
          }

          .stripe-packages {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 1rem;
          }

          .stripe-package {
            position: relative;
            padding: 1.5rem;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px;
            text-align: center;
            transition: var(--transition);
          }

          .stripe-package:hover {
            border-color: rgba(255, 111, 55, 0.3);
            transform: translateY(-2px);
          }

          .stripe-package.popular {
            border-color: var(--color-primary);
            background: rgba(255, 111, 55, 0.05);
          }

          .popular-badge {
            position: absolute;
            top: -10px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px 12px;
            background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
            border-radius: 100px;
            color: white;
            font-size: 0.7rem;
            font-weight: 700;
            white-space: nowrap;
          }

          .package-header {
            margin-bottom: 0.75rem;
          }

          .package-header h3 {
            font-size: 0.9rem;
            font-weight: 600;
            color: var(--color-text-muted);
            margin-bottom: 0.5rem;
          }

          .package-price {
            font-size: 2rem;
            font-weight: 900;
            color: var(--color-text);
          }

          .package-desc {
            font-size: 0.8rem;
            color: var(--color-text-dim);
            margin-bottom: 1rem;
          }

          .package-credits {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 0.5rem 1rem;
            background: rgba(255, 111, 55, 0.1);
            border-radius: 100px;
            font-size: 0.8rem;
            color: var(--color-primary);
            margin-bottom: 1.25rem;
          }

          .package-btn {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 0.875rem;
            background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
            border: none;
            border-radius: 10px;
            color: white;
            font-size: 0.9rem;
            font-weight: 700;
            cursor: pointer;
            transition: var(--transition-bounce);
            box-shadow: 0 4px 15px var(--color-primary-glow);
          }

          .package-btn:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px var(--color-primary-glow);
          }

          .package-btn:disabled {
            opacity: 0.7;
            cursor: not-allowed;
          }

          .stripe-error {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 1rem;
            padding: 0.875rem 1rem;
            background: rgba(252, 25, 53, 0.1);
            border: 1px solid rgba(252, 25, 53, 0.2);
            border-radius: 10px;
            color: var(--color-danger);
            font-size: 0.85rem;
          }

          .stripe-footer {
            margin-top: 1.5rem;
            padding-top: 1.5rem;
            border-top: 1px solid rgba(255, 255, 255, 0.06);
          }

          .stripe-security {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            color: var(--color-text-dim);
            font-size: 0.8rem;
          }

          @media (max-width: 600px) {
            .stripe-packages {
              grid-template-columns: 1fr;
            }
            .stripe-modal {
              border-radius: 16px;
            }
            .stripe-modal-header,
            .stripe-modal-body {
              padding: 1.25rem;
            }
          }
        `}</style>
      </div>
    </div>
  )
}
