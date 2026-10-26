import { useState } from 'react'
import { Alert, App, Button, Form, Input, InputNumber, Table, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { api, errorText, useData } from '../api'
import type { Row } from '../api'
import { useSession } from '../context'
import Checkout from './Checkout'
import { date, money, useWallet } from './PortalShared'

export function PortalWallet() {
  const { plugins } = useSession()
  const { message } = App.useApp()
  const wallet = useWallet()
  const channels = useData<Row[]>(
    plugins.some((p) => p.id === 'payments' && p.enabled) ? '/extensions/payments/channels' : null,
  )
  const [amount, setAmount] = useState<number | null>(50)
  const [recharge, setRecharge] = useState<number>()
  const [redeeming, setRedeeming] = useState(false)
  const [redeemForm] = Form.useForm()
  const canRecharge = (channels.data || []).some((row) => row.enabled !== false)
  return (
    <>
      <div className="page-heading">
        <h1>账户余额</h1>
        <Button icon={<ReloadOutlined />} onClick={wallet.reload} aria-label="刷新余额" />
      </div>
      {wallet.error && (
        <Alert
          type="error"
          title={wallet.error}
          action={<Button onClick={wallet.reload}>重试</Button>}
        />
      )}
      <div className="portal-wallet">
        <div>
          <span className="portal-secondary">可用余额</span>
          <strong>{wallet.loading ? '—' : money(wallet.balance)}</strong>
        </div>
        <div className="portal-recharge">
          <InputNumber
            aria-label="充值金额（元）"
            prefix="¥"
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
        </div>
      </div>
      {!canRecharge && !channels.loading && (
        <Alert
          type={channels.error ? 'warning' : 'info'}
          title={channels.error || '本站暂未提供在线充值，可使用充值卡兑换余额'}
          className="portal-notice"
        />
      )}
      <Form
        form={redeemForm}
        layout="inline"
        className="portal-redeem"
        onFinish={async ({ code }) => {
          setRedeeming(true)
          try {
            await api('/extensions/commerce/gifts/redeem', { method: 'POST', body: { code } })
            redeemForm.resetFields()
            wallet.reload()
            message.success('充值卡已兑换')
          } catch (e) {
            message.error(errorText(e))
          } finally {
            setRedeeming(false)
          }
        }}
      >
        <Form.Item name="code" rules={[{ required: true, message: '请输入充值卡兑换码' }]}>
          <Input aria-label="充值卡兑换码" placeholder="充值卡兑换码" />
        </Form.Item>
        <Form.Item>
          <Button htmlType="submit" loading={redeeming}>
            兑换
          </Button>
        </Form.Item>
      </Form>
      <Table<Row>
        rowKey="id"
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
