import { useCallback, useEffect, useState } from 'react'

export type Row = Record<string, any>
export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'member'
  siteName: string
  mode: string
}
export interface Page {
  id: string
  title: string
  icon: string
  group: string
  roles: string[]
  surface?: 'admin' | 'portal'
  capability?: string
  shared?: { id: string; title: string; selectorLabel?: string }
}
export interface Plugin {
  id: string
  name: string
  version: string
  versionEpoch?: number
  buildRevision?: number
  description: string
  category: string
  author: string
  dependencies: Record<string, string>
  permissions: string[]
  pages: Page[]
  enabled: boolean
  error?: string
  sourceId: string
  sourceName?: string
  signed?: boolean
  summary?: boolean
  artifacts?: Record<string, string>
}
export interface Field {
  key: string
  label: string
  type?: string
  required?: boolean
  options?: { label: string; value: any }[]
  optionsEndpoint?: string
  default?: any
  hint?: string
  readOnly?: boolean
  when?: Record<string, string[]>
}
export interface Action {
  key: string
  label: string
  confirm?: string
  fields?: Field[]
  danger?: boolean
  endpoint?: string
  bind?: Record<string, string>
  when?: Record<string, string[]>
}
export interface Resource {
  singleton?: boolean
  pollIntervalSeconds?: number
  key: string
  title: string
  endpoint: string
  columns: Field[]
  fields?: Field[]
  createLabel?: string
  editable?: boolean
  deletable?: boolean
  actions?: Action[]
  empty?: string
}
export interface View {
  title: string
  notice?: string
  metrics?: { label: string; value: any; unit?: string }[]
  resources: Resource[]
}

export class ApiError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

export async function api<T = any>(
  path: string,
  options: { method?: string; body?: any; signal?: AbortSignal } = {},
): Promise<T> {
  const res = await fetch(path.startsWith('/api/') ? path : `/api/v1${path}`, {
    method: options.method || 'GET',
    credentials: 'same-origin',
    signal: options.signal,
    headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const json = await res.json().catch(() => null)
  if (res.status === 401 && !path.includes('/auth/'))
    window.dispatchEvent(new Event('px:unauthenticated'))
  if (!res.ok)
    throw new ApiError(json?.error?.message || `请求失败（${res.status}）`, json?.error?.code || '')
  if (!json || !('data' in json)) throw new Error('服务器返回格式有误')
  return json.data as T
}

export function useData<T>(path: string | null, pollIntervalSeconds = 0) {
  const [data, setData] = useState<T | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion((v) => v + 1), [])
  useEffect(() => {
    if (!path || !pollIntervalSeconds) return
    const controller = new AbortController()
    const timer = setInterval(() => {
      if (!document.hidden)
        api<T>(path, { signal: controller.signal })
          .then((value) => {
            if (!controller.signal.aborted) {
              setData(value)
              setError('')
            }
          })
          .catch((e) => {
            if (e.name !== 'AbortError') setError(e.message)
          })
    }, pollIntervalSeconds * 1000)
    return () => {
      clearInterval(timer)
      controller.abort()
    }
  }, [path, pollIntervalSeconds])
  useEffect(() => {
    if (!path) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setData(undefined)
    api<T>(path, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [path, version])
  return { data, loading, error, reload }
}
export const errorText = (e: unknown) => (e instanceof Error ? e.message : '操作失败')
export const absoluteURL = (value: string) => new URL(value, window.location.origin).toString()

export function redirectToPayment(value: unknown) {
  let url: URL
  try {
    url = new URL(String(value))
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error()
  } catch {
    throw new Error('支付地址无效，请重试')
  }
  window.location.assign(url.href)
}

export function configurationChanged() {
  window.dispatchEvent(new Event('px:configuration-changed'))
  try {
    localStorage.setItem('px:configuration-change', String(Date.now()))
  } catch {}
}
