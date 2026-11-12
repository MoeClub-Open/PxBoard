import { useCurrency } from '../currency'
import { useState } from 'react'
import { Alert, Button, Card, Flex, InputNumber, Space, Statistic, Table, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useRpc } from '../api'
import type { Row } from '../api'
import { useSession } from '../context'
import Checkout from './Checkout'
import { date, useWallet } from './PortalShared'

export function PortalWallet() {
  const { money, currencyName, currencySymbol } = useCurrency()
  const { plugins } = useSession()
  const wallet = useWallet()
  const channels = useRpc<Row[]>(
    plugins.some((p) => p.id === 'payments' && p.enabled) ? 'payments/channels.list' : null,
  )
  const [amount, setAmount] = useState<number | null>(50)
  const [recharge, setRecharge] = useState<number>()
  const canRecharge = (channels.data || []).some((row) => row.enabled !== false)
  return (
    <>
      <div className="page-heading">
        <h1>账户余额</h1>
        <Button icon={<ReloadOutlined />} onClick={wallet.reload}>
          刷新
        </Button>
      </div>
      {wallet.error && (
        <Alert
          type="error"
          title={wallet.error}
          action={<Button onClick={wallet.reload}>重试</Button>}
          className="portal-notice"
        />
      )}
      <Card size="small" className="section-card">
        <Flex justify="space-between" align="center" wrap gap={12}>
          <Statistic title="可用余额" value={wallet.loading ? '—' : money(wallet.balance)} />
          <Space.Compact>
            <InputNumber
              aria-label={`充值金额（${currencyName}）`}
              prefix={currencySymbol}
              min={1}
              precision={2}
              value={amount}
              onChange={setAmount}
            />
            <Button
              type="primary"
              disabled={!canRecharge || !amount}
              onClick={() => setRecharge(Math.round(Number(amount) * 100))}
            >
              充值
            </Button>
          </Space.Compact>
        </Flex>
      </Card>
      {!canRecharge && !channels.loading && (
        <Alert
          type={channels.error ? 'warning' : 'info'}
          title={channels.error || '本站暂未提供在线充值'}
          className="portal-notice"
        />
      )}
      <Table<Row>
        rowKey="id"
        size="small"
        dataSource={wallet.rows}
        loading={wallet.loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 500 }}
        columns={[
          {
            title: '变动金额',
            dataIndex: 'amount',
            render: (value) => (
              <Typography.Text type={value < 0 ? 'danger' : undefined}>
                {value > 0 ? '+' : ''}
                {money(value)}
              </Typography.Text>
            ),
          },
          { title: '说明', dataIndex: 'reason' },
          { title: '时间', dataIndex: 'createdAt', render: date },
        ]}
      />
      {recharge !== undefined && (
        <Checkout
          key={recharge}
          intent={{ rechargeAmount: recharge }}
          onClose={() => setRecharge(undefined)}
          onComplete={() => {
            setRecharge(undefined)
            wallet.reload()
          }}
        />
      )}
    </>
  )
}
