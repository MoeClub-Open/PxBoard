import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  List,
  Progress,
  Radio,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import { CheckCircleOutlined, LoadingOutlined, ReloadOutlined } from '@ant-design/icons'
import { api, errorText } from '../api'
import type { Row, User } from '../api'
import { adminRoot } from '../adminPath'

interface ModeState {
  mode: string
  requestedMode: string
  phase: 'needs_install' | 'installing' | 'ready' | 'failed'
  sourceUrl: string
  sourceId?: string
  plugins: {
    id: string
    name?: string
    status: 'pending' | 'installing' | 'installed' | 'ready' | 'failed'
    error?: string
  }[]
  error?: string
  message?: string
}

const modes = [
  { value: 'personal', label: '自用', description: '节点管理、访问账户和订阅' },
  { value: 'business', label: '商业运营', description: '用户前台、套餐订单、支付和工单' },
]
const pluginNames: Record<string, string> = {
  access: '访问账户',
  nodes: '节点管理',
  subscriptions: '订阅',
  branding: '站点品牌',
  registration: '用户注册',
  redeem: '兑换码',
  affiliate: '推广返佣',
  commerce: '商业运营',
  payments: '支付',
  audit: '流量审计',
  support: '用户服务',
  notifications: '邮件通知',
}
const statusLabels = {
  installing: ['安装中', 'processing'],
  pending: ['等待安装', 'default'],
  installed: ['正在启用', 'processing'],
  ready: ['已就绪', 'success'],
  failed: ['安装失败', 'error'],
} as const

