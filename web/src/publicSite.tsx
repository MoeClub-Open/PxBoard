import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from './api'
import type { Row } from './api'

export interface PublicDocument {
  mode: string
  initialized: boolean
  available: boolean
  registrationOpen: boolean
  baseUrl: string
  site: {
    name: string
    title: string
    description: string
    logoUrl: string
    faviconUrl: string
    imageUrl: string
    indexable: boolean
    html?: string
    renderer?: string
    data?: Row
  }
}
export function initialPublicSite(): PublicDocument | undefined {
  const element = document.getElementById('px-public-site')
  if (!element?.textContent) return undefined
  try {
    return JSON.parse(element.textContent) as PublicDocument
  } catch {
    return undefined
  }
}
const PublicSiteContext = createContext<{
  data?: PublicDocument
  error: string
  reload: () => Promise<void>
}>({ error: '', reload: async () => {} })
export function PublicSiteProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState(initialPublicSite)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    try {
      setData(await api<PublicDocument>('/site'))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '站点信息读取失败')
    }
  }, [])
  useEffect(() => {
    if (!initialPublicSite()) void reload()
    const update = () => void reload()
    window.addEventListener('px:configuration-changed', update)
    window.addEventListener('focus', update)
    return () => {
      window.removeEventListener('px:configuration-changed', update)
      window.removeEventListener('focus', update)
    }
  }, [reload])
  return (
    <PublicSiteContext.Provider value={{ data, error, reload }}>
      {children}
    </PublicSiteContext.Provider>
  )
}
export const usePublicSite = () => useContext(PublicSiteContext)
export function DocumentMetadata() {
  const { data } = usePublicSite()
  const { pathname } = useLocation()
  useEffect(() => {
    const home = pathname === '/' && data?.available
    function meta(attribute: string, key: string, content: string) {
      let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
      if (!tag) {
        tag = document.createElement('meta')
        tag.setAttribute(attribute, key)
        document.head.append(tag)
      }
      tag.content = content
    }
    meta('name', 'robots', home && data?.site.indexable ? 'index, follow' : 'noindex, nofollow')
    meta('name', 'description', home ? data.site.description : '')
    document.head.querySelector('link[rel="canonical"]')?.remove()
    document.head
      .querySelectorAll(
        'meta[property^="og:"],meta[name^="twitter:"],script[type="application/ld+json"]',
      )
      .forEach((element) => element.remove())
    if (!home) return
    document.title = data.site.title
    if (data.baseUrl) {
      const canonical = document.createElement('link')
      canonical.rel = 'canonical'
      canonical.href = data.baseUrl + '/'
      document.head.append(canonical)
      meta('property', 'og:url', data.baseUrl + '/')
      const schema = document.createElement('script')
      schema.type = 'application/ld+json'
      schema.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: data.site.name,
        url: data.baseUrl + '/',
        description: data.site.description,
      })
      document.head.append(schema)
    }
    meta('property', 'og:type', 'website')
    meta('property', 'og:site_name', data.site.name)
    meta('property', 'og:title', data.site.title)
    meta('property', 'og:description', data.site.description)
    meta('name', 'twitter:card', data.site.imageUrl ? 'summary_large_image' : 'summary')
    meta('name', 'twitter:title', data.site.title)
    meta('name', 'twitter:description', data.site.description)
    if (data.site.imageUrl) {
      meta('property', 'og:image', data.site.imageUrl)
      meta('name', 'twitter:image', data.site.imageUrl)
    }
  }, [data, pathname])
  return null
}
