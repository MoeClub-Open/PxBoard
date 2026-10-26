import { useState } from 'react'
import { Alert, Button, Empty, Input, Space, Table, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useData } from '../api'
import type { Row } from '../api'
import { useSession } from '../context'

const states: Record<string, { label: string; color: string }> = {
  online: { label: '在线', color: 'success' },
  offline: { label: '离线', color: 'error' },
  never: { label: '未接入', color: 'default' },
  disabled: { label: '已停用', color: 'default' },
  error: { label: '运行异常', color: 'warning' },
}

export default function PortalStatus() {
  const { me } = useSession()
  const status = useData<Row[]>(
    `/extensions/nodes/status${me.role === 'admin' ? '?scope=mine' : ''}`,
    10,
  )
  const [search, setSearch] = useState('')
  const rows = status.data || []
  const visible = rows.filter((node) =>
    `${node.name} ${node.region || ''} ${node.protocol}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )
  const online = rows.filter((node) => node.status === 'online').length

  return (
    <>
      <div className="page-heading">
        <h1>节点状态</h1>
        <Button icon={<ReloadOutlined />} aria-label="刷新节点状态" onClick={status.reload} />
      </div>
      {status.error && (
        <Alert
          type="error"
          title={status.error}
          showIcon
          action={<Button onClick={status.reload}>重试</Button>}
          className="portal-notice"
        />
      )}
      <div className="portal-statistics">
        <div>
          <span>可用节点</span>
          <strong>{status.data ? rows.length : '—'}</strong>
        </div>
        <div>
          <span>在线</span>
          <strong>{status.data ? online : '—'}</strong>
        </div>
        <div>
          <span>离线或异常</span>
          <strong>
            {status.data
              ? rows.filter((node) => node.status === 'offline' || node.status === 'error').length
              : '—'}
          </strong>
        </div>
      </div>
      <div className="table-toolbar">
        <Typography.Text type="secondary">最近心跳</Typography.Text>
        <Space>
          <Input.Search
            placeholder="搜索节点或地区"
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
        loading={status.loading}
        dataSource={visible}
        scroll={{ x: 620 }}
        pagination={{ pageSize: 12, showTotal: (total) => `共 ${total} 个节点` }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={search ? '没有匹配的节点' : '暂无可查看的节点'}
            />
          ),
        }}
        columns={[
          { title: '节点', dataIndex: 'name' },
          { title: '地区', dataIndex: 'region', render: (value) => value || '—' },
          {
            title: '协议',
            dataIndex: 'protocol',
            render: (value) => <Tag>{String(value).toUpperCase()}</Tag>,
          },
          {
            title: '状态',
            dataIndex: 'status',
            render: (value) => (
              <Tag color={states[value]?.color}>{states[value]?.label || value}</Tag>
            ),
          },
          {
            title: '流量倍率',
            dataIndex: 'trafficRate',
            render: (value) => (value === undefined ? '—' : `${value}×`),
          },
          {
            title: '最近心跳',
            dataIndex: 'lastSeen',
            render: (value) =>
              value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '尚未上报',
          },
        ]}
      />
    </>
  )
}
