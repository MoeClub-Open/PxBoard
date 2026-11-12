import { useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Flex,
  Form,
  Grid,
  Input,
  Modal,
  QRCode,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { errorText, rpc, useRpc } from '../api'
import type { Row } from '../api'
import { useSession } from '../context'
import { OAuthBindings } from '../components/OAuthButtons'
import ReminderPreferences from '../components/ReminderPreferences'
type TabsConfig = {
  activeKey: string
  onChange: (key: string) => void
  items: { key: string; label: string }[]
}

function Tokens({ tabs }: { tabs: TabsConfig }) {
  const { data, error, loading, reload } = useRpc<Row[]>('core/tokens.list')
  const { message, modal } = App.useApp()
  const screens = Grid.useBreakpoint()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form] = Form.useForm()
  async function create() {
    let values
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setBusy(true)
    try {
      const token = await rpc('core/tokens.create', values)
      setOpen(false)
      form.resetFields()
      reload()
      modal.info({
        title: '保存 API 密钥',
        width: 600,
        content: (
          <>
            <Typography.Paragraph>密钥仅显示一次，请妥善保存。</Typography.Paragraph>
            <Typography.Paragraph copyable code>
              {token.token}
            </Typography.Paragraph>
          </>
        ),
        okText: '已保存',
      })
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Tabs
        activeKey={tabs.activeKey}
        onChange={tabs.onChange}
        items={tabs.items}
        tabBarExtraContent={
          screens.md ? (
            <Space size={8}>
              <Button icon={<ReloadOutlined />} onClick={reload}>
                刷新
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
                创建密钥
              </Button>
            </Space>
          ) : undefined
        }
      />
      {!screens.md && (
        <div className="table-toolbar">
          <Space size={8}>
            <Button icon={<ReloadOutlined />} onClick={reload}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
              创建密钥
            </Button>
          </Space>
        </div>
      )}
      {error && <Alert type="error" title={error} showIcon className="page-notice" />}
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={data}
        pagination={false}
        columns={[
          { title: '名称', dataIndex: 'name' },
          {
            title: '权限',
            dataIndex: 'scope',
            render: (scope: string) => <Tag>{scope === 'write' ? '读取与写入' : '只读'}</Tag>,
          },
          {
            title: '到期时间',
            dataIndex: 'expiresAt',
            render: (v: string) => new Date(v).toLocaleString('zh-CN'),
          },
          {
            title: '操作',
            width: 72,
            render: (_: any, row: Row) => (
              <Button
                type="text"
                size="small"
                danger
                aria-label="撤销密钥"
                icon={<DeleteOutlined />}
                onClick={() =>
                  modal.confirm({
                    title: '撤销此密钥？',
                    content: '使用此密钥的应用将立即失去访问权限。',
                    okText: '撤销',
                    cancelText: '取消',
                    onOk: async () => {
                      try {
                        await rpc('core/tokens.revoke', { id: row.id })
                        reload()
                      } catch (e) {
                        message.error(errorText(e))
                      }
                    },
                  })
                }
              />
            ),
          },
        ]}
      />
      <Modal
        open={open}
        title="创建 API 密钥"
        onCancel={() => setOpen(false)}
        onOk={create}
        confirmLoading={busy}
        okText="创建"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ scope: 'read' }}
          className="editor-form"
        >
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="scope" label="权限">
            <Select
              options={[
                { value: 'read', label: '只读' },
                { value: 'write', label: '读取与写入' },
              ]}
            />
          </Form.Item>
          <Typography.Paragraph type="secondary">
            有效期为 90 天，访问范围与当前账户相同。
          </Typography.Paragraph>
        </Form>
      </Modal>
    </>
  )
}
function TwoFactorAuth() {
  const { me, refresh } = useSession()
  const { message } = App.useApp()
  const [setupData, setSetupData] = useState<{ secret: string; otpauthUrl: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [form] = Form.useForm()

  async function beginSetup() {
    setBusy(true)
    try {
      const res = await rpc<{ secret: string; otpauthUrl: string }>('core/account.mfaSetup')
      setSetupData(res)
      form.resetFields()
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  if (me.mfaEnabled) {
    return (
      <Card size="small" className="settings-card">
        <Space style={{ marginBottom: 12 }}>
          <Tag color="green">已启用</Tag>
          <Typography.Text type="secondary">登录和敏感操作需输入 6 位动态验证码</Typography.Text>
        </Space>
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={async (values) => {
            setBusy(true)
            try {
              await rpc('core/account.mfaDisable', values)
              form.resetFields()
              await refresh()
              message.success('已关闭两步验证')
            } catch (e) {
              message.error(errorText(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          <Form.Item
            name="password"
            label="当前登录密码"
            rules={[{ required: true, message: '请输入当前登录密码' }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="code"
            label="动态验证码"
            rules={[{ required: true, len: 6, message: '请输入 6 位动态验证码' }]}
          >
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
          </Form.Item>
          <Button danger htmlType="submit" loading={busy}>
            关闭两步验证
          </Button>
        </Form>
      </Card>
    )
  }

  return (
    <Card size="small" className="settings-card">
      <Space style={{ marginBottom: 12 }}>
        <Tag>未启用</Tag>
        <Typography.Text type="secondary">使用身份验证器生成 6 位动态验证码</Typography.Text>
      </Space>
      {!setupData ? (
        <div>
          <Button type="primary" onClick={beginSetup} loading={busy}>
            设置两步验证
          </Button>
        </div>
      ) : (
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={async (values) => {
            setBusy(true)
            try {
              await rpc('core/account.mfaEnable', values)
              setSetupData(null)
              form.resetFields()
              await refresh()
              message.success('已启用两步验证')
            } catch (e) {
              message.error(errorText(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          <Flex gap={16} align="center" wrap style={{ marginBottom: 14 }}>
            <QRCode value={setupData.otpauthUrl} size={136} />
            <div style={{ minWidth: 200, flex: 1 }}>
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                使用验证器扫码或手动输入密钥
              </Typography.Text>
              <Typography.Paragraph copyable code style={{ marginBottom: 4 }}>
                {setupData.secret}
              </Typography.Paragraph>
              <Typography.Text copyable={{ text: setupData.otpauthUrl }} type="secondary">
                复制导入链接
              </Typography.Text>
            </div>
          </Flex>
          <Form.Item
            name="password"
            label="当前登录密码"
            rules={[{ required: true, message: '请输入当前登录密码' }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="code"
            label="6 位动态验证码"
            rules={[{ required: true, len: 6, message: '请输入 6 位动态验证码' }]}
          >
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={busy}>
              确认启用
            </Button>
            <Button onClick={() => setSetupData(null)} disabled={busy}>
              取消
            </Button>
          </Space>
        </Form>
      )}
    </Card>
  )
}
export default function Account() {
  const { me, plugins } = useSession()
  const { message } = App.useApp()
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('tokens')
  const hasAccess = plugins.some((plugin) => plugin.id === 'access' && plugin.enabled)
  const hasOAuth = plugins.some((plugin) => plugin.id === 'oauth' && plugin.enabled)
  const tabItems = [
    { key: 'tokens', label: 'API 密钥' },
    ...(hasAccess ? [{ key: 'reminders', label: '邮件提醒' }] : []),
    { key: 'password', label: '登录密码' },
    { key: 'mfa', label: '两步验证' },
    ...(hasOAuth ? [{ key: 'oauth', label: '第三方登录' }] : []),
  ]
  return (
    <>
      <div className="page-heading">
        <h1>我的账户</h1>
      </div>
      <div className="metric-strip">
        <div>
          <span>姓名</span>
          <strong>{me.name || '—'}</strong>
        </div>
        <div>
          <span>邮箱</span>
          <strong style={{ fontSize: 15 }}>{me.email}</strong>
        </div>
        <div>
          <span>两步验证</span>
          <strong>
            <Tag color={me.mfaEnabled ? 'success' : 'default'}>
              {me.mfaEnabled ? '已启用' : '未启用'}
            </Tag>
          </strong>
        </div>
      </div>
      {tab === 'tokens' ? (
        <Tokens tabs={{ activeKey: tab, onChange: setTab, items: tabItems }} />
      ) : (
        <>
          <Tabs activeKey={tab} onChange={setTab} items={tabItems} />
          {tab === 'reminders' && <ReminderPreferences />}
          {tab === 'password' && (
            <Card size="small" className="settings-card">
              <Form
                layout="vertical"
                requiredMark={false}
                onFinish={async (values) => {
                  setBusy(true)
                  try {
                    await rpc('core/account.changePassword', values)
                    message.success('密码已更新，请重新登录')
                    window.location.assign('/login')
                  } catch (e) {
                    message.error(errorText(e))
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                <Form.Item
                  name="currentPassword"
                  label="当前密码"
                  rules={[{ required: true, message: '请输入当前密码' }]}
                >
                  <Input.Password autoComplete="current-password" />
                </Form.Item>
                {me.mfaEnabled && (
                  <Form.Item
                    name="code"
                    label="动态验证码"
                    rules={[{ required: true, len: 6, message: '请输入 6 位动态验证码' }]}
                  >
                    <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
                  </Form.Item>
                )}
                <Form.Item
                  name="password"
                  label="新密码"
                  rules={[{ required: true, min: 10, message: '密码至少 10 位' }]}
                >
                  <Input.Password autoComplete="new-password" />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={busy}>
                  更新密码
                </Button>
              </Form>
            </Card>
          )}
          {tab === 'mfa' && <TwoFactorAuth />}
          {tab === 'oauth' && <OAuthBindings />}
        </>
      )}
    </>
  )
}
