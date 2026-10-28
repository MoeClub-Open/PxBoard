import { ChallengeNotice, HumanChallenge, useHumanChallenge } from '../components/HumanChallenge'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, App, Button, Form, Input, Steps } from 'antd'
import { ArrowLeftOutlined, LockOutlined, MailOutlined } from '@ant-design/icons'
import { api, ApiError, errorText, useData } from '../api'
import type { AuthInfo } from './Register'
import type { User } from '../api'
import { loginDestination } from '../adminPath'

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
  const challenge = useHumanChallenge()
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
    if (
      !setup &&
      (challenge.loading ||
        (!challenge.policy && !!challenge.error) ||
        (challenge.required('login') && (!!challenge.error || !challenge.token)))
    ) {
      setError(challenge.error || '请先完成人机验证')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (setup) await api('/setup', { method: 'POST', body: { ...values, mode } })
      await api('/auth/login', {
        method: 'POST',
        body: { ...values, challengeToken: challenge.token },
      })
      if (setup) {
        try {
          await api('/mode', { method: 'POST', body: { mode } })
        } catch (e) {
          message.warning(`管理员账户已创建，功能安装需要重试：${errorText(e)}`)
        }
      }
      await onLogin()
      const redirect = query.get('redirect') || ''
      const user = await api<User>('/me')
      navigate(setup ? `${user.adminPath || '/admin'}/mode` : loginDestination(redirect, user), {
        replace: true,
      })
      if (setup) message.success('管理员账户已创建')
    } catch (e) {
      if (e instanceof ApiError && e.code === 'mfa_required') setMfa(true)
      setError(errorText(e))
    } finally {
      if (!setup) challenge.reset()
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
            {!setup && <ChallengeNotice loading={challenge.loading} error={challenge.error} />}
            {!setup &&
              challenge.policy &&
              (challenge.required('login') || challenge.required('oauth')) && (
                <HumanChallenge
                  policy={challenge.policy}
                  generation={challenge.generation}
                  onToken={challenge.setToken}
                  onError={challenge.setError}
                />
              )}
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={busy}
              disabled={!setup && challenge.loading}
            >
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
        {!setup && <OAuthButtons redirectPath={next || '/user'} challenge={challenge} />}
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
  const challenge = useHumanChallenge()
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
              if (
                request &&
                (challenge.loading ||
                  (!challenge.policy && !!challenge.error) ||
                  (challenge.required('reset') && (!!challenge.error || !challenge.token)))
              ) {
                setError(challenge.error || '请先完成人机验证')
                return
              }
              setBusy(true)
              setError('')
              try {
                await api(`/auth/${request ? 'reset-request' : 'reset'}`, {
                  method: 'POST',
                  body: { ...values, token: query.get('token'), challengeToken: challenge.token },
                })
                setDone(true)
              } catch (e) {
                setError(errorText(e))
              } finally {
                if (request) challenge.reset()
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
            {request && <ChallengeNotice loading={challenge.loading} error={challenge.error} />}
            {request && challenge.policy && challenge.required('reset') && (
              <HumanChallenge
                policy={challenge.policy}
                generation={challenge.generation}
                onToken={challenge.setToken}
                onError={challenge.setError}
              />
            )}
            <Button
              type="primary"
              block
              size="large"
              htmlType="submit"
              loading={busy}
              disabled={request && challenge.loading}
            >
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
