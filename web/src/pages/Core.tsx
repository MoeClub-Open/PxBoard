import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, App, Button, Form, Input, Modal, Select, Space, Table, Tag } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { api, errorText, useData } from '../api'
import type { Row } from '../api'
import { useSession } from '../context'
import { activityLabel } from './Overview'

export function Users() {
  const { message } = App.useApp()
  const { me } = useSession()
  const { data, loading, error, reload } = useData<Row[]>('/users')
  const [search, setSearch] = useState('')
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
      await api(`/users${editor?.id ? `/${editor.id}` : ''}`, {
        method: editor?.id ? 'PATCH' : 'POST',
        body,
      })
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
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open()}>
          添加用户
        </Button>
      </div>
      {error && <Alert type="error" title={error} />}
      <div className="table-toolbar">
        <Input.Search
          style={{ width: 280 }}
          placeholder="搜索邮箱或姓名"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
        />
        <Button icon={<ReloadOutlined />} onClick={reload}>
          刷新
        </Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data?.filter((u) =>
          `${u.email}${u.name}`.toLowerCase().includes(search.toLowerCase()),
        )}
        pagination={{ pageSize: 15 }}
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
              <Tag color={role === 'admin' ? 'purple' : 'default'}>
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
            render: (_: any, u: Row) => (
              <Button type="link" onClick={() => open(u)}>
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
  const { refresh } = useSession()
  const { data, loading, error } = useData<Row>('/settings')
  const [busy, setBusy] = useState(false)
  if (loading) return null
  return (
    <>
      <div className="page-heading">
        <h1>系统设置</h1>
      </div>
      {error && <Alert type="error" title={error} />}
      <div className="settings-form">
        <Form
          layout="vertical"
          initialValues={data}
          onFinish={async (body) => {
            setBusy(true)
            try {
              await api('/settings', { method: 'PATCH', body })
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
              <span>
                {{ personal: '自用', sharing: '公益 / 分享', business: '商业运营' }[
                  String(data?.mode)
                ] || data?.mode}
              </span>
              <Link to="/admin/mode">切换使用方式</Link>
            </Space>
          </Form.Item>
          <Form.Item name="publicUrl" label="公开访问地址">
            <Input type="url" placeholder="https://panel.example.com" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={busy}>
            保存设置
          </Button>
        </Form>
      </div>
    </>
  )
}

export function Activity() {
  const { data, loading, error, reload } = useData<Row[]>('/activity')
  return (
    <>
      <div className="page-heading">
        <h1>操作记录</h1>
        <Button icon={<ReloadOutlined />} onClick={reload}>
          刷新
        </Button>
      </div>
      {error && <Alert type="error" title={error} />}
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        scroll={{ x: 720 }}
        pagination={{ pageSize: 15 }}
        columns={[
          {
            title: '时间',
            dataIndex: 'createdAt',
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
  const { data, loading, error, reload } = useData<Row[]>('/jobs')
  return (
    <>
      <div className="page-heading">
        <h1>后台任务</h1>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={reload}>
            刷新
          </Button>
        </Space>
      </div>
      {error && <Alert type="error" title={error} />}
      <Table
        rowKey={(row) => `${row.id}/${row.plugin}`}
        loading={loading}
        dataSource={data}
        pagination={{ pageSize: 15 }}
        scroll={{ x: 800 }}
        columns={[
          { title: '事件', dataIndex: 'type' },
          { title: '插件', dataIndex: 'plugin' },
          { title: '重试次数', dataIndex: 'attempts' },
          { title: '错误', dataIndex: 'error', ellipsis: true },
          {
            title: '下次处理',
            dataIndex: 'nextAt',
            render: (v: string) => new Date(v).toLocaleString('zh-CN'),
          },
          {
            title: '操作',
            key: 'action',
            render: (_: any, row: Row) => (
              <Button
                type="link"
                onClick={async () => {
                  try {
                    await api(`/jobs/${row.id}/retry`, { method: 'POST' })
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
