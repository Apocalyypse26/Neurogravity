import React, { useEffect, useState } from 'react';
import EvilEye from '../components/EvilEye';
import '../../style.css';
import { Link } from 'react-router-dom';
import { Zap, Brain, Target, Shield, ChevronDown, Sparkles, TrendingUp, Radio } from 'lucide-react';

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
  
  const analysisText = `> Neural scan complete.
> Dopamine index: 847% BASELINE
> Viral coefficient: ALPHA++
> Deploy to: [X] [Telegram] [TikTok]
> Recommendation: IMMEDIATE`;

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

  const features = [
    { icon: <Brain className="feature-svg" />, title: 'Neural Analysis', desc: 'Deep-learning models trained on viral meme patterns across all major platforms' },
    { icon: <Zap className="feature-svg" />, title: 'Instant Scoring', desc: 'Real-time virality assessment in under 3 seconds with confidence metrics' },
    { icon: <Target className="feature-svg" />, title: 'Platform Targeting', desc: 'AI-powered recommendations for X, Telegram, Instagram, and TikTok optimization' },
    { icon: <Shield className="feature-svg" />, title: 'Risk Assessment', desc: 'Detect shadowbans, algorithmic penalties, and content flagged for removal' },
  ];

  const stats = [
    { value: 50000, suffix: '+', label: 'Memes Analyzed' },
    { value: 94, suffix: '%', label: 'Accuracy Rate' },
    { value: 2.3, suffix: 's', label: 'Avg Analysis Time' },
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
      <div className="webgl-container">
        <EvilEye
          eyeColor="#FF6F37"
          intensity={1.5}
          pupilSize={0.6}
          irisWidth={0.25}
          glowIntensity={0.35}
          scale={1.2}
          noiseScale={1}
          pupilFollow={1}
          flameSpeed={1}
          backgroundColor="#060010"
        />
      </div>

      {/* Overlay Gradients */}
      <div className="overlay-gradient-top" />
      <div className="overlay-gradient-bottom" />

      <header className="navbar-enhanced">
        <div className="nav-content">
          <div className="logo-enhanced">
            <div className="logo-icon-glow">
              <Radio size={18} />
            </div>
            <span className="logo-text">NEUROX</span>
            <span className="logo-version">v2.5</span>
          </div>
          <nav className="nav-links">
            <a href="#features" className="nav-link">
              <Sparkles size={14} /> Features
            </a>
            <a href="#stats" className="nav-link">
              <TrendingUp size={14} /> Stats
            </a>
            <a href="#pricing" className="nav-link">
              <Shield size={14} /> Pricing
            </a>
          </nav>
          <Link to="/auth" className="btn-nav">
            Launch Terminal
            <span className="btn-arrow">→</span>
          </Link>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="hero-section">
          <div className="hero-content">
            <div className="hero-badge">
              <span className="badge-pulse" />
              Invite-Only Access Available
            </div>
            
            <h1 className="hero-title">
              <span className="title-line">Score Your Content</span>
              <span className="title-gradient">Before The World Sees It</span>
            </h1>
            
            <p className="hero-subtitle">
              AI-powered virality scoring for crypto memes and visual content. 
              Predict viral potential across X, Telegram, Instagram, and TikTok.
            </p>
            
            <div className="hero-cta">
              <Link to="/auth" className="btn-primary-large glow-button">
                <Zap size={20} />
                Try Free Score
              </Link>
              <Link to="/auth" className="btn-secondary-large">
                Join Waitlist
              </Link>
            </div>

            <div className="hero-trust">
              <span className="trust-badge">
                <Shield size={12} /> Secure
              </span>
              <span className="trust-badge">
                <Brain size={12} /> AI-Powered
              </span>
              <span className="trust-badge">
                <Zap size={12} /> Instant
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
                    <img src="/cyber_doge_meme.png" alt="Meme" className="preview-image" />
                    <div className="scan-overlay" />
                    <div className="scan-line-anim" />
                  </div>
                  <div className="preview-tags">
                    <span className="tag-scan">IMAGE_SCAN</span>
                    <span className="tag-model">NEURO-v3</span>
                  </div>
                  <div className="preview-ranking">
                    <div className="ranking-header">TOP THREATS</div>
                    <div className="ranking-row active">
                      <span className="rank">#1</span>
                      <span className="name">PEPE_Moon.png</span>
                      <span className="score-high">97</span>
                    </div>
                    <div className="ranking-row">
                      <span className="rank">#2</span>
                      <span className="name">cyber_doge_meme.png</span>
                      <span className="score-high">94</span>
                    </div>
                  </div>
                </div>
                <div className="preview-right">
                  <div className="score-display">
                    <div className="score-label">VIRALITY SCORE</div>
                    <div className="score-number">94<span className="score-total">/100</span></div>
                    <div className="score-tag">CRITICAL THREAT</div>
                  </div>
                  <div className="preview-metrics">
                    <div className="metric">
                      <span className="metric-label">Impact</span>
                      <div className="metric-bar">
                        <div className="metric-fill" style={{ width: '96%' }} />
                      </div>
                      <span className="metric-value">96</span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">Hype</span>
                      <div className="metric-bar">
                        <div className="metric-fill" style={{ width: '88%' }} />
                      </div>
                      <span className="metric-value">88</span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">Meme-Q</span>
                      <div className="metric-bar">
                        <div className="metric-fill" style={{ width: '82%' }} />
                      </div>
                      <span className="metric-value">82</span>
                    </div>
                  </div>
                  <div className="analysis-stream">
                    <div className="stream-header">
                      <span className="recording-indicator" />
                      NEURAL STREAM
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
              <span className="title-accent">//</span> THREAT ANALYSIS SUITE
            </h2>
            <p className="section-subtitle">Enterprise-grade tools for viral content optimization</p>
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
              <span className="title-accent">//</span> OPERATIVE TIERS
            </h2>
            <p className="section-subtitle">Choose your level of neuro-viral dominance</p>
          </div>
          
          <div className="pricing-cards">
            <div className="pricing-card-animated tier-free">
              <div className="tier-header">
                <span className="tier-name">SCAVENGER</span>
                <div className="tier-price">FREE</div>
              </div>
              <ul className="tier-benefits">
                <li><span className="check">✓</span> 10 image scans/day</li>
                <li><span className="check">✓</span> Basic virality score</li>
                <li><span className="check inactive">✗</span> Video analysis</li>
                <li><span className="check inactive">✗</span> API access</li>
              </ul>
              <Link to="/auth" className="btn-tier">Initialize</Link>
            </div>
            
            <div className="pricing-card-animated tier-pro">
              <div className="tier-badge">RECOMMENDED</div>
              <div className="tier-header">
                <span className="tier-name text-primary">PRIME OPERATOR</span>
                <div className="tier-price">$29<span className="tier-period">/mo</span></div>
              </div>
              <ul className="tier-benefits">
                <li><span className="check">✓</span> Unlimited deep scans</li>
                <li><span className="check">✓</span> Full video analysis (20s)</li>
                <li><span className="check">✓</span> Platform optimization</li>
                <li><span className="check">✓</span> Priority API access</li>
              </ul>
              <Link to="/auth" className="btn-tier-primary">
                Deploy Now <span className="btn-arrow">→</span>
              </Link>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="cta-section">
          <div className="cta-content">
            <h2>Ready to Dominate?</h2>
            <p>Join thousands of operators maximizing their viral potential</p>
            <Link to="/auth" className="btn-cta-large">
              <Zap size={24} />
              Start Scoring Now
            </Link>
          </div>
        </section>
      </main>

      <footer className="footer-enhanced">
        <div className="footer-content-animated">
          <div className="footer-brand">
            <div className="logo-icon-glow small">
              <Radio size={14} />
            </div>
            <span>NEUROX</span>
          </div>
          <p className="footer-copy">© 2026 NEUROX Protocol. All systems operational.</p>
          <div className="footer-links">
            <a href="#">Documentation</a>
            <a href="#">X / Twitter</a>
            <a href="#">Telegram</a>
          </div>
        </div>
      </footer>
    </>
  );
}
