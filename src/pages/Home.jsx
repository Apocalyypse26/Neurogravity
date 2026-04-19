import React, { useEffect, useState } from 'react';
import EvilEye from '../components/EvilEye';
import '../../style.css';
import { Link } from 'react-router-dom';
import { Brain, Target, Shield, ChevronDown, Sparkles, TrendingUp, BookOpen } from 'lucide-react';
import BoltIcon from '../components/BoltIcon';

const AnimatedCounter = ({ end, duration = 2000, suffix = '' }) => {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    let startTime;
    const animate = (currentTime) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [end, duration]);
  
  return <span>{count}{suffix}</span>;
};

const FloatingParticle = ({ delay, x, y }) => (
  <div 
    className="floating-particle"
    style={{
      left: `${x}%`,
      top: `${y}%`,
      animationDelay: `${delay}s`,
    }}
  />
);

export default function Home() {
  const [typingText, setTypingText] = useState('');
  const [showScrollHint, setShowScrollHint] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
const memeImages = [
    { src: '/token_logo_sample.png', alt: 'Token Logo', scanTag: 'TOKEN_SCAN', modelTag: 'TRUST_V2' },
    { src: '/token_banner_sample.png', alt: 'Token Banner', scanTag: 'ASSET_SCAN', modelTag: 'PATTERN_V2' },
    { src: '/token_site_sample.png', alt: 'Token Website', scanTag: 'LAUNCH_SCAN', modelTag: 'QUALITY_V2' },
  ];
  
  const analysisText = `> Scan complete.
> TRUST SCORE: 78/100
> SCAM RISK: MEDIUM
> LAUNCH QUALITY: 64/100
> ORIGINALITY: 51/100
> RECOMMENDATION: review before entry`;

  useEffect(() => {
    let i = 0;
    const typeWriter = () => {
      if (i < analysisText.length) {
        setTypingText(analysisText.substring(0, i + 1));
        i++;
        setTimeout(typeWriter, 30 + Math.random() * 20);
      }
    };
    const timer = setTimeout(typeWriter, 1200);
    
    const handleScroll = () => setShowScrollHint(window.scrollY < 100);
    window.addEventListener('scroll', handleScroll);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    const imageInterval = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % memeImages.length);
    }, 60000);
    
    return () => clearInterval(imageInterval);
  }, [memeImages.length]);

  const features = [
    { icon: <Target className="feature-svg" />, title: 'Trust Score', desc: 'Aggregates branding, asset quality, and visual consistency into a single 0-100 score.' },
    { icon: <Shield className="feature-svg" />, title: 'Pattern Detection', desc: 'Flags derivative branding, copied visuals, and common low-effort launch tactics.' },
    { icon: <BoltIcon className="feature-svg" />, title: 'Launch Audit', desc: 'Evaluates token presentation polish and market-readiness signals.' },
    { icon: <Brain className="feature-svg" />, title: 'Evidence', desc: 'Every finding links back to the original asset. Export for due diligence.' },
  ];

  const stats = [
    { value: 5000, suffix: '+', label: 'Tokens Analyzed' },
    { value: 50, suffix: '+', label: 'Pattern Types' },
    { value: 1.2, suffix: 's', label: 'Avg Scan Time' },
  ];

  return (
    <>
      {/* Animated Background Particles */}
      <div className="particles-container">
        {[...Array(20)].map((_, i) => (
          <FloatingParticle 
            key={i} 
            delay={i * 0.5}
            x={Math.random() * 100}
            y={Math.random() * 100}
          />
        ))}
      </div>

      {/* WebGL EvilEye Background */}
      <div className="webgl-container" style={{ opacity: 0.5 }}>
        <EvilEye
          eyeColor="#FF6F37"
          intensity={0.7}
          pupilSize={0.5}
          irisWidth={0.2}
          glowIntensity={0.15}
          scale={1.0}
          noiseScale={0.8}
          pupilFollow={0.5}
          flameSpeed={0.6}
          backgroundColor="#030005"
        />
      </div>

      {/* Overlay Gradients */}
      <div className="overlay-gradient-top" />
      <div className="overlay-gradient-bottom" />

      <header className="navbar-enhanced">
        <div className="nav-content">
          <div className="logo-enhanced">
            <div className="logo-icon-glow">
              <img src="/neurox-logo.png" alt="NEUROX" className="logo-img" />
            </div>
            <span className="logo-text">NEUROX</span>
            <span className="logo-version">v2.5</span>
          </div>
          <nav className="nav-links">
            <a href="#features" className="nav-link">
              <Target size={14} /> Scanner
            </a>
            <a href="#features" className="nav-link">
              <Brain size={14} /> Evidence
            </a>
            <a href="#pricing" className="nav-link">
              <Shield size={14} /> Pricing
            </a>
            <Link to="/docs" className="nav-link">
              <BookOpen size={14} /> Docs
            </Link>
          </nav>
          <Link to="/auth" className="btn-nav">
            Launch Scanner
            <span className="btn-arrow">→</span>
          </Link>
          <button 
            className="mobile-menu-btn" 
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            <span></span>
          </button>
        </div>
      </header>

      {/* Mobile Menu */}
      <div className={`mobile-menu ${mobileMenuOpen ? 'active' : ''}`}>
        <button 
          className="mobile-menu-close" 
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close menu"
        >
          ×
        </button>
        <a href="#features" onClick={() => setMobileMenuOpen(false)}>Features</a>
        <a href="#stats" onClick={() => setMobileMenuOpen(false)}>Stats</a>
        <a href="#pricing" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
        <Link to="/docs" onClick={() => setMobileMenuOpen(false)}>Documentation</Link>
        <Link to="/auth" className="btn-nav" onClick={() => setMobileMenuOpen(false)}>
          Launch Scanner
        </Link>
      </div>

      <main>
        {/* Hero Section */}
        <section className="hero-section">
          <div className="hero-content">
            <div className="hero-badge">
              <span className="badge-pulse" />
              TOKEN TRUST INTELLIGENCE
            </div>
            
            <h1 className="hero-title">
              <span className="title-line">Scan a token</span>
              <span className="title-gradient">before you trust it</span>
            </h1>
            
            <p className="hero-subtitle">
              NEUROX scans token branding, launch assets, and public visuals to surface trust signals, 
              scam risk, and launch quality in seconds.
            </p>
            
            <div className="hero-cta">
              <Link to="/auth" className="btn-primary-large glow-button">
                <BoltIcon size={20} />
                Launch Scanner
              </Link>
              <Link to="/docs" className="btn-secondary-large">
                View Documentation
              </Link>
            </div>

            <div className="hero-trust">
              <span className="trust-badge">
                <Shield size={12} /> Visual Analysis
              </span>
              <span className="trust-badge">
                <Brain size={12} /> Pattern Detection
              </span>
              <span className="trust-badge">
                <BoltIcon size={12} /> Evidence-Based
              </span>
            </div>
          </div>

          {/* Dashboard Preview */}
          <div className="hero-preview">
            <div className="preview-window">
              <div className="preview-header">
                <div className="window-dots">
                  <span className="dot close" />
                  <span className="dot min" />
                  <span className="dot max" />
                </div>
                <span className="preview-title">neurox_scanner.exe</span>
              </div>
              <div className="preview-body">
                <div className="preview-left">
                  <div className="preview-scan">
                    <img src={memeImages[currentImageIndex].src} alt={memeImages[currentImageIndex].alt} className="preview-image" />
                    <div className="scan-overlay" />
                    <div className="scan-line-anim" />
                  </div>
                  <div className="preview-tags">
                    <span className="tag-scan">{memeImages[currentImageIndex].scanTag}</span>
                    <span className="tag-model">{memeImages[currentImageIndex].modelTag}</span>
                  </div>
                  <div className="preview-ranking">
                    <div className="ranking-header">RED FLAGS</div>
                    <div className="ranking-row active">
                      <span className="rank">!</span>
                      <span className="name">branding consistency below threshold</span>
                      <span className="score-high">HIGH</span>
                    </div>
                    <div className="ranking-row">
                      <span className="rank">!</span>
                      <span className="name">repeated visual motifs detected</span>
                      <span className="score-high">MED</span>
                    </div>
                    <div className="ranking-row">
                      <span className="rank">!</span>
                      <span className="name">promo styling appears derivative</span>
                      <span className="score-mid">MED</span>
                    </div>
                    <div className="ranking-row">
                      <span className="rank">!</span>
                      <span className="name">aggressive retail-bait copy patterns</span>
                      <span className="score-mid">LOW</span>
                    </div>
                  </div>
                </div>
                <div className="preview-right">
                  <div className="score-display">
                    <div className="score-label">TRUST SCORE</div>
                    <div className="score-number">78<span className="score-total">/100</span></div>
                    <div className="score-tag">MEDIUM RISK</div>
                  </div>
                  <div className="preview-metrics">
                    <div className="metric">
                      <span className="metric-label">Trust Score</span>
                      <div className="metric-bar">
                        <div className="metric-fill" style={{ width: '78%' }} />
                      </div>
                      <span className="metric-value">78</span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">Launch Quality</span>
                      <div className="metric-bar">
                        <div className="metric-fill" style={{ width: '64%' }} />
                      </div>
                      <span className="metric-value">64</span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">Originality</span>
                      <div className="metric-bar">
                        <div className="metric-fill" style={{ width: '51%' }} />
                      </div>
                      <span className="metric-value">51</span>
                    </div>
                  </div>
                  <div className="analysis-stream">
                    <div className="stream-header">
                      <span className="recording-indicator" />
                      ANALYSIS STREAM
                    </div>
                    <div className="stream-text">{typingText}<span className="cursor-blink">_</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Scroll Indicator */}
        {showScrollHint && (
          <div className="scroll-hint">
            <span>Explore</span>
            <ChevronDown className="scroll-icon" />
          </div>
        )}

        {/* Stats Section */}
        <section id="stats" className="stats-section">
          <div className="stats-container">
            {stats.map((stat, i) => (
              <div key={i} className="stat-card">
                <div className="stat-value">
                  <AnimatedCounter end={stat.value} suffix={stat.suffix} />
                </div>
                <div className="stat-label">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="features-section">
          <div className="section-header-animated">
            <h2 className="section-title">
              <span className="title-accent">//</span> TRUST INTELLIGENCE MODULES
            </h2>
            <p className="section-subtitle">Visual intelligence tools for crypto token research</p>
          </div>
          
          <div className="features-grid">
            {features.map((feature, i) => (
              <div key={i} className="feature-card-enhanced" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="feature-icon-wrapper">
                  {feature.icon}
                </div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-desc">{feature.desc}</p>
                <div className="feature-glow" />
              </div>
            ))}
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="pricing-section">
          <div className="section-header-animated">
            <h2 className="section-title">
              <span className="title-accent">//</span> SCANNER TIERS
            </h2>
            <p className="section-subtitle">Choose your level of trust intelligence access</p>
          </div>
          
          <div className="pricing-cards">
            <div className="pricing-card-animated tier-free">
              <div className="tier-header">
                <span className="tier-name">SCAVENGER</span>
                <div className="tier-price">FREE</div>
              </div>
              <ul className="tier-benefits">
                <li><span className="check">✓</span> 3 scans/month</li>
                <li><span className="check">✓</span> Basic Trust Score</li>
                <li><span className="check inactive">✗</span> Evidence Layer</li>
                <li><span className="check inactive">✗</span> PDF exports</li>
              </ul>
              <Link to="/auth" className="btn-tier">Initialize</Link>
            </div>
            
            <div className="pricing-card-animated tier-pro">
              <div className="tier-badge">RECOMMENDED</div>
              <div className="tier-header">
                <span className="tier-name text-primary">PRIME</span>
                <div className="tier-price">$49<span className="tier-period">/mo</span></div>
              </div>
              <ul className="tier-benefits">
                <li><span className="check">✓</span> Unlimited scans</li>
                <li><span className="check">✓</span> Full Evidence Layer</li>
                <li><span className="check">✓</span> PDF exports</li>
                <li><span className="check">✓</span> Priority processing</li>
              </ul>
              <Link to="/auth" className="btn-tier-primary">
                Launch Scanner <span className="btn-arrow">→</span>
              </Link>
            </div>

            <div className="pricing-card-animated tier-credits">
              <div className="tier-header">
                <span className="tier-name">CREDIT PACKS</span>
                <div className="tier-price">$15+</div>
              </div>
              <ul className="tier-benefits">
                <li><span className="check">✓</span> 10 scans for $15</li>
                <li><span className="check">✓</span> 50 scans for $49</li>
                <li><span className="check">✓</span> 200 scans for $99</li>
                <li><span className="check">✓</span> No expiry date</li>
              </ul>
              <Link to="/auth" className="btn-tier">Buy Credits</Link>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="cta-section">
          <div className="cta-content">
            <h2>Scan before you ape.</h2>
            <p>Get a trust assessment in seconds. No account required for basic scans.</p>
            <Link to="/auth" className="btn-cta-large">
              <BoltIcon size={24} />
              Scan a Token
            </Link>
          </div>
        </section>
      </main>

      <footer className="footer-enhanced">
        <div className="footer-content-animated">
          <div className="footer-brand">
            <div className="logo-icon-glow small">
              <img src="/neurox-logo.png" alt="NEUROX" className="logo-img" />
            </div>
            <span>NEUROX</span>
          </div>
          <p className="footer-copy">© 2026 NEUROX. All rights reserved.</p>
          <div className="footer-links">
            <Link to="/docs">Documentation</Link>
            <a href="https://x.com/NEUROOXX" target="_blank" rel="noopener noreferrer">X / Twitter</a>
            <a href="https://t.me/NEEUROX" target="_blank" rel="noopener noreferrer">Telegram</a>
          </div>
        </div>
      </footer>
    </>
  );
}
