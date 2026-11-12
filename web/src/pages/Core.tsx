import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, App, Button, Card, Form, Input, Modal, Select, Space, Table, Tabs, Tag } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { configurationChanged, errorText, rpc, useRpc } from '../api'
import type { Row } from '../api'
import { useSession } from '../context'
import { activityLabel } from './Overview'
import ResourcePage from '../components/ResourcePage'
import { settingsDestinations } from '../settingsDestinations'
import { adminURL } from '../adminPath'

export function Users() {
  const { message } = App.useApp()
  const { me } = useSession()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search)
      setPage(1)
    }, 250)
    return () => clearTimeout(timer)
  }, [search])
  const { data, loading, error, reload } = useRpc<{ items: Row[]; total: number }>(
    'core/users.list',
    { limit: pageSize, offset: (page - 1) * pageSize, q: query },
  )
  const [editor, setEditor] = useState<Row | null>(null)
  const [busy, setBusy] = useState(false)
  const [form] = Form.useForm()
  function open(row: Row = {}) {
    form.resetFields()
    form.setFieldsValue({ role: 'member', status: 'active', ...row })
    setEditor(row)
  }
  async function submit() {
    let body
    try {
      body = await form.validateFields()
    } catch {
      return
    }
    setBusy(true)
    try {
      await rpc(
        editor?.id ? 'core/users.update' : 'core/users.create',
        editor?.id ? { ...body, id: editor.id } : body,
      )
      message.success('已保存')
      setEditor(null)
      reload()
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="page-heading">
        <h1>用户</h1>
        <Space size={8} wrap>
          <Input.Search
            style={{ width: 220 }}
            placeholder="搜索邮箱或姓名"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
          />
          <Button icon={<ReloadOutlined />} onClick={reload}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => open()}>
            添加用户
          </Button>
        </Space>
      </div>
      {error && <Alert type="error" title={error} showIcon className="page-notice" />}
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={data?.items}
        pagination={{
          current: page,
          pageSize,
          total: data?.total,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
          onChange: (current, size) => {
            setPage(current)
            setPageSize(size)
          },
        }}
        scroll={{ x: 720 }}
        columns={[
          {
            title: '用户',
            dataIndex: 'email',
            render: (email: string, u: Row) => (
              <div className="plugin-name">
                <strong>{u.name}</strong>
                <span>{email}</span>
              </div>
            ),
          },
          {
            title: '角色',
            dataIndex: 'role',
            render: (role: string) => (
              <Tag className={role === 'admin' ? 'mode-tag' : undefined}>
                {role === 'admin' ? '管理员' : '普通用户'}
              </Tag>
            ),
          },
          {
            title: '状态',
            dataIndex: 'status',
            render: (status: string) => (
              <Tag color={status === 'active' ? 'success' : 'error'}>
                {status === 'active' ? '正常' : '已停用'}
              </Tag>
            ),
          },
          {
            title: '创建时间',
            dataIndex: 'createdAt',
            render: (value: string) => new Date(value).toLocaleDateString('zh-CN'),
          },
          {
            title: '操作',
            key: 'actions',
            width: 80,
            render: (_: any, u: Row) => (
              <Button type="link" size="small" onClick={() => open(u)}>
                编辑
              </Button>
            ),
          },
        ]}
      />
      <Modal
        open={!!editor}
        title={editor?.id ? '编辑用户' : '添加用户'}
        onCancel={() => setEditor(null)}
        onOk={submit}
        confirmLoading={busy}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" className="editor-form">
          {!editor?.id && (
            <>
              <Form.Item name="name" label="姓名">
                <Input />
              </Form.Item>
              <Form.Item
                name="email"
                label="邮箱"
                rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}
              >
                <Input type="email" />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="password"
            label={editor?.id ? '新密码（留空保留）' : '登录密码'}
            rules={[{ required: !editor?.id, min: 10, message: '密码至少 10 位' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="role" label="角色">
            <Select
              disabled={editor?.id === me.id}
              options={[
                { value: 'member', label: '普通用户' },
                { value: 'admin', label: '管理员' },
              ]}
            />
          </Form.Item>
          {editor?.id && (
            <Form.Item name="status" label="状态">
              <Select
                disabled={editor.id === me.id}
                options={[
                  { value: 'active', label: '正常' },
                  { value: 'disabled', label: '停用' },
                ]}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  )
}

export function Settings() {
  const { message } = App.useApp()
  const { refresh, plugins, me } = useSession()
  const { data, loading, error } = useRpc<Row>('core/settings.get')
  const [busy, setBusy] = useState(false)
  if (loading) return null
  const pluginSettings = plugins
    .filter((plugin) => plugin.enabled)
    .flatMap((plugin) =>
      plugin.pages
        .filter(
          (page) =>
            page.roles.includes('admin') &&
            page.surface !== 'portal' &&
            settingsDestinations[`${plugin.id}/${page.id}`] === '/admin/settings',
        )
        .map((page) => ({ plugin, page })),
    )
  const baseForm = (
    <Card size="small" className="settings-card">
      <Form
        layout="vertical"
        requiredMark={false}
        initialValues={data}
        onFinish={async (body) => {
          setBusy(true)
          try {
            await rpc('core/settings.update', body)
            configurationChanged()
            if (body.adminPath && body.adminPath !== data?.adminPath) {
              window.location.replace(`${body.adminPath}/settings`)
              return
            }
            await refresh()
            message.success('已保存')
          } catch (e) {
            message.error(errorText(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        <Form.Item label="使用方式">
          <Space>
            <Tag className="mode-tag">
              {{ personal: '自用', business: '商业运营' }[String(data?.mode)] || data?.mode}
            </Tag>
            <Link to={adminURL('/admin/mode', me)}>切换使用方式</Link>
          </Space>
        </Form.Item>
        <Form.Item name="publicUrl" label="公开访问地址">
          <Input type="url" placeholder="https://panel.example.com" />
        </Form.Item>
        {me.mode === 'business' && (
          <Form.Item
            name="adminPath"
            label="后台入口路径"
            rules={[
              {
                required: true,
                pattern: /^\/[a-zA-Z0-9_-]{3,64}$/,
                message: '请输入单级路径，例如 /manage',
              },
            ]}
          >
            <Input placeholder="/admin" autoComplete="off" />
          </Form.Item>
        )}
        <Button type="primary" htmlType="submit" loading={busy}>
          保存设置
        </Button>
      </Form>
    </Card>
  )
  return (
    <>
      <div className="page-heading">
        <h1>系统设置</h1>
      </div>
      {error && <Alert type="error" title={error} showIcon className="page-notice" />}
      {pluginSettings.length ? (
        <Tabs
          items={[
            { key: 'core', label: '基础设置', children: baseForm },
            ...pluginSettings.map(({ plugin, page }) => ({
              key: `${plugin.id}/${page.id}`,
              label: page.title,
              children: (
                <ResourcePage
                  key={`${plugin.id}/${page.id}`}
                  pluginId={plugin.id}
                  pageId={page.id}
                  hideHeading
                />
              ),
            })),
          ]}
        />
      ) : (
        baseForm
      )}
    </>
  )
}

export function Activity() {
  const { data, loading, error, reload } = useRpc<Row[]>('core/activity.list')
  const [search, setSearch] = useState('')
  const rows = (data || []).filter((item) =>
    `${item.actor || ''} ${activityLabel(String(item.action || ''))} ${item.target || ''}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )
  return (
    <>
      <div className="page-heading">
        <h1>操作记录</h1>
        <Space size={8} wrap>
          <Input.Search
            placeholder="搜索操作或对象"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 200 }}
          />
          <Button icon={<ReloadOutlined />} onClick={reload}>
            刷新
          </Button>
        </Space>
      </div>
      {error && <Alert type="error" title={error} showIcon className="page-notice" />}
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        scroll={{ x: 720 }}
        pagination={{ pageSize: 15, showTotal: (total) => `共 ${total} 条` }}
        columns={[
          {
            title: '时间',
            dataIndex: 'createdAt',
            width: 180,
            render: (v: string) => new Date(v).toLocaleString('zh-CN'),
          },
          { title: '操作人', dataIndex: 'actor' },
          { title: '操作', dataIndex: 'action', render: activityLabel },
          { title: '对象', dataIndex: 'target', ellipsis: true },
        ]}
      />
    </>
  )
}
export function Jobs() {
  const { message } = App.useApp()
  const { data, loading, error, reload } = useRpc<Row[]>('core/jobs.list')
  const [search, setSearch] = useState('')
  const rows = (data || []).filter((item) =>
    `${item.type || ''} ${item.plugin || ''} ${item.error || ''}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )
  return (
    <>
      <div className="page-heading">
        <h1>后台任务</h1>
        <Space size={8} wrap>
          <Input.Search
            placeholder="搜索事件或插件"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 200 }}
          />
          <Button icon={<ReloadOutlined />} onClick={reload}>
            刷新
          </Button>
        </Space>
      </div>
      {error && <Alert type="error" title={error} showIcon className="page-notice" />}
      <Table
        rowKey={(row) => `${row.id}/${row.plugin}`}
        size="small"
        loading={loading}
        dataSource={rows}
        pagination={{ pageSize: 15, showTotal: (total) => `共 ${total} 条` }}
        scroll={{ x: 800 }}
        columns={[
          { title: '事件', dataIndex: 'type' },
          { title: '插件', dataIndex: 'plugin' },
          { title: '重试次数', dataIndex: 'attempts', width: 90 },
          { title: '错误', dataIndex: 'error', ellipsis: true },
          {
            title: '下次处理',
            dataIndex: 'nextAt',
            width: 180,
            render: (v: string) => new Date(v).toLocaleString('zh-CN'),
          },
          {
            title: '操作',
            key: 'action',
            width: 80,
            render: (_: any, row: Row) => (
              <Button
                type="link"
                size="small"
                onClick={async () => {
                  try {
                    await rpc('core/jobs.retry', { id: row.id })
                    message.success('已重新加入队列')
                    reload()
                  } catch (e) {
                    message.error(errorText(e))
                  }
                }}
              >
                重试
              </Button>
            ),
          },
        ]}
      />
    </>
  )
}
