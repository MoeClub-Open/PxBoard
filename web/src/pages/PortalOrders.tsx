import { useCurrency } from '../currency'
import { useState } from 'react'
import { Alert, App, Button, Empty, Space, Table, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { api, errorText, useData } from '../api'
import type { Row } from '../api'
import { useSession } from '../context'
import Checkout from './Checkout'
import { date, OrderStatus } from './PortalShared'

export function PortalOrders() {
  const { money } = useCurrency()
  const { me } = useSession()
  const { message, modal } = App.useApp()
  const orders = useData<Row[]>('/extensions/commerce/orders?mine=1', 10)
  const [selected, setSelected] = useState<Row>()
  async function cancel(row: Row) {
    try {
      await api(`/extensions/commerce/orders/${row.id}/cancel`, { method: 'POST', body: {} })
      orders.reload()
      message.success('订单已取消')
    } catch (e) {
      message.error(errorText(e))
    }
  }
  return (
    <>
      <div className="page-heading">
        <h1>我的订单</h1>
        <Button icon={<ReloadOutlined />} onClick={orders.reload} aria-label="刷新订单" />
      </div>
      {orders.error && (
        <Alert
          type="error"
          title={orders.error}
          action={<Button onClick={orders.reload}>重试</Button>}
        />
      )}
      <Table<Row>
        rowKey="id"
        dataSource={(orders.data || []).filter((row) => row.userId === me.id)}
        loading={orders.loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 780 }}
        locale={{
          emptyText: (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有订单">
              <Link to="/user/plans">
                <Button type="primary">选购套餐</Button>
              </Link>
            </Empty>
          ),
        }}
        columns={[
          {
            title: '订单',
            dataIndex: 'number',
            render: (value, row) => (
              <div>
                <Typography.Text copyable>{value}</Typography.Text>
                <div className="portal-secondary">{row.planName}</div>
              </div>
            ),
          },
          { title: '金额', dataIndex: 'amount', render: (value) => money(value) },
          { title: '状态', dataIndex: 'status', render: (value) => <OrderStatus value={value} /> },
          { title: '创建时间', dataIndex: 'createdAt', render: date },
          {
            title: '操作',
            render: (_, row) =>
              ['pending', 'paid'].includes(row.status) ? (
                <Space>
                  <Button size="small" type="primary" onClick={() => setSelected(row)}>
                    继续支付
                  </Button>
                  {row.status === 'pending' && (
                    <Button
                      size="small"
                      onClick={() =>
                        modal.confirm({
                          title: '取消这笔订单？',
                          okText: '取消订单',
                          cancelText: '返回',
                          onOk: () => cancel(row),
                        })
                      }
                    >
                      取消
                    </Button>
                  )}
                </Space>
              ) : (
                '—'
              ),
          },
        ]}
      />
      {selected && (
        <Checkout
          key={selected.id}
          intent={{ order: selected }}
          onClose={() => setSelected(undefined)}
          onComplete={() => {
            setSelected(undefined)
            orders.reload()
          }}
        />
      )}
    </>
  )
}
