import { useEffect, useRef, useState } from 'react'
import { Alert, Spin } from 'antd'
import { api, errorText } from '../api'

type Provider = 'turnstile' | 'hcaptcha' | 'recaptcha'
type Action = 'login' | 'register' | 'reset' | 'oauth'
type Policy = {
  enabled: boolean
  provider: Provider
  siteKey: string
  login: boolean
  register: boolean
  reset: boolean
}
type Widget = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string | number
  reset: (id: string | number) => void
  remove?: (id: string | number) => void
}

const scripts: Record<Provider, string> = {
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/api.js',
  hcaptcha: 'https://js.hcaptcha.com/1/api.js',
  recaptcha: 'https://www.recaptcha.net/recaptcha/api.js',
}
const names: Record<Provider, string> = {
  turnstile: 'turnstile',
  hcaptcha: 'hcaptcha',
  recaptcha: 'grecaptcha',
}
const pending = new Map<Provider, Promise<Widget>>()
function load(provider: Provider): Promise<Widget> {
  const existing = pending.get(provider)
  if (existing) return existing
  const promise = new Promise<Widget>((resolve, reject) => {
    const globals = window as unknown as Record<string, unknown>
    const available = globals[names[provider]] as Widget | undefined
    if (available?.render) {
      resolve(available)
      return
    }
    const callback = `pxChallengeReady_${provider}`
    const script = document.createElement('script')
    const timer = window.setTimeout(() => fail(), 20000)
    function fail() {
      window.clearTimeout(timer)
      delete globals[callback]
      script.remove()
      pending.delete(provider)
      reject(new Error('人机验证加载失败，请检查网络后刷新页面'))
    }
    globals[callback] = () => {
      window.clearTimeout(timer)
      delete globals[callback]
      const widget = globals[names[provider]] as Widget | undefined
      if (widget?.render) resolve(widget)
      else fail()
    }
    script.onerror = fail
    script.async = true
    script.src = `${scripts[provider]}?onload=${callback}&render=explicit`
    document.head.appendChild(script)
  })
  pending.set(provider, promise)
  return promise
}

export function useHumanChallenge() {
  const [policy, setPolicy] = useState<Policy>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [token, setToken] = useState('')
  const [generation, setGeneration] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    api<Policy>('/auth/challenge', { signal: controller.signal })
      .then(setPolicy)
      .catch((e) => {
        if (e.name !== 'AbortError') setError(errorText(e))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])
  function required(action: Action) {
    if (!policy?.enabled) return false
    return action === 'oauth' ? policy.login || policy.register : !!policy[action]
  }
  function reset() {
    setToken('')
    setGeneration((v) => v + 1)
  }
  return { policy, loading, error, setError, token, setToken, generation, required, reset }
}

export function HumanChallenge({
  policy,
  generation,
  onToken,
  onError,
}: {
  policy: Policy
  generation: number
  onToken: (token: string) => void
  onError: (error: string) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const widget = useRef<{ api: Widget; id: string | number } | undefined>(undefined)
  const callbacks = useRef({ onToken, onError })
  callbacks.current = { onToken, onError }
  useEffect(() => {
    let canceled = false
    load(policy.provider)
      .then((api) => {
        if (canceled || !container.current) return
        const id = api.render(container.current, {
          sitekey: policy.siteKey,
          callback: (token: string) => {
            callbacks.current.onToken(token)
            callbacks.current.onError('')
          },
          'expired-callback': () => {
            callbacks.current.onToken('')
            callbacks.current.onError('验证已过期，请重新验证')
            if (widget.current) widget.current.api.reset(widget.current.id)
          },
          'error-callback': () => {
            callbacks.current.onToken('')
            callbacks.current.onError('验证失败，请检查网络后重试')
          },
        })
        widget.current = { api, id }
      })
      .catch((error) => {
        if (!canceled) callbacks.current.onError(errorText(error))
      })
    return () => {
      canceled = true
      if (widget.current) {
        if (widget.current.api.remove) widget.current.api.remove(widget.current.id)
        else widget.current.api.reset(widget.current.id)
        widget.current = undefined
      }
      container.current?.replaceChildren()
    }
  }, [policy.provider, policy.siteKey])
  useEffect(() => {
    if (generation && widget.current) widget.current.api.reset(widget.current.id)
  }, [generation])
  return <div ref={container} className="page-notice" />
}

export function ChallengeNotice({ loading, error }: { loading: boolean; error: string }) {
  if (loading) return <Spin size="small" />
  return error ? <Alert type="error" title={error} showIcon className="page-notice" /> : null
}
