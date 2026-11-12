import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert, Button, Form, Input, Spin, Typography } from 'antd'
import { AppearanceButton } from '../appearance'
import { Brand } from '../components/Brand'
import { oauthFlowKey } from '../components/OAuthButtons'
import type { OAuthFlow } from '../components/OAuthButtons'
import { ApiError, errorText, rpc } from '../api'
import type { User } from '../api'
import { loginDestination } from '../adminPath'

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
      nativeClient: query.get('native') === '1',
      error: query.get('error'),
      flow,
    }
  })
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [mfa, setMfa] = useState(false)
  const [nativeDone, setNativeDone] = useState(false)
  const [registration, setRegistration] = useState<{
    providerName: string
    displayName: string
    expiresAt: string
  } | null>(null)
  const loginTicket = useRef(callback.mode === 'login' ? callback.ticket : null)
  function validCallback() {
    const { ticket, flow } = callback
    return (
      !callback.error &&
      !!ticket &&
      !!flow &&
      flow.purpose === (callback.mode === 'register' ? 'login' : callback.mode)
    )
  }
  async function complete(code?: string) {
    const { ticket, flow } = callback
    if (!validCallback() || !flow) {
      setError(callback.error || '登录请求已失效，请返回后重试')
      setBusy(false)
      return
    }
    setBusy(true)
    setError('')
    try {
      if (callback.mode === 'register' && !loginTicket.current) {
        setRegistration(await rpc('oauth/registration', { ticket, proof: flow.proof }))
        return
      }
      if (!completed.current) {
        if (callback.mode === 'bind') {
          await rpc('oauth/completeBinding', { ticket, proof: flow.proof })
          completed.current = { redirectPath: flow.redirectPath }
        } else {
          completed.current = await rpc<{ redirectPath: string }>('core/auth.externalComplete', {
            ticket: loginTicket.current,
            proof: flow.proof,
            code,
          })
        }
      }
      if (callback.mode !== 'bind') await onLogin()
      sessionStorage.removeItem(oauthFlowKey)
      const user = await rpc<User>('core/account.me')
      const redirect =
        callback.mode === 'bind'
          ? '/user/account'
          : flow.redirectPath || completed.current?.redirectPath || '/user'
      navigate(loginDestination(redirect, user), { replace: true })
    } catch (e) {
      if (e instanceof ApiError && e.code === 'mfa_required') setMfa(true)
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  async function register(values: { email: string; password: string }) {
    if (!validCallback() || !callback.flow) {
      setError('注册请求已失效，请返回后重试')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (!loginTicket.current) {
        const result = await rpc<{ ticket: string }>('oauth/completeRegistration', {
          ticket: callback.ticket,
          proof: callback.flow.proof,
          ...values,
        })
        loginTicket.current = result.ticket
        setRegistration(null)
      }
      await complete()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    if (started.current) return
    started.current = true
    window.history.replaceState(window.history.state, '', window.location.pathname)
    if (callback.nativeClient) {
      if (callback.error) setError(callback.error)
      else setNativeDone(true)
      setBusy(false)
      return
    }
    void complete()
  }, [])
  return (
    <div className="auth-page">
      <header className="auth-header">
        <Link to="/">
          <Brand />
        </Link>
        <AppearanceButton />
      </header>
      <main className="auth-form">
        <h1>
          {callback.mode === 'bind'
            ? '绑定登录方式'
            : callback.mode === 'register' && !loginTicket.current
              ? '完成注册'
              : '正在登录'}
        </h1>
        {busy && !mfa && <Spin />}
        {nativeDone && (
          <Alert
            type="success"
            title="第三方账号授权已提交，请返回客户端完成绑定"
            showIcon
            className="page-notice"
          />
        )}
        {error && <Alert type="error" title={error} showIcon className="page-notice" />}
        {registration && !loginTicket.current && (
          <>
            <Typography.Paragraph type="secondary">
              {registration.providerName}
              {registration.displayName && ` · ${registration.displayName}`}
            </Typography.Paragraph>
            <Form layout="vertical" onFinish={register} requiredMark={false}>
              <Form.Item
                name="email"
                label="邮箱"
                rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}
              >
                <Input type="email" autoComplete="email" />
              </Form.Item>
              <Form.Item
                name="password"
                label="登录密码"
                rules={[{ required: true, min: 10, message: '密码至少 10 位' }]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Button type="primary" block htmlType="submit" loading={busy}>
                创建账户并登录
              </Button>
            </Form>
          </>
        )}
        {mfa && (
          <Form layout="vertical" onFinish={(values) => complete(values.code)}>
            <Form.Item
              name="code"
              label="动态验证码"
              rules={[{ required: true, len: 6, message: '请输入 6 位验证码' }]}
            >
              <Input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
            </Form.Item>
            <Button type="primary" block htmlType="submit" loading={busy}>
              完成登录
            </Button>
          </Form>
        )}
        {!busy &&
          !callback.nativeClient &&
          error &&
          !mfa &&
          (completed.current || loginTicket.current || !registration) && (
            <Button block onClick={() => void complete()}>
              重试
            </Button>
          )}
        {!busy && !callback.nativeClient && (
          <div className="auth-links">
            <Link to={callback.mode === 'bind' ? '/user/account' : '/login'}>
              {callback.mode === 'bind' ? '返回我的账户' : '返回登录'}
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
