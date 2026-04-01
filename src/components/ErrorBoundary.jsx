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
          background: '#0a0a0a',
          color: '#fff',
          fontFamily: 'monospace',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <h1 style={{ fontSize: '2rem', color: '#ef4444', marginBottom: '1rem' }}>
            CRITICAL ERROR
          </h1>
          <p style={{ color: '#f59e0b', marginBottom: '1.5rem' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <pre style={{ color: '#888', fontSize: '0.8rem', maxWidth: '600px', overflow: 'auto' }}>
            {this.state.errorInfo?.componentStack || 'No stack trace'}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#10b981',
              border: 'none',
              color: '#000',
              cursor: 'pointer',
              marginTop: '1rem'
            }}
          >
            RELOAD
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
