import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { Analytics } from '@vercel/analytics/react'
import { injectSpeedInsights } from '@vercel/speed-insights'
import { initToolbar } from '@21st-extension/toolbar'

// 2. Define your toolbar configuration
const stagewiseConfig = {
  plugins: [],
};

// 3. Initialize the toolbar when your app starts
function setupStagewise() {
  // Only initialize once and only in development mode
  // Using import.meta.env.DEV instead of process.env to ensure compatibility with Vite
  if (import.meta.env.DEV) {
    initToolbar(stagewiseConfig);
  }
}

// Call the setup function when appropriate for your framework
setupStagewise();

// Initialize Speed Insights
injectSpeedInsights()

const rootElement = document.getElementById('root')

if (!rootElement) {
  document.body.innerHTML = '<h1 style="color:red;text-align:center;margin-top:20vh">ROOT ELEMENT NOT FOUND</h1>'
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <App />
          <Analytics />
        </BrowserRouter>
      </ErrorBoundary>
    </React.StrictMode>
  )
}