export default function ModeSetup({
  onReady,
  initialMode,
}: {
  onReady: () => Promise<void>
  initialMode?: string
}) {
  const [state, setState] = useState<ModeState>()
  const [sources, setSources] = useState<Row[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form] = Form.useForm()
  const mode = Form.useWatch('mode', form)
  const sourceId = Form.useWatch('sourceId', form)
  const watchedSourceUrl = Form.useWatch('sourceUrl', form)
  const { message } = App.useApp()
  const navigate = useNavigate()
  const load = useCallback(async () => {
    const result = await api<ModeState>('/mode')
    setState(result)
    setError('')
    if (!form.getFieldValue('mode')) form.setFieldValue('mode', result.requestedMode || result.mode)
    if (!form.getFieldValue('sourceUrl')) form.setFieldValue('sourceUrl', result.sourceUrl)
    return result
  }, [form])

  useEffect(() => {
    let active = true
    Promise.all([api<ModeState>('/mode'), api<Row[]>('/sources')])
      .then(([result, registered]) => {
        if (!active) return
        setState(result)
        setSources(registered.filter((source) => source.enabled))
        const values = {
          mode: initialMode || result.requestedMode || result.mode,
          sourceId: registered.some((source) => source.id === result.sourceId && source.enabled)
            ? result.sourceId
            : 'custom',
          sourceUrl: result.sourceUrl,
        }
        form.setFieldsValue(values)
        if (result.phase === 'needs_install') void install(values)
      })
      .catch((e) => {
        if (active) setError(errorText(e))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [form, initialMode])

  useEffect(() => {
    if (state?.phase !== 'installing') return
    const timer = window.setInterval(() => {
      void load().catch((e) => setError(errorText(e)))
    }, 1500)
    return () => window.clearInterval(timer)
  }, [state?.phase, load])

  async function install(values: Row) {
    setBusy(true)
    setError('')
    try {
      const body =
        values.sourceId === 'custom'
          ? { mode: values.mode, sourceUrl: values.sourceUrl }
          : { mode: values.mode, sourceId: values.sourceId }
      setState(await api<ModeState>('/mode', { method: 'POST', body }))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function enter(path: string) {
    setBusy(true)
    try {
      await onReady()
      const target = path === 'admin' ? adminRoot(await api<User>('/me')) : path
      navigate(target, { replace: true })
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  if (loading)
    return (
      <div className="page-loading">
        <Spin />
      </div>
    )
  const installing = state?.phase === 'installing'
  const sameSource =
    sourceId === 'custom' ? watchedSourceUrl === state?.sourceUrl : sourceId === state?.sourceId
  const ready = state?.phase === 'ready' && state.mode === mode && sameSource
  const completed = state?.plugins.filter((plugin) => plugin.status === 'ready').length || 0
  const total = state?.plugins.length || 0

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '36px 20px', minHeight: '100vh' }}>
      <div className="page-heading">
        <h1>使用方式与功能安装</h1>
      </div>
      {error && (
        <Alert
          type="error"
          title={error}
          showIcon
          className="page-notice"
          action={
            <Button onClick={() => void load().catch((e) => setError(errorText(e)))}>
              重试连接
            </Button>
          }
        />
      )}
      {state?.phase === 'failed' && (
        <Alert
          type="error"
          title="功能安装未完成"
          description={state.error || state.message}
          showIcon
          className="page-notice"
        />
      )}
      <Form
        form={form}
        initialValues={{ mode: initialMode || 'personal', sourceId: 'custom' }}
        layout="vertical"
        onFinish={install}
        disabled={installing || busy}
      >
        <Form.Item
          name="mode"
          label="使用方式"
          rules={[{ required: true, message: '请选择使用方式' }]}
        >
          <Radio.Group style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {modes.map((item) => (
              <Radio.Button key={item.value} value={item.value}>
                {item.label}
              </Radio.Button>
            ))}
          </Radio.Group>
        </Form.Item>
        <Typography.Paragraph type="secondary">
          {modes.find((item) => item.value === mode)?.description}
        </Typography.Paragraph>
        {sources.length > 0 && (
          <Form.Item name="sourceId" label="插件源">
            <Select
              options={[
                ...sources.map((source) => ({ label: source.name, value: source.id })),
                { label: '使用其他插件源', value: 'custom' },
              ]}
            />
          </Form.Item>
        )}
        {(sourceId === 'custom' || !sources.length) && (
          <Form.Item
            name="sourceUrl"
            label="插件源地址"
            rules={[{ required: true, type: 'url', message: '请输入插件源地址' }]}
          >
            <Input placeholder="https://plugins.example.com/index.json" />
          </Form.Item>
        )}
        <Typography.Paragraph type="secondary">
          将安装并启用所选方式需要的插件，已安装的其他插件和数据会保留。
        </Typography.Paragraph>
        {!ready && (
          <Button
            type="primary"
            htmlType="submit"
            loading={busy || installing}
            icon={state?.phase === 'failed' ? <ReloadOutlined /> : undefined}
          >
            {installing ? '正在安装功能' : state?.phase === 'failed' ? '重新安装' : '安装并启用'}
          </Button>
        )}
      </Form>
      {!!total && (
        <section className="resource-section" style={{ marginTop: 28 }}>
          <div className="table-toolbar">
            <h2>{installing ? '正在安装' : '安装结果'}</h2>
            <span className="muted">
              {completed} / {total} 已就绪
            </span>
          </div>
          <Progress
            percent={Math.round((completed / total) * 100)}
            status={state?.phase === 'failed' ? 'exception' : ready ? 'success' : 'active'}
          />
          <List
            dataSource={state?.plugins}
            renderItem={(plugin) => (
              <List.Item>
                <Space>
                  {plugin.status === 'ready' ? (
                    <CheckCircleOutlined style={{ color: 'var(--ant-color-success, #52c41a)' }} />
                  ) : plugin.status === 'installed' ? (
                    <LoadingOutlined />
                  ) : null}
                  <span>{plugin.name || pluginNames[plugin.id] || plugin.id}</span>
                </Space>
                <Space>
                  <Typography.Text type="danger">{plugin.error}</Typography.Text>
                  <Tag color={statusLabels[plugin.status][1]}>{statusLabels[plugin.status][0]}</Tag>
                </Space>
              </List.Item>
            )}
          />
        </section>
      )}
      {ready && (
        <Space wrap style={{ marginTop: 24 }}>
          <Button type="primary" loading={busy} onClick={() => void enter('/user')}>
            进入用户前台
          </Button>
          <Button onClick={() => void enter('admin')}>配置站点</Button>
        </Space>
      )}
    </div>
  )
}
