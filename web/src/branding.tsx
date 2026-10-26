import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api, ApiError } from './api'

interface BrandConfig {
  name: string
  logoUrl: string
  faviconUrl: string
}

const defaults: BrandConfig = { name: 'PxBoard', logoUrl: '', faviconUrl: '' }
const BrandingContext = createContext({ ...defaults, reload: async () => {} })

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [fallbackName, setFallbackName] = useState(defaults.name)
  const [custom, setCustom] = useState<Partial<BrandConfig>>({})
  const previousName = useRef(defaults.name)
  const reload = useCallback(async () => {
    const [setup, branding] = await Promise.allSettled([
      api<{ name?: string }>('/setup'),
      api<BrandConfig>('/extensions/branding/public'),
    ])
    if (setup.status === 'fulfilled') setFallbackName(setup.value.name || defaults.name)
    if (branding.status === 'fulfilled') setCustom(branding.value)
    else if (branding.reason instanceof ApiError && branding.reason.code === 'Not Found')
      setCustom({})
  }, [])
  const brand = {
    name: custom.name || fallbackName,
    logoUrl: custom.logoUrl || '',
    faviconUrl: custom.faviconUrl || '',
    reload,
  }
  useEffect(() => {
    void reload()
    const refresh = () => void reload()
    window.addEventListener('px:configuration-changed', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('px:configuration-changed', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [reload])
  useEffect(() => {
    if (document.title === defaults.name || document.title === previousName.current)
      document.title = brand.name
    previousName.current = brand.name
    let favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    if (!favicon) {
      favicon = document.createElement('link')
      favicon.rel = 'icon'
      document.head.append(favicon)
    }
    favicon.href = brand.faviconUrl || '/favicon.svg'
    favicon.type = brand.faviconUrl ? '' : 'image/svg+xml'
  }, [brand.name, brand.faviconUrl])
  return <BrandingContext.Provider value={brand}>{children}</BrandingContext.Provider>
}

export const useBrand = () => useContext(BrandingContext)

export function useBrandTitle(title?: string) {
  const { name } = useBrand()
  useEffect(() => {
    document.title = title ? `${title} · ${name}` : name
  }, [name, title])
}
