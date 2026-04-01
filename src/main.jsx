import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

const rootElement = document.getElementById('root')

if (!rootElement) {
  document.body.innerHTML = '<h1 style="color:red;text-align:center;margin-top:20vh">ROOT ELEMENT NOT FOUND</h1>'
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </React.StrictMode>
  )
}
