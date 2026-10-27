import { useCurrency } from '../currency'
import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Radio,
  Space,
  Typography,
} from 'antd'
import { api, errorText, redirectToPayment, useData } from '../api'
import type { Row } from '../api'
import { useSession } from '../context'
import { OrderStatus, useWallet } from './PortalShared'
import { availablePeriods, periodLabel } from '../planPeriods'

type Intent = { plan?: Row; order?: Row; rechargeAmount?: number }
export default function Checkout({
  intent,
  onClose,
  onComplete,
}: {
  intent: Intent
  onClose: () => void
  onComplete: () => void
}) {
  const { plugins } = useSession()
  const { message } = App.useApp()
  const wallet = useWallet()
  const channels = useData<Row[]>(
    plugins.some((p) => p.id === 'payments' && p.enabled) ? '/extensions/payments/channels' : null,
  )
  const enabledChannels = (channels.data || []).filter((row) => row.enabled !== false)
  const [order, setOrder] = useState<Row | undefined>(intent.order)
  const [method, setMethod] = useState(
    intent.order?.kind === 'recharge' || intent.rechargeAmount !== undefined ? '' : 'wallet',
  )
  const [coupon, setCoupon] = useState('')
  const periods = intent.plan ? availablePeriods(intent.plan) : []
  const [periodId, setPeriodId] = useState<string>(String(periods[0]?.id || ''))
  const period = periods.find((item) => item.id === periodId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const working = useRef(false)
  const completed = useRef(false)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const requestId = useRef(crypto.randomUUID())
  const recharge = intent.rechargeAmount !== undefined || order?.kind === 'recharge'
  const { money } = useCurrency()
  const amount = Number(order?.amount ?? intent.rechargeAmount ?? period?.price ?? 0)
  useEffect(() => {
    if (!method && enabledChannels.length) setMethod(String(enabledChannels[0].id))
  }, [enabledChannels, method])
  function complete() {
    if (completed.current) return
    completed.current = true
    message.success(recharge ? '充值已到账' : '支付成功，服务已开通')
    onCompleteRef.current()
  }
  async function proceed() {
    if (working.current) return
    working.current = true
    setBusy(true)
    setError('')
    try {
      if (!order) {
        const body = recharge
          ? { kind: 'recharge', amount: intent.rechargeAmount }
          : { planId: intent.plan?.id, periodId, coupon: coupon.trim() }
        setOrder(
          await api<Row>('/extensions/commerce/orders', {
            method: 'POST',
            body: { ...body, requestId: requestId.current },
          }),
        )
      } else if (method === 'wallet') {
        const result = await api<Row>(`/extensions/commerce/orders/${order.id}/pay`, {
          method: 'POST',
          body: {},
        })
        if (result.status === 'fulfilled') {
          complete()
        } else {
          setOrder(result)
          message.info('订单正在处理，可在我的订单查看结果')
        }
      } else {
        const result = await api<Row>('/extensions/payments/checkout', {
          method: 'POST',
          body: { orderId: order.id, channelId: method },
        })
        redirectToPayment(result.redirectUrl)
      }
    } catch (e) {
      setError(errorText(e))
    } finally {
      working.current = false
      setBusy(false)
    }
  }
  const insufficient = method === 'wallet' && wallet.balance < amount
  const settled = order && order.status !== 'pending'
  return (
    <Modal
      open
      title={recharge ? '余额充值' : '确认购买'}
      onCancel={busy ? undefined : onClose}
      closable={!busy}
      maskClosable={!busy}
      footer={
        settled ? (
          <Button onClick={onClose}>关闭</Button>
        ) : (
          <Space>
            <Button onClick={onClose} disabled={busy}>
              {order ? '稍后支付' : '取消'}
            </Button>
            <Button
              type="primary"
              loading={busy}
              disabled={
                (!order && !recharge && !period) ||
                (!!order && (insufficient || !method || (method === 'wallet' && wallet.loading)))
              }
              onClick={() => void proceed()}
            >
              {!order ? '创建订单' : method === 'wallet' ? '余额支付' : '立即支付'}
            </Button>
          </Space>
        )
      }
    >
      {error && <Alert type="error" title={error} showIcon className="portal-notice" />}
      <Descriptions
        column={1}
        size="small"
        items={[
          {
            key: 'name',
            label: '商品',
            children: order?.planName || intent.plan?.name || '余额充值',
          },
          {
            key: 'amount',
            label: order ? '订单金额' : '金额',
            children: <strong>{money(amount)}</strong>,
          },
          ...(order
            ? [
                {
                  key: 'number',
                  label: '订单号',
                  children: <Typography.Text copyable>{order.number}</Typography.Text>,
                },
                { key: 'status', label: '状态', children: <OrderStatus value={order.status} /> },
              ]
            : []),
        ]}
      />
      {!order && !recharge && (
        <Form layout="vertical" className="portal-checkout-form">
          <Form.Item label="购买选项">
            <Radio.Group
              value={periodId}
              onChange={(e) => {
                setPeriodId(e.target.value)
                requestId.current = crypto.randomUUID()
              }}
            >
              <Space orientation="vertical">
                {periods.map((item) => (
                  <Radio key={item.id} value={item.id}>
                    {periodLabel(item)} · {money(Number(item.price))}
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          </Form.Item>
          <Form.Item label="优惠码（可选）">
            <Input
              value={coupon}
              onChange={(e) => {
                setCoupon(e.target.value)
                requestId.current = crypto.randomUUID()
              }}
            />
          </Form.Item>
        </Form>
      )}
      {order && !settled && (
        <div className="portal-payment-methods">
          <h3>支付方式</h3>
          {channels.error && (
            <Alert
              type="warning"
              title={channels.error}
              action={<Button onClick={channels.reload}>重试</Button>}
            />
          )}
          <Radio.Group value={method} onChange={(e) => setMethod(e.target.value)}>
            <Space orientation="vertical">
              {!recharge && (
                <Radio value="wallet">
                  账户余额{' '}
                  <Typography.Text type="secondary">
                    {wallet.loading ? '读取中…' : money(wallet.balance)}
                  </Typography.Text>
                </Radio>
              )}
              {enabledChannels.map((channel) => (
                <Radio key={channel.id} value={channel.id}>
                  {channel.name}
                </Radio>
              ))}
            </Space>
          </Radio.Group>
          {insufficient && (
            <Alert
              type="warning"
              title="账户余额不足，请选择在线支付或先充值"
              className="portal-notice"
            />
          )}
          {!enabledChannels.length && !channels.loading && (
            <Typography.Paragraph type="secondary">本站暂未提供在线支付渠道。</Typography.Paragraph>
          )}
        </div>
      )}
    </Modal>
  )
}
