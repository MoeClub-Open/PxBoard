import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert, Button, Form, Input, Spin } from 'antd'
import { Brand } from '../components/Brand'
import { oauthFlowKey } from '../components/OAuthButtons'
import type { OAuthFlow } from '../components/OAuthButtons'
import { api, ApiError, errorText } from '../api'

export default function OAuthComplete({ onLogin }: { onLogin: () => Promise<void> }) {
  const navigate = useNavigate()
  const started = useRef(false)
  const completed = useRef<{ redirectPath: string } | null>(null)
  const [callback] = useState(() => {
    const query = new URLSearchParams(window.location.search)
    let flow: OAuthFlow | null = null
    try {
      flow = JSON.parse(sessionStorage.getItem(oauthFlowKey) || 'null')
    } catch {}
    return {
      ticket: query.get('ticket'),
      mode: query.get('mode') || 'login',
      error: query.get('error'),
      flow,
    }
  })
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [mfa, setMfa] = useState(false)
  async function complete(code?: string) {
    const { ticket, flow } = callback
    if (
      callback.error ||
      !ticket ||
      !flow ||
      flow.purpose !== callback.mode ||
      Date.now() - flow.createdAt > 15 * 60_000
    ) {
      setError(callback.error || '登录请求已失效，请返回后重试')
      setBusy(false)
      return
    }
    setBusy(true)
    setError('')
    try {
      if (!completed.current) {
        if (callback.mode === 'bind') {
          await api('/extensions/oauth/complete-binding', {
            method: 'POST',
            body: { ticket, proof: flow.proof },
          })
          completed.current = { redirectPath: flow.redirectPath }
        } else {
          completed.current = await api<{ redirectPath: string }>('/auth/external/complete', {
            method: 'POST',
            body: { ticket, proof: flow.proof, code },
          })
        }
      }
      if (callback.mode !== 'bind') await onLogin()
      sessionStorage.removeItem(oauthFlowKey)
      const redirect = completed.current?.redirectPath || '/user'
      navigate(
        /^\/user(?:\/|\?|$)/.test(redirect) || redirect === '/account' ? redirect : '/user',
        { replace: true },
      )
    } catch (e) {
      if (e instanceof ApiError && e.code === 'mfa_required') setMfa(true)
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    if (started.current) return
    started.current = true
    window.history.replaceState(window.history.state, '', window.location.pathname)
    void complete()
  }, [])
  const accountPath = callback.flow?.redirectPath === '/user/account' ? '/user/account' : '/account'
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <Link to="/">
          <Brand />
        </Link>
      </div>
      <div className="auth-form">
        <h1>{callback.mode === 'bind' ? '绑定登录方式' : '正在登录'}</h1>
        {busy && !mfa && <Spin />}
        {error && <Alert type="error" title={error} showIcon className="page-notice" />}
        {mfa && (
          <Form layout="vertical" onFinish={(values) => complete(values.code)}>
            <Form.Item
              name="code"
              label="动态验证码"
              rules={[{ required: true, len: 6, message: '请输入 6 位验证码' }]}
            >
              <Input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                size="large"
              />
            </Form.Item>
            <Button type="primary" block size="large" htmlType="submit" loading={busy}>
              完成登录
            </Button>
          </Form>
        )}
        {!busy && error && !mfa && completed.current && (
          <Button block onClick={() => void complete()}>
            重试
          </Button>
        )}
        {!busy && (
          <div className="auth-links">
            <Link to={callback.mode === 'bind' ? accountPath : '/login'}>
              {callback.mode === 'bind' ? '返回我的账户' : '返回登录'}
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
