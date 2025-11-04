import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'bootstrap/dist/css/bootstrap.min.css'
import './index.css'
import App from './App.jsx'

if (typeof window !== 'undefined' && window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
  try {
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__
    hook.isDisabled = true
    hook.inject = () => ({})
    hook.onCommitFiberRoot = () => {}
    hook.onCommitFiberUnmount = () => {}
  } catch (err) {
    try {
      delete window.__REACT_DEVTOOLS_GLOBAL_HOOK__
    } catch {
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = undefined
    }
    console.warn('React DevTools hook disabled with fallback', err)
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
