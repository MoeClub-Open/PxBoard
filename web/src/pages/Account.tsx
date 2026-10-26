import { useState } from 'react'
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { api, errorText, useData } from '../api'
import type { Row } from '../api'
import { useSession } from '../context'
import { OAuthBindings } from '../components/OAuthButtons'
function Tokens() {
  const { data, error, loading, reload } = useData<Row[]>('/tokens')
  const { message, modal } = App.useApp()
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
      const token = await api('/tokens', { method: 'POST', body: values })
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
      {error && <Alert type="error" title={error} />}
      <div className="table-toolbar">
        <h2>API 密钥</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={reload} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            创建密钥
          </Button>
        </Space>
      </div>
      <Table
        rowKey="id"
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
            render: (_: any, row: Row) => (
              <Button
                type="text"
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
                        await api(`/tokens/${row.id}`, { method: 'DELETE' })
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
export default function Account() {
  const { me, plugins } = useSession()
  const { message } = App.useApp()
  const [busy, setBusy] = useState(false)
  return (
    <>
      <div className="page-heading">
        <h1>我的账户</h1>
      </div>
      <Typography.Paragraph type="secondary">{me.email}</Typography.Paragraph>
      <Tabs
        items={[
          { key: 'tokens', label: 'API 密钥', children: <Tokens /> },
          {
            key: 'password',
            label: '登录密码',
            children: (
              <div className="settings-form">
                <Form
                  layout="vertical"
                  onFinish={async (values) => {
                    setBusy(true)
                    try {
                      await api('/me/password', { method: 'POST', body: values })
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
                  <Form.Item name="code" label="动态验证码（已启用时填写）">
                    <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
                  </Form.Item>
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
              </div>
            ),
          },
          ...(plugins.some((plugin) => plugin.id === 'oauth' && plugin.enabled)
            ? [{ key: 'oauth', label: '第三方登录', children: <OAuthBindings /> }]
            : []),
        ]}
      />
    </>
  )
}
