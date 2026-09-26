import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { enableRefraction } from './ui/styles/GlassFilters'
import './ui/styles/tokens.css'
import './ui/styles/glass.css'
import './ui/styles/base.css'

enableRefraction()

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element in index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
