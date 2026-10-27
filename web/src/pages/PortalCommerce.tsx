import { useCurrency } from '../currency'
import { useEffect, useRef, useState } from 'react'
import { Alert, App, Button, Empty, Table } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useData } from '../api'
import type { Row } from '../api'
import Checkout from './Checkout'
import { availablePeriods, periodLabel } from '../planPeriods'

export { date, duration, OrderStatus, useWallet } from './PortalShared'
export { PortalOrders } from './PortalOrders'
export { PortalWallet } from './PortalWallet'

export function PortalPlans() {
  const { money } = useCurrency()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [query, setQuery] = useSearchParams()
  const plans = useData<Row[]>('/extensions/commerce/plans?scope=mine')
  const [selected, setSelected] = useState<Row>()
  const openedPlan = useRef<string | null>(null)
  const requestedPlan = query.get('plan')
  const rows = (plans.data || []).filter((row) => availablePeriods(row).length > 0)
  function clearPlanQuery() {
    setQuery(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('plan')
        return next
      },
      { replace: true },
    )
  }
  function closeCheckout() {
    setSelected(undefined)
    clearPlanQuery()
  }
  useEffect(() => {
    if (!requestedPlan) {
      openedPlan.current = null
      return
    }
    if (!plans.data || plans.loading || openedPlan.current === requestedPlan) return
    openedPlan.current = requestedPlan
    const plan = plans.data.find(
      (row) => row.id === requestedPlan && availablePeriods(row).length > 0,
    )
    if (plan) setSelected(plan)
    else {
      message.warning('该套餐已下架或不存在')
      clearPlanQuery()
    }
  }, [requestedPlan, plans.data, plans.loading])
  return (
    <>
      <div className="page-heading">
        <h1>选购套餐</h1>
        <Button icon={<ReloadOutlined />} onClick={plans.reload} aria-label="刷新套餐" />
      </div>
      {plans.error && (
        <Alert
          type="error"
          title={plans.error}
          action={<Button onClick={plans.reload}>重试</Button>}
        />
      )}
      <Table<Row>
        rowKey="id"
        dataSource={rows}
        loading={plans.loading}
        pagination={false}
        scroll={{ x: 640 }}
        locale={{
          emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无在售套餐" />,
        }}
        columns={[
          {
            title: '套餐',
            dataIndex: 'name',
            render: (value, row) => (
              <div>
                <strong>{value}</strong>
                {row.description && <div className="portal-secondary">{row.description}</div>}
              </div>
            ),
          },
          {
            title: '购买选项',
            render: (_, row) =>
              availablePeriods(row).map((period) => (
                <div key={period.id}>
                  {periodLabel(period)} · {money(Number(period.price))}
                </div>
              )),
          },
          {
            title: '流量',
            render: (_, row) =>
              row.unlimited ? '不限量' : `${Number(row.quotaGiB || 0).toLocaleString()} GB`,
          },
          {
            title: '',
            width: 100,
            render: (_, row) => (
              <Button type="primary" onClick={() => setSelected(row)}>
                选购
              </Button>
            ),
          },
        ]}
      />
      {selected && (
        <Checkout
          key={selected.id}
          intent={{ plan: selected }}
          onClose={closeCheckout}
          onComplete={() => {
            closeCheckout()
            navigate('/user/subscriptions')
          }}
        />
      )}
    </>
  )
}
