import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  App,
  Button,
  Collapse,
  Form,
  Input,
  List,
  Result,
  Space,
  Spin,
  Steps,
  Switch,
  Tag,
  Typography,
} from 'antd'
import { api, errorText } from '../api'
import type { Plugin, Row, User } from '../api'
import { adminRoot } from '../adminPath'

type Check = { key: string; label: string; ready: boolean; error?: string; path: string }
export default function OnboardingSite({ onReady }: { onReady: () => Promise<void> }) {
  const [form] = Form.useForm()
  const { message } = App.useApp()
  const [step, setStep] = useState(1)
  const [settings, setSettings] = useState<Row>()
  const [draft, setDraft] = useState<Row>()
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [checks, setChecks] = useState<Check[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [complete, setComplete] = useState<Row>()
  const navigate = useNavigate()
  const has = (id: string) => plugins.some((plugin) => plugin.id === id && plugin.enabled)
  useEffect(() => {
    let active = true
    Promise.all([api<Row>('/settings'), api<Plugin[]>('/plugins')])
      .then(async ([core, installed]) => {
        const enabled = (id: string) =>
          installed.some((plugin) => plugin.id === id && plugin.enabled)
        const [brands, registration] = await Promise.all([
          enabled('branding') ? api<Row[]>('/extensions/branding/settings') : Promise.resolve([]),
          enabled('registration')
            ? api<Row[]>('/extensions/registration/settings')
            : Promise.resolve([]),
        ])
        if (!active) return
        setSettings(core)
        setPlugins(installed)
        form.setFieldsValue({
          ...brands[0],
          name: brands[0]?.name || core.name || 'PxBoard',
          publicUrl: core.publicUrl || window.location.origin,
          adminPath:
            core.mode === 'business' && core.adminPath === '/admin'
              ? `/manage-${crypto.randomUUID().slice(0, 8)}`
              : core.adminPath,
          registrationEnabled: registration[0]?.enabled !== false,
        })
      })
      .catch((e) => {
        if (active) setError(errorText(e))
      })
    return () => {
      active = false
    }
  }, [form])
  async function readiness() {
    const definitions = [
      {
        key: 'nodes',
        label: '接入节点',
        endpoint: '/extensions/nodes/nodes',
        path: '/p/nodes/nodes',
        ready: (rows: Row[]) => rows.some((row) => row.enabled !== false),
      },
      ...(settings?.mode === 'business'
        ? [
            {
              key: 'commerce',
              label: '上架套餐',
              endpoint: '/extensions/commerce/public/plans',
              path: '/p/commerce/plans',
              ready: (rows: Row[]) => rows.length > 0,
            },
            {
              key: 'payments',
              label: '配置收款渠道',
              endpoint: '/extensions/payments/channels',
              path: '/p/payments/payments',
              ready: (rows: Row[]) => rows.some((row) => row.enabled !== false),
            },
            {
              key: 'notifications',
              label: '配置邮件服务',
              endpoint: '/extensions/notifications/mail',
              path: '/p/notifications/notifications',
              ready: (rows: Row[]) => rows.some((row) => row.enabled && row.host && row.from),
            },
          ]
        : []),
    ].filter((item) => has(item.key))
    const user = await api<User>('/me')
    const results = await Promise.allSettled(definitions.map((item) => api<Row[]>(item.endpoint)))
    setChecks(
      definitions.map((item, index) => ({
        key: item.key,
        label: item.label,
        path: adminRoot(user) + item.path,
        ready: results[index].status === 'fulfilled' && item.ready(results[index].value),
        error: results[index].status === 'rejected' ? errorText(results[index].reason) : undefined,
      })),
    )
  }
  async function save(values: Row) {
    values = { ...form.getFieldsValue(true), ...values }
    setBusy(true)
    setError('')
    try {
      if (has('branding'))
        await api('/extensions/branding/settings', {
          method: 'PATCH',
          body: {
            name: values.name,
            heading: values.heading || '',
            introduction: values.introduction || '',
            seoTitle: values.seoTitle || '',
            description: values.description || '',
            indexingEnabled: !!values.indexingEnabled,
          },
        })
      if (has('registration'))
        await api('/extensions/registration/settings', {
          method: 'PATCH',
          body: { enabled: !!values.registrationEnabled },
        })
      setDraft(values)
      await readiness()
      setStep(2)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  async function finish() {
    if (!draft) return
    setBusy(true)
    setError('')
    try {
      const result = await api<Row>('/onboarding/complete', {
        method: 'POST',
        body: { name: draft.name, publicUrl: draft.publicUrl, adminPath: draft.adminPath },
      })
      setComplete({ ...result, publicUrl: draft.publicUrl })
      await onReady()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  function enter(path: string) {
    const origin = complete?.publicUrl || window.location.origin
    if (origin !== window.location.origin) window.location.assign(origin + path)
    else navigate(path, { replace: true })
  }
  if (complete)
    return (
      <div className="onboarding-page">
        <Result
          status="success"
          title="基础设置已完成"
          subTitle="服务配置可继续在管理后台完成。"
          extra={
            <Space>
              <Button type="primary" onClick={() => enter('/user')}>
                进入用户前台
              </Button>
              <Button onClick={() => enter(complete.adminPath)}>继续配置服务</Button>
              {settings?.mode === 'business' && (
                <Button href={complete.publicUrl + '/'} target="_blank">
                  查看首页
                </Button>
              )}
            </Space>
          }
        />
        <Typography.Paragraph>
          管理地址：
          <Typography.Text copyable>{complete.publicUrl + complete.adminPath}</Typography.Text>
        </Typography.Paragraph>
      </div>
    )
  return (
    <main className="onboarding-page">
      <h1>配置站点</h1>
      <Steps
        size="small"
        current={step}
        items={[{ title: '功能安装' }, { title: '站点信息' }, { title: '服务配置' }]}
        className="setup-steps"
      />
      {error && <Alert type="error" showIcon title={error} className="page-notice" />}
      {!settings ? (
        <Spin />
      ) : step === 1 ? (
        <Form form={form} layout="vertical" onFinish={save} disabled={busy}>
          <Form.Item
            name="name"
            label="站点名称"
            rules={[{ required: true, message: '请输入站点名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="publicUrl"
            label="公开访问地址"
            rules={[{ required: true, type: 'url', message: '请输入完整的站点地址' }]}
          >
            <Input placeholder="https://panel.example.com" />
          </Form.Item>
          {settings.mode === 'business' && (
            <>
              <Form.Item
                name="adminPath"
                label="独立管理入口"
                rules={[
                  {
                    required: true,
                    pattern: /^\/[a-zA-Z0-9_-]{3,64}$/,
                    message: '请输入单级路径，例如 /manage',
                  },
                ]}
              >
                <Input autoComplete="off" />
              </Form.Item>
              {has('branding') && (
                <>
                  <Form.Item name="heading" label="首页标题">
                    <Input />
                  </Form.Item>
                  <Form.Item name="introduction" label="服务介绍">
                    <Input.TextArea rows={3} />
                  </Form.Item>
                  <Collapse
                    ghost
                    items={[
                      {
                        key: 'seo',
                        label: '搜索与分享设置',
                        forceRender: true,
                        children: (
                          <>
                            {' '}
                            <Form.Item name="seoTitle" label="搜索与分享标题">
                              <Input />
                            </Form.Item>
                            <Form.Item name="description" label="搜索与分享摘要">
                              <Input.TextArea rows={2} />
                            </Form.Item>
                            <Form.Item
                              name="indexingEnabled"
                              label="允许搜索引擎收录首页"
                              valuePropName="checked"
                            >
                              <Switch />
                            </Form.Item>
                          </>
                        ),
                      },
                    ]}
                  />
                </>
              )}
            </>
          )}
          {has('registration') && (
            <Form.Item name="registrationEnabled" label="开放新用户注册" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
          <Button type="primary" htmlType="submit" loading={busy}>
            保存并继续
          </Button>
        </Form>
      ) : (
        <>
          <div className="table-toolbar">
            <h2>服务配置</h2>
            <Button onClick={() => void readiness().catch((e) => message.error(errorText(e)))}>
              重新检查
            </Button>
          </div>
          <List
            dataSource={checks}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button key="configure" href={item.path} target="_blank">
                    配置
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      {item.label}
                      <Tag color={item.ready ? 'success' : 'default'}>
                        {item.ready ? '已配置' : '待配置'}
                      </Tag>
                    </Space>
                  }
                  description={item.error}
                />
              </List.Item>
            )}
          />
          <Typography.Paragraph type="secondary">
            未完成的服务可以稍后配置。节点连接、收款和邮件投递仍需使用实际配置核对。
          </Typography.Paragraph>
          <Space>
            <Button onClick={() => setStep(1)}>返回修改</Button>
            <Button type="primary" loading={busy} onClick={() => void finish()}>
              完成初始化
            </Button>
          </Space>
        </>
      )}
    </main>
  )
}
