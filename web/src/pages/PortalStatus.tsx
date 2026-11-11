import { useState } from 'react'
import { Alert, Button, Empty, Input, Space, Table, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useRpc } from '../api'
import type { Row } from '../api'
import { useSession } from '../context'

const states: Record<string, { label: string; color: string }> = {
  online: { label: '在线', color: 'success' },
  offline: { label: '离线', color: 'error' },
  never: { label: '未接入', color: 'default' },
  disabled: { label: '已停用', color: 'default' },
}

export default function PortalStatus() {
  const { me } = useSession()
  const status = useRpc<Row[]>(
    'nodes/status.list',
    me.role === 'admin' ? { scope: 'mine' } : undefined,
    10,
  )
  const display = useRpc<{ fields: string[] }>('nodes/status.display')
  const [search, setSearch] = useState('')
  const rows = status.data || []
  const visible = rows.filter((server) =>
    `${server.name} ${server.region || ''}`.toLowerCase().includes(search.toLowerCase()),
  )
  const online = rows.filter((server) => server.status === 'online').length
  const fields = display.data?.fields || []

  return (
    <>
      <div className="page-heading">
        <h1>服务器状态</h1>
        <Button icon={<ReloadOutlined />} aria-label="刷新服务器状态" onClick={status.reload} />
      </div>
      {(status.error || display.error) && (
        <Alert
          type="error"
          title={status.error || display.error}
          showIcon
          action={
            <Button
              onClick={() => {
                status.reload()
                display.reload()
              }}
            >
              重试
            </Button>
          }
          className="portal-notice"
        />
      )}
      <div className="portal-statistics">
        <div>
          <span>可用服务器</span>
          <strong>{status.data ? rows.length : '—'}</strong>
        </div>
        {fields.includes('status') && (
          <div>
            <span>在线</span>
            <strong>{status.data ? online : '—'}</strong>
          </div>
        )}
        {fields.includes('status') && (
          <div>
            <span>离线</span>
            <strong>{status.data ? rows.filter((server) => server.status !== 'online').length : '—'}</strong>
          </div>
        )}
      </div>
      <div className="table-toolbar">
        <Typography.Text type="secondary">服务器列表</Typography.Text>
        <Space>
          <Input.Search
            placeholder="搜索服务器或地区"
            allowClear
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ width: 240, maxWidth: '65vw' }}
          />
        </Space>
      </div>
      <Table<Row>
        rowKey="id"
        size="middle"
        loading={status.loading || display.loading}
        dataSource={visible}
        scroll={{ x: 620 }}
        pagination={{ pageSize: 12, showTotal: (total) => `共 ${total} 台服务器` }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={search ? '没有匹配的服务器' : '暂无可查看的服务器'}
            />
          ),
        }}
        columns={[
          { title: '服务器', dataIndex: 'name' },
          ...(fields.includes('region')
            ? [{ title: '地区', dataIndex: 'region', render: (value: any) => value || '—' }]
            : []),
          ...(fields.includes('status')
            ? [
                {
                  title: '状态',
                  dataIndex: 'status',
                  render: (value: any) => (
                    <Tag color={states[value]?.color}>{states[value]?.label || value}</Tag>
                  ),
                },
              ]
            : []),
          ...(fields.includes('nodeCount')
            ? [
                {
                  title: '运行节点',
                  dataIndex: 'nodeCount',
                  render: (value: any) => value ?? '—',
                },
              ]
            : []),
          ...[
            ['cpuPercent', 'CPU'],
            ['memoryPercent', '内存'],
            ['diskPercent', '磁盘'],
            ['swapPercent', '交换空间'],
          ]
            .filter(([key]) => fields.includes(key))
            .map(([key, title]) => ({
              title,
              dataIndex: key,
              render: (value: any) => (typeof value === 'number' ? `${value.toFixed(1)}%` : '—'),
            })),
          ...(fields.includes('onlineAccounts')
            ? [
                {
                  title: '在线账户',
                  dataIndex: 'onlineAccounts',
                  render: (value: any) => value ?? '—',
                },
              ]
            : []),
          ...(fields.includes('lastSeen')
            ? [
                {
                  title: '最近心跳',
                  dataIndex: 'lastSeen',
                  render: (value: any) =>
                    value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '尚未上报',
                },
              ]
            : []),
        ]}
      />
    </>
  )
}
