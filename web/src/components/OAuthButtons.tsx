import type { useHumanChallenge } from './HumanChallenge'
import { useEffect, useState } from 'react'
import { Alert, App, Button, Empty, Form, Input, List, Space, Spin, Typography } from 'antd'
import { GithubOutlined, GoogleOutlined, LinkOutlined } from '@ant-design/icons'
import { api, errorText } from '../api'

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
}: {
  purpose?: 'login' | 'bind'
  redirectPath?: string
  registration?: boolean
  exclude?: string[]
  challenge?: ReturnType<typeof useHumanChallenge>
}) {
  const [providers, setProviders] = useState<Provider[]>([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    api<Provider[]>('/extensions/oauth/providers', { signal: controller.signal })
      .then(setProviders)
      .catch(() => {})
    return () => controller.abort()
  }, [])
  const available = providers.filter(
    (provider) => !exclude.includes(provider.id) && (!registration || provider.allowRegistration),
  )
  if (!available.length) return null
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
      const result = await api<{ authorizationUrl: string }>('/extensions/oauth/authorize', {
        method: 'POST',
        body: {
          providerId: provider.id,
          purpose,
          proof,
          redirectPath: /^\/user(?:\/|\?|$)/.test(redirectPath) ? redirectPath : '/user',
          challengeToken: challenge?.token,
          ...(purpose === 'login'
            ? { referral: new URLSearchParams(window.location.search).get('ref') || undefined }
            : {}),
        },
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
      setBindings(await api<Binding[]>('/extensions/oauth/bindings'))
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
      ) : (
        <List
          dataSource={bindings}
          locale={{
            emptyText: (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未绑定其他登录方式" />
            ),
          }}
          renderItem={(binding) => (
            <List.Item
              actions={[
                <Button
                  key="unbind"
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
                          await api(
                            `/extensions/oauth/bindings/${encodeURIComponent(binding.id)}`,
                            { method: 'DELETE', body },
                          )
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
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={binding.providerName}
                description={
                  <Typography.Text type="secondary">
                    {binding.displayName || '已绑定'}
                  </Typography.Text>
                }
              />
            </List.Item>
          )}
        />
      )}
      <OAuthButtons
        purpose="bind"
        redirectPath="/user/account"
        exclude={bindings.map((binding) => binding.providerId)}
      />
    </div>
  )
}
