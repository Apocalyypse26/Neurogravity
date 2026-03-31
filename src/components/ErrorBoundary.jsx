import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error('[ERROR BOUNDARY]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)',
          color: '#fff',
          fontFamily: 'monospace',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <h1 style={{ 
            fontSize: '2rem', 
            color: '#ef4444', 
            marginBottom: '1rem',
            textShadow: '0 0 10px #ef4444'
          }}>
            [CRITICAL ERROR]
          </h1>
          <p style={{ 
            color: '#f59e0b', 
            marginBottom: '1.5rem',
            maxWidth: '600px'
          }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'transparent',
              border: '2px solid #10b981',
              color: '#10b981',
              fontFamily: 'monospace',
              fontSize: '1rem',
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
            onMouseOver={(e) => {
              e.target.style.background = '#10b981';
              e.target.style.color = '#000';
            }}
            onMouseOut={(e) => {
              e.target.style.background = 'transparent';
              e.target.style.color = '#10b981';
            }}
          >
            [RELOAD TERMINAL]
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
