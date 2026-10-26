import { useState } from 'react'
import { Alert, App, Button, Empty, Input, Space, Table, Tabs, Tag, Typography } from 'antd'
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import { absoluteURL, api, errorText, useData } from '../api'
import type { Row } from '../api'
import { useSession } from '../context'
import { date, money } from './PortalCommerce'
import AffiliateWithdrawal from './AffiliateWithdrawal'
import type { Method } from './AffiliateWithdrawal'
import '../affiliate.css'

type Summary = {
  availableAmount: number
  pendingAmount: number
  totalAmount: number
  invitedCount: number
  commissionPercent: number
  commissionHoldDays: number
  commissionMode: 'firstPurchase' | 'recurring'
  referralPath: string
}
const commissionStates: Record<string, [string, string]> = {
  pending: ['冻结中', 'warning'],
  available: ['可结算', 'success'],
  reversed: ['已撤回', 'default'],
  historical: ['历史记录', 'default'],
}
function CommissionStatus({ value }: { value: string }) {
  const status = commissionStates[value]
  return <Tag color={status?.[1]}>{status?.[0] || value}</Tag>
}
function WithdrawalStatus({ row }: { row: Row }) {
  const states: Record<string, [string, string]> = {
    pending: ['待审核', 'warning'],
    approving: ['转入中', 'processing'],
    approved: row.method === 'wallet' ? ['已入余额', 'success'] : ['待打款', 'processing'],
    paid: ['已打款', 'success'],
    rejected: ['已拒绝', 'default'],
    canceled: ['已撤回', 'default'],
  }
  const state = states[row.status]
  return <Tag color={state?.[1]}>{state?.[0] || row.status}</Tag>
}
export default function PortalReferrals() {
  const { me, plugins } = useSession()
  const { message, modal } = App.useApp()
  const enabled = plugins.some((plugin) => plugin.id === 'affiliate' && plugin.enabled)
  const summary = useData<Summary>(enabled ? '/extensions/affiliate/summary' : null, 15)
  const commissions = useData<Row[]>(enabled ? '/extensions/affiliate/commissions' : null, 15)
  const withdrawals = useData<Row[]>(enabled ? '/extensions/affiliate/withdrawals' : null, 15)
  const [method, setMethod] = useState<Method>()
  const [canceling, setCanceling] = useState('')
  const available = Number(summary.data?.availableAmount || 0)
  const referralURL = absoluteURL(
    summary.data?.referralPath || `/register?ref=${encodeURIComponent(me.id)}`,
  )
  const commissionRows = (commissions.data || []).filter((row) => row.userId === me.id)
  const withdrawalRows = (withdrawals.data || []).filter((row) => row.userId === me.id)
  function refresh() {
    summary.reload()
    commissions.reload()
    withdrawals.reload()
  }
  async function cancel(row: Row) {
    setCanceling(String(row.id))
    try {
      await api(`/extensions/affiliate/withdrawals/${encodeURIComponent(row.id)}/cancel`, {
        method: 'POST',
        body: {},
      })
      refresh()
      message.success('申请已撤回')
    } catch (e) {
      message.error(errorText(e))
      throw e
    } finally {
      setCanceling('')
    }
  }
  if (!enabled) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="推广暂不可用" />
  return (
    <>
      <div className="page-heading">
        <h1>推广返佣</h1>
        <Button icon={<ReloadOutlined />} onClick={refresh} aria-label="刷新推广信息" />
      </div>
      {summary.error && (
        <Alert
          type="error"
          title={summary.error}
          action={<Button onClick={summary.reload}>重试</Button>}
          className="portal-notice"
        />
      )}
      <section className="affiliate-invitation">
        <label htmlFor="affiliate-link">推广链接</label>
        <Space.Compact className="affiliate-link">
          <Input id="affiliate-link" value={referralURL} readOnly />
          <Button
            icon={<CopyOutlined />}
            onClick={() =>
              navigator.clipboard
                .writeText(referralURL)
                .then(() => message.success('链接已复制'))
                .catch(() => message.error('复制失败，请手动复制链接'))
            }
          >
            复制链接
          </Button>
        </Space.Compact>
        {summary.data && (
          <Space wrap className="affiliate-rules">
            <Typography.Text type="secondary">
              返佣 {summary.data.commissionPercent}%
            </Typography.Text>
            <Typography.Text type="secondary">
              冻结 {summary.data.commissionHoldDays} 天
            </Typography.Text>
            <Tag>{summary.data.commissionMode === 'firstPurchase' ? '首单返佣' : '持续返佣'}</Tag>
          </Space>
        )}
      </section>
      <div className="portal-statistics affiliate-statistics">
        <div>
          <span>可用佣金</span>
          <strong>{summary.data ? money(summary.data.availableAmount) : '—'}</strong>
        </div>
        <div>
          <span>冻结佣金</span>
          <strong>{summary.data ? money(summary.data.pendingAmount) : '—'}</strong>
        </div>
        <div>
          <span>累计佣金</span>
          <strong>{summary.data ? money(summary.data.totalAmount) : '—'}</strong>
        </div>
        <div>
          <span>邀请人数</span>
          <strong>
            {summary.data ? Number(summary.data.invitedCount).toLocaleString('zh-CN') : '—'}
          </strong>
        </div>
      </div>
      <div className="affiliate-actions">
        <Space wrap>
          <Button disabled={available < 100 || summary.loading} onClick={() => setMethod('wallet')}>
            申请转入余额
          </Button>
          <Button
            type="primary"
            disabled={available < 100 || summary.loading}
            onClick={() => setMethod('cash')}
          >
            申请提现
          </Button>
        </Space>
      </div>
      <Tabs
        items={[
          {
            key: 'commissions',
            label: '佣金记录',
            children: (
              <>
                {commissions.error && (
                  <Alert
                    type="error"
                    title={commissions.error}
                    action={<Button onClick={commissions.reload}>重试</Button>}
                    className="portal-notice"
                  />
                )}
                <Table<Row>
                  rowKey="id"
                  dataSource={commissionRows}
                  loading={commissions.loading}
                  pagination={{ pageSize: 10 }}
                  scroll={{ x: 650 }}
                  locale={{
                    emptyText: (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂时没有返佣记录" />
                    ),
                  }}
                  columns={[
                    {
                      title: '订单',
                      dataIndex: 'orderId',
                      render: (value) =>
                        value ? <Typography.Text copyable>{value}</Typography.Text> : '—',
                    },
                    { title: '佣金', dataIndex: 'amount', render: (value) => money(value) },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      render: (value) => <CommissionStatus value={value} />,
                    },
                    {
                      title: '可用时间',
                      dataIndex: 'availableAt',
                      render: (value) => (value ? date(value) : '—'),
                    },
                    {
                      title: '产生时间',
                      dataIndex: 'createdAt',
                      render: (value) => (value ? date(value) : '—'),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'withdrawals',
            label: '结算申请',
            children: (
              <>
                {withdrawals.error && (
                  <Alert
                    type="error"
                    title={withdrawals.error}
                    action={<Button onClick={withdrawals.reload}>重试</Button>}
                    className="portal-notice"
                  />
                )}
                <Table<Row>
                  rowKey="id"
                  dataSource={withdrawalRows}
                  loading={withdrawals.loading}
                  pagination={{ pageSize: 10 }}
                  scroll={{ x: 760 }}
                  locale={{
                    emptyText: (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有结算申请" />
                    ),
                  }}
                  columns={[
                    { title: '金额', dataIndex: 'amount', render: (value) => money(value) },
                    {
                      title: '方式',
                      dataIndex: 'method',
                      render: (value) => (value === 'cash' ? '现金提现' : '转入余额'),
                    },
                    { title: '状态', render: (_, row) => <WithdrawalStatus row={row} /> },
                    {
                      title: '收款账户',
                      dataIndex: 'payoutAccount',
                      render: (value) => value || '—',
                      ellipsis: true,
                    },
                    { title: '申请时间', dataIndex: 'createdAt', render: date },
                    {
                      title: '流水号',
                      dataIndex: 'reference',
                      render: (value) =>
                        value ? <Typography.Text copyable>{value}</Typography.Text> : '—',
                    },
                    {
                      title: '操作',
                      width: 85,
                      render: (_, row) =>
                        row.status === 'pending' ? (
                          <Button
                            size="small"
                            loading={canceling === row.id}
                            onClick={() =>
                              modal.confirm({
                                title: '撤回这笔结算申请？',
                                okText: '撤回申请',
                                cancelText: '返回',
                                onOk: () => cancel(row),
                              })
                            }
                          >
                            撤回
                          </Button>
                        ) : (
                          '—'
                        ),
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
      />
      {method && (
        <AffiliateWithdrawal
          method={method}
          available={available}
          onClose={() => setMethod(undefined)}
          onSubmitted={refresh}
        />
      )}
    </>
  )
}
