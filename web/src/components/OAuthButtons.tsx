import type { useHumanChallenge } from './HumanChallenge'
import { useEffect, useRef, useState } from 'react'
import { Alert, App, Button, Empty, Form, Input, Space, Spin, Typography } from 'antd'
import { GithubOutlined, GoogleOutlined, LinkOutlined } from '@ant-design/icons'
import { errorText, rpc } from '../api'

interface Provider {
  id: string
  name: string
  kind: string
  allowRegistration?: boolean
}
interface Binding {
  id: string
  providerId: string
  providerName: string
  displayName: string
  createdAt: string
  requiresPassword: boolean
}
export interface OAuthFlow {
  proof: string
  purpose: 'login' | 'bind'
  redirectPath: string
  createdAt: number
}
export const oauthFlowKey = 'px-oauth-flow'

export function OAuthButtons({
  purpose = 'login',
  redirectPath = '/user',
  registration = false,
  exclude = [],
  challenge,
  preferredProviderId = '',
}: {
  purpose?: 'login' | 'bind'
  redirectPath?: string
  registration?: boolean
  exclude?: string[]
  challenge?: ReturnType<typeof useHumanChallenge>
  preferredProviderId?: string
}) {
  const [providers, setProviders] = useState<Provider[]>([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const automaticStarted = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    rpc<Provider[]>('oauth/providers.list', undefined, { signal: controller.signal })
      .then(setProviders)
      .catch(() => {})
    return () => controller.abort()
  }, [])
  const available = providers.filter(
    (provider) => !exclude.includes(provider.id) && (!registration || provider.allowRegistration),
  )
  async function authorize(provider: Provider) {
    if (
      purpose === 'login' &&
      challenge &&
      (challenge.loading ||
        (!challenge.policy && !!challenge.error) ||
        (challenge.required('oauth') && (!!challenge.error || !challenge.token)))
    ) {
      setError(challenge.error || '请先完成人机验证')
      return
    }
    setBusy(provider.id)
    setError('')
    try {
      const random = crypto.getRandomValues(new Uint8Array(32))
      const proof = btoa(String.fromCharCode(...random))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '')
      const flow: OAuthFlow = { proof, purpose, redirectPath, createdAt: Date.now() }
      sessionStorage.setItem(oauthFlowKey, JSON.stringify(flow))
      const result = await rpc<{ authorizationUrl: string }>('oauth/authorize', {
        providerId: provider.id,
        purpose,
        proof,
        redirectPath: /^\/user(?:\/|\?|$)/.test(redirectPath) ? redirectPath : '/user',
        challengeToken: challenge?.token,
        ...(purpose === 'login'
          ? { referral: new URLSearchParams(window.location.search).get('ref') || undefined }
          : {}),
      })
      const url = new URL(result.authorizationUrl)
      if (url.protocol !== 'https:') throw new Error('授权地址无效，请联系管理员')
      window.location.assign(url.toString())
    } catch (e) {
      sessionStorage.removeItem(oauthFlowKey)
      setError(errorText(e))
      challenge?.reset()
      setBusy('')
    }
  }
  useEffect(() => {
    const provider = available.find((item) => item.id === preferredProviderId)
    if (!provider || automaticStarted.current || challenge?.loading) return
    if (challenge && (!challenge.policy || (challenge.required('oauth') && !challenge.token)))
      return
    automaticStarted.current = true
    void authorize(provider)
  }, [providers, preferredProviderId, challenge?.loading, challenge?.policy, challenge?.token])
  if (!available.length) return null
  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%', marginTop: 20 }}>
      {error && <Alert type="error" title={error} showIcon />}
      {available.map((provider) => (
        <Button
          key={provider.id}
          block
          size={purpose === 'login' ? 'large' : 'middle'}
          icon={
            provider.kind === 'github' ? (
              <GithubOutlined />
            ) : provider.kind === 'google' ? (
              <GoogleOutlined />
            ) : (
              <LinkOutlined />
            )
          }
          loading={busy === provider.id}
          disabled={!!busy && busy !== provider.id}
          onClick={() => void authorize(provider)}
        >
          {purpose === 'bind' ? `绑定 ${provider.name}` : `使用 ${provider.name} 登录`}
        </Button>
      ))}
    </Space>
  )
}

export function OAuthBindings() {
  const { message, modal } = App.useApp()
  const [bindings, setBindings] = useState<Binding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [form] = Form.useForm()
  async function reload() {
    try {
      setBindings(await rpc<Binding[]>('oauth/bindings.list'))
      setError('')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void reload()
  }, [])
  return (
    <div className="settings-form">
      {error && (
        <Alert
          type="error"
          title={error}
          showIcon
          action={<Button onClick={reload}>重试</Button>}
        />
      )}
      {loading ? (
        <Spin />
      ) : bindings.length ? (
        <div className="data-list">
          {bindings.map((binding) => (
            <div className="data-row" key={binding.id}>
              <div className="data-row-copy">
                <strong>{binding.providerName}</strong>
                <small>{binding.displayName || '已绑定'}</small>
              </div>
              <Button
                type="link"
                danger
                loading={busy === binding.id}
                onClick={() => {
                  form.resetFields()
                  modal.confirm({
                    title: `解除 ${binding.providerName} 绑定？`,
                    content: binding.requiresPassword ? (
                      <Form form={form} layout="vertical" requiredMark={false}>
                        <Typography.Paragraph>
                          解除最后一个绑定前，请确认登录密码。
                        </Typography.Paragraph>
                        <Form.Item
                          name="password"
                          label="当前登录密码"
                          rules={[{ required: true, message: '请输入当前登录密码' }]}
                        >
                          <Input.Password autoComplete="current-password" />
                        </Form.Item>
                        <Form.Item name="code" label="动态验证码（已启用时填写）">
                          <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
                        </Form.Item>
                      </Form>
                    ) : (
                      '解除后无法再使用此账号登录。'
                    ),
                    okText: '解除绑定',
                    cancelText: '取消',
                    okButtonProps: { danger: true },
                    onOk: async () => {
                      const body = binding.requiresPassword
                        ? await form.validateFields()
                        : undefined
                      setBusy(binding.id)
                      try {
                        await rpc('oauth/bindings.delete', {
                          id: binding.id,
                          ...(body || {}),
                        })
                        await reload()
                        message.success('已解除绑定')
                      } catch (e) {
                        message.error(errorText(e))
                        throw e
                      } finally {
                        setBusy('')
                      }
                    },
                  })
                }}
              >
                解除绑定
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未绑定其他登录方式" />
      )}
      <OAuthButtons
        purpose="bind"
        redirectPath="/user/account"
        exclude={bindings.map((binding) => binding.providerId)}
      />
    </div>
  )
}
