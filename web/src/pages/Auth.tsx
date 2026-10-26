import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, App, Button, Form, Input, Steps } from 'antd'
import { ArrowLeftOutlined, LockOutlined, MailOutlined } from '@ant-design/icons'
import { api, ApiError, errorText, useData } from '../api'
import type { AuthInfo } from './Register'

import { Brand } from '../components/Brand'
import { OAuthButtons } from '../components/OAuthButtons'
import { useBrand, useBrandTitle } from '../branding'
export default function Auth({
  setup = false,
  onLogin,
}: {
  setup?: boolean
  onLogin: () => Promise<void>
}) {
  const { name } = useBrand()
  useBrandTitle(setup ? '初始化' : '登录')
  const { data: auth } = useData<AuthInfo>('/setup')
  const { message } = App.useApp()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [mfa, setMfa] = useState(false)
  const [mode, setMode] = useState('personal')
  const [step, setStep] = useState(0)
  const [query] = useSearchParams()
  const next = query.get('redirect') || ''
  const registerPath = /^\/user(?:\/|\?|$)/.test(next)
    ? `/register?redirect=${encodeURIComponent(next)}`
    : '/register'
  const navigate = useNavigate()
  async function submit(values: any) {
    setBusy(true)
    setError('')
    try {
      if (setup) await api('/setup', { method: 'POST', body: { ...values, mode } })
      await api('/auth/login', { method: 'POST', body: values })
      if (setup) {
        try {
          await api('/mode', { method: 'POST', body: { mode } })
        } catch (e) {
          message.warning(`管理员账户已创建，功能安装需要重试：${errorText(e)}`)
        }
      }
      await onLogin()
      const redirect = query.get('redirect') || ''
      navigate(setup ? '/mode' : /^\/user(?:\/|\?|$)/.test(redirect) ? redirect : '/', {
        replace: true,
      })
      if (setup) message.success('管理员账户已创建')
    } catch (e) {
      if (e instanceof ApiError && e.code === 'mfa_required') setMfa(true)
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <Link to="/">
          <Brand />
        </Link>
      </div>
      <div className="auth-form">
        <div className="eyebrow">{setup ? '欢迎使用' : '控制台'}</div>
        <h1>{setup ? '创建你的工作空间' : `登录 ${name}`}</h1>
        {setup && (
          <Steps
            size="small"
            current={step}
            items={[{ title: '使用方式' }, { title: '管理员账户' }]}
            className="setup-steps"
          />
        )}
        {error && <Alert type="error" title={error} showIcon className="page-notice" />}
        {setup && step === 0 ? (
          <>
            <div className="mode-options">
              {[
                { id: 'personal', name: '自用', text: '管理自己的节点与订阅' },
                { id: 'sharing', name: '公益 / 分享', text: '用户注册、兑换码与独立订阅' },
                { id: 'business', name: '商业运营', text: '套餐、订单、支付与用户服务' },
              ].map((item) => (
                <button
                  key={item.id}
                  className={mode === item.id ? 'mode-option selected' : 'mode-option'}
                  onClick={() => setMode(item.id)}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.text}</small>
                  </span>
                  <span className="mode-radio" />
                </button>
              ))}
            </div>
            <Button type="primary" block size="large" onClick={() => setStep(1)}>
              继续
            </Button>
          </>
        ) : (
          <Form layout="vertical" onFinish={submit} requiredMark={false}>
            {setup && (
              <Form.Item name="name" label="姓名" initialValue="管理员">
                <Input size="large" autoComplete="name" />
              </Form.Item>
            )}
            <Form.Item
              name="email"
              label="邮箱"
              rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}
            >
              <Input size="large" prefix={<MailOutlined />} autoComplete="email" />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[
                {
                  required: true,
                  min: setup ? 10 : 1,
                  message: setup ? '密码至少 10 位' : '请输入密码',
                },
              ]}
            >
              <Input.Password
                size="large"
                prefix={<LockOutlined />}
                autoComplete={setup ? 'new-password' : 'current-password'}
              />
            </Form.Item>
            {mfa && (
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
            )}
            <Button type="primary" htmlType="submit" size="large" block loading={busy}>
              {setup ? '创建账户并安装功能' : '登录'}
            </Button>
            {setup ? (
              <Button type="link" block onClick={() => setStep(0)} icon={<ArrowLeftOutlined />}>
                返回
              </Button>
            ) : (
              <div className="auth-links">
                {!!auth?.registration?.length && <Link to={registerPath}>注册</Link>}
                {auth?.passwordReset && <Link to="/forgot">忘记密码</Link>}
              </div>
            )}
          </Form>
        )}
        {!setup && <OAuthButtons redirectPath={/^\/user(?:\/|\?|$)/.test(next) ? next : '/user'} />}
      </div>
      <footer className="auth-footer">
        {name} <span>© {new Date().getFullYear()}</span>
      </footer>
    </div>
  )
}

export { default as Register } from './Register'
export function Reset({ request = false }: { request?: boolean }) {
  useBrandTitle(request ? '找回密码' : '设置新密码')
  const [query] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <Brand />
      </div>
      <div className="auth-form">
        <h1>{request ? '找回密码' : '设置新密码'}</h1>
        {error && <Alert type="error" title={error} showIcon className="page-notice" />}
        {done ? (
          <Alert
            type="success"
            title={request ? '如果该邮箱可用，将收到密码重置邮件' : '密码已更新，请重新登录'}
            showIcon
          />
        ) : (
          <Form
            layout="vertical"
            onFinish={async (values) => {
              setBusy(true)
              setError('')
              try {
                await api(`/auth/${request ? 'reset-request' : 'reset'}`, {
                  method: 'POST',
                  body: { ...values, token: query.get('token') },
                })
                setDone(true)
              } catch (e) {
                setError(errorText(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            {request ? (
              <Form.Item
                name="email"
                label="邮箱"
                rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}
              >
                <Input size="large" type="email" />
              </Form.Item>
            ) : (
              <Form.Item
                name="password"
                label="新密码"
                rules={[{ required: true, min: 10, message: '密码至少 10 位' }]}
              >
                <Input.Password size="large" autoComplete="new-password" />
              </Form.Item>
            )}
            <Button type="primary" block size="large" htmlType="submit" loading={busy}>
              {request ? '发送重置邮件' : '更新密码'}
            </Button>
          </Form>
        )}
        <div className="auth-links">
          <Link to="/login">
            <ArrowLeftOutlined /> 返回登录
          </Link>
        </div>
      </div>
    </div>
  )
}
