import { useState } from 'react'
import {
  Alert,
  App,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Space,
  Spin,
  Table,
  Tag,
} from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { api, errorText, useData } from '../api'
import type { Row } from '../api'
import { useSession } from '../context'
import { date } from './PortalShared'

export function PortalSupport() {
  const { me } = useSession()
  const { message, modal } = App.useApp()
  const tickets = useData<Row[]>('/extensions/support/tickets?mine=1', 10)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [form] = Form.useForm()
  const [replyForm] = Form.useForm()
  const rows = (tickets.data || []).filter((row) => row.userId === me.id)
  const current = rows.find((row) => row.id === selected)
  const statuses: Record<string, [string, string]> = {
    open: ['等待回复', 'warning'],
    answered: ['有新回复', 'processing'],
    closed: ['已关闭', 'default'],
  }
  async function submit() {
    let values: Row
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setBusy(true)
    try {
      const row = await api<Row>('/extensions/support/tickets', { method: 'POST', body: values })
      setCreating(false)
      form.resetFields()
      setSelected(row.id)
      tickets.reload()
      message.success('工单已提交')
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  async function close() {
    try {
      await api(`/extensions/support/tickets/${selected}/close`, { method: 'POST', body: {} })
      tickets.reload()
      message.success('工单已关闭')
    } catch (e) {
      message.error(errorText(e))
    }
  }
  return (
    <>
      <div className="page-heading">
        <h1>我的工单</h1>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={tickets.reload} aria-label="刷新工单" />
          <Button type="primary" onClick={() => setCreating(true)}>
            提交工单
          </Button>
        </Space>
      </div>
      {tickets.error && (
        <Alert
          type="error"
          title={tickets.error}
          action={<Button onClick={tickets.reload}>重试</Button>}
        />
      )}
      <Table<Row>
        rowKey="id"
        loading={tickets.loading}
        dataSource={rows}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 560 }}
        locale={{
          emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有工单" />,
        }}
        columns={[
          {
            title: '主题',
            dataIndex: 'subject',
            render: (value, row) => (
              <Button
                type="link"
                className="portal-inline-button"
                onClick={() => {
                  setSelected(row.id)
                  replyForm.resetFields()
                }}
              >
                {value}
              </Button>
            ),
          },
          {
            title: '状态',
            dataIndex: 'status',
            render: (value) => (
              <Tag color={statuses[value]?.[1]}>{statuses[value]?.[0] || value}</Tag>
            ),
          },
          { title: '更新时间', dataIndex: 'updatedAt', render: date },
        ]}
      />
      <Modal
        open={creating}
        title="提交工单"
        onCancel={() => setCreating(false)}
        onOk={() => void submit()}
        confirmLoading={busy}
        okText="提交"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="subject"
            label="主题"
            rules={[{ required: true, message: '请输入主题' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="content"
            label="问题描述"
            rules={[{ required: true, message: '请描述遇到的问题' }]}
          >
            <Input.TextArea rows={5} />
          </Form.Item>
        </Form>
      </Modal>
      <Drawer
        open={!!selected}
        title={current?.subject || '工单'}
        size={600}
        onClose={() => setSelected(undefined)}
        extra={
          current && current.status !== 'closed' ? (
            <Button
              onClick={() =>
                modal.confirm({
                  title: '关闭此工单？',
                  okText: '关闭工单',
                  cancelText: '返回',
                  onOk: close,
                })
              }
            >
              关闭工单
            </Button>
          ) : undefined
        }
      >
        {current ? (
          <>
            <Descriptions
              size="small"
              column={1}
              items={[
                {
                  key: 'status',
                  label: '状态',
                  children: statuses[current.status]?.[0] || current.status,
                },
                { key: 'updated', label: '最近更新', children: date(current.updatedAt) },
              ]}
            />
            <div className="portal-ticket-thread">{current.thread}</div>
            {current.status !== 'closed' && (
              <Form
                form={replyForm}
                layout="vertical"
                onFinish={async (values) => {
                  setBusy(true)
                  try {
                    await api(`/extensions/support/tickets/${current.id}/reply`, {
                      method: 'POST',
                      body: values,
                    })
                    replyForm.resetFields()
                    tickets.reload()
                    message.success('回复已发送')
                  } catch (e) {
                    message.error(errorText(e))
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                <Form.Item
                  name="message"
                  label="回复"
                  rules={[{ required: true, message: '请输入回复内容' }]}
                >
                  <Input.TextArea rows={4} />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={busy}>
                  发送回复
                </Button>
              </Form>
            )}
          </>
        ) : (
          <Spin />
        )}
      </Drawer>
    </>
  )
}
