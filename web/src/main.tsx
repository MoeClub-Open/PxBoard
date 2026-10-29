import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './bundles.css'
import './theme.css'
import App from './App.tsx'
import { BrandingProvider } from './branding'
import { CurrencyProvider } from './currency'
import { PublicSiteProvider } from './publicSite'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PublicSiteProvider>
      <BrandingProvider>
        <CurrencyProvider>
          <App />
        </CurrencyProvider>
      </BrandingProvider>
    </PublicSiteProvider>
  </StrictMode>,
)
