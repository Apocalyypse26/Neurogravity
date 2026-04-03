import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Book, Search, ChevronRight, Copy, ExternalLink, Brain, Shield, Terminal, Code, Target, Rocket, Gauge, Plug, Map, HelpCircle, Link2, Users, Layers, CheckCircle, ArrowRight, Clock, Calendar } from 'lucide-react';
import BoltIcon from '../components/BoltIcon';
import '../../style.css';

export default function Documentation() {
  const [activeSection, setActiveSection] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [mounted, setMounted] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  
  const sections = [
    { id: 'overview', title: 'Overview', icon: <Book size={16} /> },
    { id: 'core-concepts', title: 'Core Concepts', icon: <Brain size={16} /> },
    { id: 'architecture', title: 'Architecture', icon: <Layers size={16} /> },
    { id: 'user-personas', title: 'User Personas', icon: <Users size={16} /> },
    { id: 'terminal', title: 'NEUROX Terminal', icon: <Terminal size={16} /> },
    { id: 'operator-model', title: 'Operator Model', icon: <Code size={16} /> },
    { id: 'scoring', title: 'Scoring', icon: <Target size={16} /> },
    { id: 'deployment', title: 'Deployment', icon: <Rocket size={16} /> },
    { id: 'security', title: 'Security', icon: <Shield size={16} /> },
    { id: 'performance', title: 'Performance', icon: <Gauge size={16} /> },
    { id: 'integrations', title: 'Integrations', icon: <Plug size={16} /> },
    { id: 'frontend', title: 'Frontend & Branding', icon: <BoltIcon size={16} /> },
    { id: 'roadmap', title: 'Roadmap', icon: <Map size={16} /> },
    { id: 'faq', title: 'FAQ', icon: <HelpCircle size={16} /> },
    { id: 'references', title: 'References', icon: <Link2 size={16} /> },
  ];

  const contentRef = useRef(null);

  useEffect(() => {
    setMounted(true);
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-20% 0px -80% 0px' }
    );

    const sectionElements = document.querySelectorAll('.doc-section');
    sectionElements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setMobileNavOpen(false);
    }
  };

  const copyLink = (id) => {
    const url = `${window.location.origin}/docs#${id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredSections = sections.filter(
    (s) => s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <div className="docs-bg" />
      
      <header className="navbar-enhanced">
        <div className="nav-content">
          <Link to="/" className="logo-enhanced">
            <div className="logo-icon-glow">
              <img src="/neurox-logo.png" alt="NEUROX" className="logo-img" />
            </div>
            <span className="logo-text">NEUROX</span>
            <span className="logo-version">v2.5</span>
          </Link>
          <nav className="nav-links">
            <Link to="/" className="nav-link">
              <BoltIcon size={14} /> Home
            </Link>
            <Link to="/docs" className="nav-link active">
              <Book size={14} /> Docs
            </Link>
          </nav>
          <Link to="/auth" className="btn-nav">
            Launch Terminal
            <span className="btn-arrow">→</span>
          </Link>
          <button 
            className="mobile-menu-btn docs-mobile-menu-btn" 
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            aria-label="Toggle navigation"
          >
            <span></span>
          </button>
        </div>
      </header>

      <div className={`docs-mobile-nav ${mobileNavOpen ? 'active' : ''}`}>
        <button 
          className="mobile-menu-close" 
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation"
        >
          ×
        </button>
        <div className="docs-mobile-nav-links">
          {sections.map((section) => (
            <button
              key={section.id}
              className={`docs-mobile-nav-link ${activeSection === section.id ? 'active' : ''}`}
              onClick={() => scrollToSection(section.id)}
            >
              {section.icon}
              <span>{section.title}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={`docs-layout ${mounted ? 'mounted' : ''}`}>
        <aside className="docs-sidebar">
          <div className="docs-sidebar-header">
            <h3>Documentation</h3>
            <span className="docs-version-badge">v2.5</span>
          </div>
          
          <div className="docs-search">
            <Search size={16} className="docs-search-icon" />
            <input
              type="text"
              placeholder="Search docs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="docs-search-input"
            />
          </div>

          <nav className="docs-nav">
            {filteredSections.map((section) => (
              <button
                key={section.id}
                className={`docs-nav-link ${activeSection === section.id ? 'active' : ''}`}
                onClick={() => scrollToSection(section.id)}
              >
                {section.icon}
                <span>{section.title}</span>
                <ChevronRight size={14} className="docs-nav-arrow" />
              </button>
            ))}
          </nav>

          <div className="docs-meta">
            <div className="docs-meta-item">
              <Clock size={14} />
              <span>~15 min read</span>
            </div>
            <div className="docs-meta-item">
              <Calendar size={14} />
              <span>Updated Jan 2026</span>
            </div>
          </div>
        </aside>

        <main className="docs-content" ref={contentRef}>
          <div className="docs-hero">
            <div className="docs-hero-badge">
              <BoltIcon size={14} />
              Protocol Documentation
            </div>
            <h1 className="docs-hero-title">NEUROX Protocol</h1>
            <p className="docs-hero-subtitle">
              Complete documentation for the operator-based automation protocol. 
              Learn how to build, deploy, and manage autonomous scoring pipelines.
            </p>
          </div>

          {/* Overview Section */}
          <section id="overview" className="doc-section">
            <div className="doc-section-header">
              <h2>
                <Book size={20} className="doc-section-icon" />
                Overview
              </h2>
              <button className="doc-copy-link" onClick={() => copyLink('overview')}>
                {copiedId === 'overview' ? <CheckCircle size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <p>
              NEUROX is an operator-based automation protocol designed to help users "dominate" their workflows 
              by deploying networks of autonomous agents, called Operators, that continuously monitor data 
              streams and generate actionable scores or signals.
            </p>
            <div className="doc-callout doc-callout-info">
              <Shield size={16} />
              <p>
                This documentation is written for the custom NEUROX project deployed at gravity.vercel.app 
                and is not affiliated with existing products or medical services that use the "Neurox" name 
                in other industries.
              </p>
            </div>
          </section>

          {/* Core Concepts Section */}
          <section id="core-concepts" className="doc-section">
            <div className="doc-section-header">
              <h2>
                <Brain size={20} className="doc-section-icon" />
                Core Concepts
              </h2>
              <button className="doc-copy-link" onClick={() => copyLink('core-concepts')}>
                {copiedId === 'core-concepts' ? <CheckCircle size={16} /> : <Copy size={16} />}
              </button>
            </div>
            
            <h3>Operators</h3>
            <p>
              Operators are modular, reusable logic units that ingest inputs, apply a strategy, and emit 
              a standardized score or action.
            </p>
            <ul>
              <li>Each Operator is stateless between invocations but can read and write to external state stores (databases, blockchains, or APIs) through well-defined adapters.</li>
              <li>Operators are versioned and can be promoted from draft to production once tested against historical data and live traffic.</li>
            </ul>

            <h3>Scores</h3>
            <p>
              A Score is the primary output of an Operator and represents how strongly certain criteria 
              are met on a normalized scale, such as 0–100.
            </p>
            <ul>
              <li>Scores are designed to be chainable: the output from one Operator can be used as an input feature for another, enabling layered decision-making pipelines.</li>
              <li>Scores can be persisted for analytics, fed into dashboards, or used to trigger downstream automations like trade execution, alerts, or webhooks.</li>
            </ul>

            <h3>Pipelines</h3>
            <p>
              Pipelines are ordered graphs of Operators that transform raw inputs (for example, market data, 
              user events, or telemetry) into high-level decisions.
            </p>
            <ul>
              <li>Pipelines define data flow, branching logic, aggregation rules, and failure-handling behavior in a declarative configuration file.</li>
              <li>Each Pipeline can be deployed as a distinct endpoint in the NEUROX Terminal, exposing a single URL or RPC method for external consumers.</li>
            </ul>
          </section>

          {/* Architecture Section */}
          <section id="architecture" className="doc-section">
            <div className="doc-section-header">
              <h2>
                <Layers size={20} className="doc-section-icon" />
                High-Level Architecture
              </h2>
              <button className="doc-copy-link" onClick={() => copyLink('architecture')}>
                {copiedId === 'architecture' ? <CheckCircle size={16} /> : <Copy size={16} />}
              </button>
            </div>

            <h3>Components</h3>
            <div className="doc-components-grid">
              <div className="doc-component-card">
                <div className="doc-component-icon"><BoltIcon size={20} /></div>
                <h4>Frontend</h4>
                <p>Landing page & authenticated NEUROX Terminal for advanced users.</p>
              </div>
              <div className="doc-component-card">
                <div className="doc-component-icon"><Shield size={20} /></div>
                <h4>API Gateway</h4>
                <p>Single entry point for authentication, rate limiting, and routing.</p>
              </div>
              <div className="doc-component-card">
                <div className="doc-component-icon"><Code size={20} /></div>
                <h4>Operator Runtime</h4>
                <p>Containerized execution layer with isolated sandboxes.</p>
              </div>
              <div className="doc-component-card">
                <div className="doc-component-icon"><Target size={20} /></div>
                <h4>Scoring Engine</h4>
                <p>Orchestrates Operator execution and applies scoring standards.</p>
              </div>
              <div className="doc-component-card">
                <div className="doc-component-icon"><Layers size={20} /></div>
                <h4>Storage Layer</h4>
                <p>Databases for configuration and time-series data for scores.</p>
              </div>
              <div className="doc-component-card">
                <div className="doc-component-icon"><Plug size={20} /></div>
                <h4>Integration Hub</h4>
                <p>Connectors to third-party APIs and external services.</p>
              </div>
            </div>

            <h3>Data Flow</h3>
            <ol className="doc-data-flow">
              <li>
                <span className="doc-flow-step">1</span>
                <p>A client sends a request to score a particular context through the NEUROX API Gateway.</p>
              </li>
              <li>
                <span className="doc-flow-step">2</span>
                <p>The Gateway authenticates the request, resolves the target Pipeline, and forwards it to the Scoring Engine.</p>
              </li>
              <li>
                <span className="doc-flow-step">3</span>
                <p>The Scoring Engine orchestrates execution of all Operators in the Pipeline, fetching necessary data via the Integration Hub.</p>
              </li>
              <li>
                <span className="doc-flow-step">4</span>
                <p>Operators execute in the Operator Runtime and return Scores along with optional metadata.</p>
              </li>
              <li>
                <span className="doc-flow-step">5</span>
                <p>The Scoring Engine aggregates Scores, applies final decision rules, persists results, and returns a unified response to the client.</p>
              </li>
            </ol>
          </section>

          {/* User Personas Section */}
          <section id="user-personas" className="doc-section">
            <div className="doc-section-header">
              <h2>
                <Users size={20} className="doc-section-icon" />
                User Personas
              </h2>
              <button className="doc-copy-link" onClick={() => copyLink('user-personas')}>
                {copiedId === 'user-personas' ? <CheckCircle size={16} /> : <Copy size={16} />}
              </button>
            </div>

            <div className="doc-personas-grid">
              <div className="doc-persona-card">
                <div className="doc-persona-header">
                  <Code size={24} />
                  <h3>Builders</h3>
                </div>
                <p>
                  Create Operators and Pipelines using the NEUROX Terminal. They manage versions, 
                  configure inputs and outputs, and test changes on sandbox data before promotion to production.
                </p>
              </div>
              <div className="doc-persona-card">
                <div className="doc-persona-header">
                  <BoltIcon size={24} />
                  <h3>Power Users</h3>
                </div>
                <p>
                  Consume ready-made Pipelines via APIs, dashboards, or automation tools. They typically 
                  configure high-level parameters without editing Operator code.
                </p>
              </div>
              <div className="doc-persona-card">
                <div className="doc-persona-header">
                  <Shield size={24} />
                  <h3>Administrators</h3>
                </div>
                <p>
                  Manage workspace-level settings such as billing, API key rotation, access control, 
                  and audit logs. They also monitor protocol health and incident response.
                </p>
              </div>
            </div>
          </section>

          {/* Terminal Section */}
          <section id="terminal" className="doc-section">
            <div className="doc-section-header">
              <h2>
                <Terminal size={20} className="doc-section-icon" />
                NEUROX Terminal
              </h2>
              <button className="doc-copy-link" onClick={() => copyLink('terminal')}>
                {copiedId === 'terminal' ? <CheckCircle size={16} /> : <Copy size={16} />}
              </button>
            </div>

            <h3>Access and Authentication</h3>
            <ul>
              <li>Users sign up or log in using email-based magic links, OAuth providers, or wallet-based authentication.</li>
              <li>After authentication, users are assigned to a workspace that owns Operators, Pipelines, and scoring quotas.</li>
              <li>API keys and personal access tokens are issued from the Terminal for programmatic access.</li>
            </ul>

            <h3>Key Screens</h3>
            <div className="doc-screens-grid">
              <div className="doc-screen-item">
                <ArrowRight size={16} />
                <div>
                  <strong>Dashboard</strong>
                  <p>Summary of recent scoring activity, latency, error rates, and top-performing Pipelines.</p>
                </div>
              </div>
              <div className="doc-screen-item">
                <ArrowRight size={16} />
                <div>
                  <strong>Operators</strong>
                  <p>List view and detail pages for each Operator, including configuration, change history, tests, and logs.</p>
                </div>
              </div>
              <div className="doc-screen-item">
                <ArrowRight size={16} />
                <div>
                  <strong>Pipelines</strong>
                  <p>Visual graph editor or structured configuration editor for composing Operators into scoring flows.</p>
                </div>
              </div>
              <div className="doc-screen-item">
                <ArrowRight size={16} />
                <div>
                  <strong>Integrations</strong>
                  <p>Management of external connections (exchanges, webhooks, databases, messaging systems).</p>
                </div>
              </div>
              <div className="doc-screen-item">
                <ArrowRight size={16} />
                <div>
                  <strong>Settings</strong>
                  <p>Workspace settings, roles and permissions, billing, and environment configuration.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Operator Model Section */}
          <section id="operator-model" className="doc-section">
            <div className="doc-section-header">
              <h2>
                <Code size={20} className="doc-section-icon" />
                Operator Model
              </h2>
              <button className="doc-copy-link" onClick={() => copyLink('operator-model')}>
                {copiedId === 'operator-model' ? <CheckCircle size={16} /> : <Copy size={16} />}
              </button>
            </div>

            <h3>Definition Schema</h3>
            <p>Operators are defined in configuration (for example, JSON or YAML) and bound to executable code.</p>
            
            <div className="doc-code-block">
              <div className="doc-code-header">
                <span>operator-definition.json</span>
                <button className="doc-code-copy" onClick={() => {
                  navigator.clipboard.writeText(`{
  "id": "operator-001",
  "name": "Viral Score Analyzer",
  "description": "Analyzes content for viral potential",
  "version": "1.0.0",
  "inputs": {
    "content_url": { "type": "string", "required": true },
    "platforms": { "type": "array", "default": ["x", "telegram"] }
  },
  "outputs": {
    "score": { "type": "number", "min": 0, "max": 100 },
    "confidence": { "type": "number", "min": 0, "max": 1 }
  },
  "runtime": {
    "language": "python",
    "version": "3.11",
    "memory": "512MB",
    "timeout": "30s"
  },
  "safety": {
    "maxRuntime": "60s",
    "maxMemory": "1GB",
    "failureBehavior": "return_default"
  }
}`);
                }}>
                  <Copy size={14} />
                </button>
              </div>
              <pre>{`{
  "id": "operator-001",
  "name": "Viral Score Analyzer",
  "description": "Analyzes content for viral potential",
  "version": "1.0.0",
  "inputs": {
    "content_url": { "type": "string", "required": true },
    "platforms": { "type": "array", "default": ["x", "telegram"] }
  },
  "outputs": {
    "score": { "type": "number", "min": 0, "max": 100 },
    "confidence": { "type": "number", "min": 0, "max": 1 }
  },
  "runtime": {
    "language": "python",
    "version": "3.11",
    "memory": "512MB",
    "timeout": "30s"
  },
  "safety": {
    "maxRuntime": "60s",
    "maxMemory": "1GB",
    "failureBehavior": "return_default"
  }
}`}</pre>
            </div>

            <h3>Lifecycle</h3>
            <div className="doc-lifecycle">
              <div className="doc-lifecycle-step">
                <span className="doc-lifecycle-badge doc-lifecycle-draft">Draft</span>
                <p>Operator created and iterated on in a sandbox environment.</p>
              </div>
              <div className="doc-lifecycle-step">
                <span className="doc-lifecycle-badge doc-lifecycle-testing">Testing</span>
                <p>Operator run against historical or synthetic data with metrics collected.</p>
              </div>
              <div className="doc-lifecycle-step">
                <span className="doc-lifecycle-badge doc-lifecycle-review">Review</span>
                <p>Peer review and sign-off, including security and performance checks.</p>
              </div>
              <div className="doc-lifecycle-step">
                <span className="doc-lifecycle-badge doc-lifecycle-production">Production</span>
                <p>Operator deployed into live Pipelines with rollout strategy.</p>
              </div>
              <div className="doc-lifecycle-step">
                <span className="doc-lifecycle-badge doc-lifecycle-deprecated">Deprecation</span>
                <p>Operator replaced or disabled with migration paths for dependent Pipelines.</p>
              </div>
            </div>
          </section>

          {/* Scoring Section */}
          <section id="scoring" className="doc-section">
            <div className="doc-section-header">
              <h2>
                <Target size={20} className="doc-section-icon" />
                Scoring Semantics
              </h2>
              <button className="doc-copy-link" onClick={() => copyLink('scoring')}>
                {copiedId === 'scoring' ? <CheckCircle size={16} /> : <Copy size={16} />}
              </button>
            </div>

            <h3>Score Scale</h3>
            <p>
              By default, NEUROX uses a continuous scale from 0 to 100. Projects can define additional 
              scoring ranges (for example, 0–1, 1–10, or categorical labels) as long as they are documented 
              in the Operator and Pipeline configuration.
            </p>

            <div className="doc-score-scale">
              <div className="doc-score-range doc-score-low">
                <span>0-30</span>
                <p>Low</p>
              </div>
              <div className="doc-score-range doc-score-medium">
                <span>31-60</span>
                <p>Medium</p>
              </div>
              <div className="doc-score-range doc-score-high">
                <span>61-85</span>
                <p>High</p>
              </div>
              <div className="doc-score-range doc-score-critical">
                <span>86-100</span>
                <p>Critical</p>
              </div>
            </div>

            <h3>Confidence and Metadata</h3>
            <p>
              Each Score can carry a <code>confidence</code> field describing how reliable it is, based on 
              data completeness, model performance, or rule coverage. Operators can optionally emit 
              explanation metadata, such as feature contributions, rule paths taken, or example queries 
              used for decisions.
            </p>

            <h3>Aggregation Rules</h3>
            <p>
              When multiple Operators contribute to a final decision, Pipelines use explicit aggregation 
              rules, such as weighted averages, voting schemes, or winner-takes-all strategies. Aggregation 
              rules are stored in configuration so that behavior is fully auditable.
            </p>
          </section>

          {/* Deployment Section */}
          <section id="deployment" className="doc-section">
            <div className="doc-section-header">
              <h2>
                <Rocket size={20} className="doc-section-icon" />
                Deployment Model
              </h2>
              <button className="doc-copy-link" onClick={() => copyLink('deployment')}>
                {copiedId === 'deployment' ? <CheckCircle size={16} /> : <Copy size={16} />}
              </button>
            </div>

            <h3>Environments</h3>
            <div className="doc-environments">
              <div className="doc-env-card">
                <div className="doc-env-badge doc-env-dev">Development</div>
                <p>For rapid iteration, where breaking changes are acceptable.</p>
              </div>
              <div className="doc-env-card">
                <div className="doc-env-badge doc-env-staging">Staging</div>
                <p>Mirrors production as closely as possible for final validation and load testing.</p>
              </div>
              <div className="doc-env-card">
                <div className="doc-env-badge doc-env-prod">Production</div>
                <p>Live environment serving real traffic with strict SLOs.</p>
              </div>
            </div>

            <h3>Deploy Now Button</h3>
            <p>
              The "Deploy Now" call to action on the marketing site links users directly into the Terminal 
              with a guided onboarding flow to create their first Pipeline. The onboarding wizard provisions 
              a workspace, sample Operators, and default integrations so that first-time users can see Scores 
              in under a few minutes.
            </p>

            <h3>Launch Terminal Button</h3>
            <p>
              The "Launch Terminal" button is intended for returning users, taking them directly to the 
              authenticated NEUROX Terminal. This separation keeps the marketing funnel lightweight while 
              giving experienced operators a fast path to their control plane.
            </p>
          </section>

          {/* Security Section */}
          <section id="security" className="doc-section">
            <div className="doc-section-header">
              <h2>
                <Shield size={20} className="doc-section-icon" />
                Security and Compliance
              </h2>
              <button className="doc-copy-link" onClick={() => copyLink('security')}>
                {copiedId === 'security' ? <CheckCircle size={16} /> : <Copy size={16} />}
              </button>
            </div>

            <h3>Isolation and Sandbox</h3>
            <p>
              Operators execute in isolated sandboxes with no direct network or file-system access unless 
              explicitly granted via Integration adapters. Resource limits and timeouts prevent runaway 
              executions or denial-of-service scenarios.
            </p>

            <h3>Authentication and Authorization</h3>
            <p>
              All API requests to scoring endpoints require valid API keys or OAuth tokens. Role-based 
              access control (RBAC) ensures that only authorized users can create, modify, or delete 
              Operators, Pipelines, or Integrations.
            </p>

            <h3>Audit Logging</h3>
            <p>
              NEUROX records a full audit trail of configuration changes, deployments, and scoring requests 
              at a level suitable for compliance and incident investigations. Logs can be exported to external 
              SIEM tools for advanced monitoring and alerting.
            </p>
          </section>

          {/* Performance Section */}
          <section id="performance" className="doc-section">
            <div className="doc-section-header">
              <h2>
                <Gauge size={20} className="doc-section-icon" />
                Performance and Reliability
              </h2>
              <button className="doc-copy-link" onClick={() => copyLink('performance')}>
                {copiedId === 'performance' ? <CheckCircle size={16} /> : <Copy size={16} />}
              </button>
            </div>

            <h3>Latency Targets</h3>
            <p>
              The Scoring Engine is optimized for low-latency responses so that Operators can be used in 
              time-sensitive contexts. Cold start mitigation techniques, such as pre-warmed runtimes and 
              connection pooling, are employed where applicable.
            </p>

            <h3>Scalability</h3>
            <p>
              The Operator Runtime is horizontally scalable: as traffic increases, new worker instances are 
              provisioned automatically. Queue-based backpressure and retry mechanisms are used to handle 
              temporary spikes or downstream failures gracefully.
            </p>

            <h3>Observability</h3>
            <p>
              Built-in metrics, logs, and traces allow teams to understand Operator behavior and Pipeline 
              health. Dashboards provide visualizations for throughput, error rates, p95 and p99 latency, 
              and resource utilization.
            </p>
          </section>

          {/* Integrations Section */}
          <section id="integrations" className="doc-section">
            <div className="doc-section-header">
              <h2>
                <Plug size={20} className="doc-section-icon" />
                Integration Patterns
              </h2>
              <button className="doc-copy-link" onClick={() => copyLink('integrations')}>
                {copiedId === 'integrations' ? <CheckCircle size={16} /> : <Copy size={16} />}
              </button>
            </div>

            <h3>Webhooks</h3>
            <p>
              NEUROX can be configured to trigger webhooks when certain scoring conditions are met (for 
              example, Score crossing a threshold). Webhook payloads include the Score, context identifiers, 
              timestamp, and optional explanation metadata.
            </p>

            <h3>External APIs</h3>
            <p>
              Operators can call external APIs via the Integration Hub using API keys or OAuth credentials 
              stored in a secure vault. Common patterns include fetching market data, user behavior analytics, 
              or telemetry from connected systems.
            </p>

            <h3>Databases and Message Queues</h3>
            <p>
              NEUROX can read from and write to relational databases, time-series stores, or message queues. 
              This enables decoupled event-driven architectures where Operators react to events rather than 
              only synchronous requests.
            </p>
          </section>

          {/* Frontend Section */}
          <section id="frontend" className="doc-section">
            <div className="doc-section-header">
              <h2>
                <BoltIcon size={20} className="doc-section-icon" />
                Frontend and Branding
              </h2>
              <button className="doc-copy-link" onClick={() => copyLink('frontend')}>
                {copiedId === 'frontend' ? <CheckCircle size={16} /> : <Copy size={16} />}
              </button>
            </div>

            <h3>Visual Identity</h3>
            <p>
              The marketing site uses a high-contrast dark theme with a central "eye" or vortex visual 
              behind the main call-to-action. Primary CTAs include "Deploy Now" and "Start Scoring Now," 
              emphasizing velocity and competitive advantage.
            </p>

            <h3>Footer and Links</h3>
            <p>
              The footer includes protocol status messaging (for example, "All systems operational"), 
              documentation link, and social links such as X/Twitter and Telegram. These links serve as 
              the primary channels for community updates, incident communication, and launch announcements.
            </p>
          </section>

          {/* Roadmap Section */}
          <section id="roadmap" className="doc-section">
            <div className="doc-section-header">
              <h2>
                <Map size={20} className="doc-section-icon" />
                Roadmap
              </h2>
              <button className="doc-copy-link" onClick={() => copyLink('roadmap')}>
                {copiedId === 'roadmap' ? <CheckCircle size={16} /> : <Copy size={16} />}
              </button>
            </div>

            <p>Projects using NEUROX can adapt the following roadmap structure:</p>

            <div className="doc-roadmap">
              <div className="doc-roadmap-item">
                <div className="doc-roadmap-marker doc-roadmap-short"></div>
                <div className="doc-roadmap-content">
                  <h4>Short Term (0–3 months)</h4>
                  <p>Core Operator SDK, minimal Terminal, first integrations, and early adopters.</p>
                </div>
              </div>
              <div className="doc-roadmap-item">
                <div className="doc-roadmap-marker doc-roadmap-mid"></div>
                <div className="doc-roadmap-content">
                  <h4>Mid Term (3–9 months)</h4>
                  <p>Advanced Pipeline editor, detailed analytics, on-chain or on-ledger integrations if applicable.</p>
                </div>
              </div>
              <div className="doc-roadmap-item">
                <div className="doc-roadmap-marker doc-roadmap-long"></div>
                <div className="doc-roadmap-content">
                  <h4>Long Term (9+ months)</h4>
                  <p>Marketplace for Operators and Pipelines, community-contributed strategies, governance or token-based incentives where appropriate.</p>
                </div>
              </div>
            </div>
          </section>

          {/* FAQ Section */}
          <section id="faq" className="doc-section">
            <div className="doc-section-header">
              <h2>
                <HelpCircle size={20} className="doc-section-icon" />
                FAQ
              </h2>
              <button className="doc-copy-link" onClick={() => copyLink('faq')}>
                {copiedId === 'faq' ? <CheckCircle size={16} /> : <Copy size={16} />}
              </button>
            </div>

            <div className="doc-faq-list">
              <div className="doc-faq-item">
                <h4>What is NEUROX?</h4>
                <p>
                  NEUROX is an operator-based scoring and automation protocol that turns raw data into 
                  actionable decisions through modular Operators and Pipelines.
                </p>
              </div>
              <div className="doc-faq-item">
                <h4>Who is NEUROX for?</h4>
                <p>
                  NEUROX is designed for builders and power users who want a flexible, programmable way 
                  to score complex contexts and trigger automations without reinventing their own infrastructure.
                </p>
              </div>
              <div className="doc-faq-item">
                <h4>Is NEUROX tied to any specific industry?</h4>
                <p>
                  NEUROX is industry-agnostic by design; it can be used in trading, risk scoring, growth 
                  analytics, user segmentation, operations, and more, depending on which Operators are deployed.
                </p>
              </div>
              <div className="doc-faq-item">
                <h4>How do users get started?</h4>
                <p>
                  New users click "Start Scoring Now" or "Deploy Now" on the landing page, create a workspace 
                  in the Terminal, and deploy sample Operators and Pipelines provided in the onboarding flow.
                </p>
              </div>
              <div className="doc-faq-item">
                <h4>How is NEUROX different from traditional rule engines?</h4>
                <p>
                  Traditional rule engines are often monolithic and hard to evolve, whereas NEUROX structures 
                  logic into composable, versioned Operators with explicit scoring semantics and strong observability.
                </p>
              </div>
            </div>
          </section>

          {/* References Section */}
          <section id="references" className="doc-section">
            <div className="doc-section-header">
              <h2>
                <Link2 size={20} className="doc-section-icon" />
                References
              </h2>
              <button className="doc-copy-link" onClick={() => copyLink('references')}>
                {copiedId === 'references' ? <CheckCircle size={16} /> : <Copy size={16} />}
              </button>
            </div>

            <div className="doc-callout doc-callout-warning">
              <Shield size={16} />
              <p>
                The name "Neurox" and its variants are used by unrelated companies and products in healthcare, 
                AI assistants, and training programs. This documentation is exclusively for the NEUROX Protocol 
                automation project.
              </p>
            </div>

            <div className="doc-references-list">
              <div className="doc-reference-item">
                <ExternalLink size={16} />
                <div>
                  <a href="https://www.neurox-labs.com" target="_blank" rel="noopener noreferrer">
                    NEUROX | Proactive AI Assistant
                  </a>
                  <p>Proactive AI assistant that anticipates your needs.</p>
                </div>
              </div>
              <div className="doc-reference-item">
                <ExternalLink size={16} />
                <div>
                  <a href="https://play.google.com/store/apps/details?id=com.udhc.neurox" target="_blank" rel="noopener noreferrer">
                    NeuroX - Apps on Google Play
                  </a>
                  <p>AI-powered brain care & mental health companion.</p>
                </div>
              </div>
              <div className="doc-reference-item">
                <ExternalLink size={16} />
                <div>
                  <a href="https://www.neuroxperformance.com" target="_blank" rel="noopener noreferrer">
                    NeuroX Performance
                  </a>
                  <p>Science-backed cognitive performance training for athletes.</p>
                </div>
              </div>
            </div>
          </section>

          <footer className="footer-enhanced">
            <div className="footer-content-animated">
              <div className="footer-brand">
                <div className="logo-icon-glow small">
                  <img src="/neurox-logo.png" alt="NEUROX" className="logo-img" />
                </div>
                <span>NEUROX</span>
              </div>
              <p className="footer-copy">© 2026 NEUROX Protocol. All systems operational.</p>
              <div className="footer-links">
                <Link to="/docs">Documentation</Link>
                <a href="#">X / Twitter</a>
                <a href="#">Telegram</a>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </>
  );
}