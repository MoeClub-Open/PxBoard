import { useCallback, useEffect, useState } from 'react'

export type Row = Record<string, any>
export interface User {
  needsOnboarding?: boolean
  id: string
  email: string
  name: string
  role: 'admin' | 'member'
  siteName: string
  mode: string
  adminPath?: string
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
  optionsSearch?: boolean
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
  filters?: Field[]
  settings?: { title: string; endpoint: string; fields: Field[] }
  paginated?: boolean
  renderer?: string
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

export interface BatchCall {
  key: string
  service: string
  method: string
  input?: Record<string, any>
}

export interface BatchItemResult<T = any> {
  status: number
  data?: T
  error?: { code?: string; message?: string }
}

export class ApiError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

function splitTarget(
  target: string,
  input?: Record<string, any>,
): { service: string; method: string; payload: Record<string, any> } {
  const qIndex = target.indexOf('?')
  const rawTarget = qIndex >= 0 ? target.slice(0, qIndex) : target
  const search = qIndex >= 0 ? target.slice(qIndex + 1) : ''
  const slash = rawTarget.indexOf('/')
  if (slash <= 0 || slash === rawTarget.length - 1) {
    throw new Error(`无效的 RPC 目标：${target}`)
  }
  const service = rawTarget.slice(0, slash).trim()
  const method = rawTarget.slice(slash + 1).trim().replaceAll('/', '.')
  const payload: Record<string, any> = {}
  if (search) {
    const params = new URLSearchParams(search)
    params.forEach((value, key) => {
      if (value !== '') payload[key] = value
    })
  }
  if (input) {
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) payload[key] = value
    }
  }
  return { service, method, payload }
}

export function pluginResourceTarget(
  pluginId: string,
  endpoint: string,
  verb?: string,
  extra?: Record<string, any>,
): { target: string; input: Record<string, any> } {
  const qIndex = endpoint.indexOf('?')
  const rawPath = qIndex >= 0 ? endpoint.slice(0, qIndex) : endpoint
  const search = qIndex >= 0 ? endpoint.slice(qIndex + 1) : ''
  const input: Record<string, any> = {}
  if (search) {
    const params = new URLSearchParams(search)
    params.forEach((value, key) => {
      if (value !== '') input[key] = value
    })
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined) input[key] = value
    }
  }
  if (rawPath.startsWith('/')) {
    const resource = rawPath.replace(/^\/+|\/+$/g, '').replaceAll('/', '.')
    const method = verb ? `${resource}.${verb}` : resource
    return { target: `${pluginId}/${method}`, input }
  }
  return { target: rawPath, input }
}

export async function rpc<T = any>(
  target: string,
  input?: Record<string, any>,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const { service, method, payload } = splitTarget(target, input)
  const res = await fetch(`/rpc/v1/${encodeURIComponent(service)}/${method}`, {
    method: 'POST',
    credentials: 'same-origin',
    signal: options.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await res.json().catch(() => null)
  if (res.status === 401 && !(service === 'core' && method.startsWith('auth.')))
    window.dispatchEvent(new Event('px:unauthenticated'))
  if (!res.ok)
    throw new ApiError(json?.error?.message || `请求失败（${res.status}）`, json?.error?.code || '')
  if (!json || !('data' in json)) throw new Error('服务器返回格式有误')
  return json.data as T
}

export async function rpcBatch(
  calls: BatchCall[],
  options: { signal?: AbortSignal } = {},
): Promise<Record<string, BatchItemResult>> {
  const res = await fetch('/rpc/v1/$batch', {
    method: 'POST',
    credentials: 'same-origin',
    signal: options.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      calls: calls.map((call) => ({
        key: call.key,
        service: call.service,
        method: call.method,
        input: call.input || {},
      })),
    }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok)
    throw new ApiError(json?.error?.message || `请求失败（${res.status}）`, json?.error?.code || '')
  if (!json || !('data' in json)) throw new Error('服务器返回格式有误')
  return json.data as Record<string, BatchItemResult>
}

export function useRpc<T>(
  target: string | null,
  input?: Record<string, any>,
  pollIntervalSeconds = 0,
) {
  const [data, setData] = useState<T | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const serializedInput = input ? JSON.stringify(input) : ''
  const reload = useCallback(() => setVersion((v) => v + 1), [])
  useEffect(() => {
    if (!target || !pollIntervalSeconds) return
    const controller = new AbortController()
    const parsedInput = serializedInput
      ? (JSON.parse(serializedInput) as Record<string, any>)
      : undefined
    const timer = setInterval(() => {
      if (!document.hidden)
        rpc<T>(target, parsedInput, { signal: controller.signal })
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
  }, [target, serializedInput, pollIntervalSeconds])
  useEffect(() => {
    if (!target) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    const parsedInput = serializedInput
      ? (JSON.parse(serializedInput) as Record<string, any>)
      : undefined
    setLoading(true)
    setError('')
    setData(undefined)
    rpc<T>(target, parsedInput, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [target, serializedInput, version])
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
