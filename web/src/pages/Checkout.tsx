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
import { api, errorText, useData } from '../api'
import type { Row } from '../api'
import { useSession } from '../context'
import { duration, money, OrderStatus, useWallet } from './PortalShared'

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
  const { me, plugins } = useSession()
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [redirect, setRedirect] = useState('')
  const working = useRef(false)
  const completed = useRef(false)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const requestId = useRef(crypto.randomUUID())
  const recharge = intent.rechargeAmount !== undefined || order?.kind === 'recharge'
  const amount = Number(order?.amount ?? intent.rechargeAmount ?? intent.plan?.price ?? 0)
  useEffect(() => {
    if (!method && enabledChannels.length) setMethod(String(enabledChannels[0].id))
  }, [enabledChannels, method])
  function complete() {
    if (completed.current) return
    completed.current = true
    message.success(recharge ? '充值已到账' : '支付成功，服务已开通')
    onCompleteRef.current()
  }
  useEffect(() => {
    if (!redirect || !order?.id) return
    const controller = new AbortController()
    const timer = setInterval(() => {
      if (document.hidden) return
      void api<Row[]>('/extensions/commerce/orders', { signal: controller.signal })
        .then((orders) => {
          if (controller.signal.aborted) return
          const current = orders.find((row) => row.id === order.id && row.userId === me.id)
          if (!current) return
          setOrder(current)
          setError('')
          if (current.status === 'fulfilled') complete()
          else if (!['pending', 'paid'].includes(current.status)) setRedirect('')
        })
        .catch((e) => {
          if (e.name !== 'AbortError') setError(errorText(e))
        })
    }, 5000)
    return () => {
      clearInterval(timer)
      controller.abort()
    }
  }, [redirect, order?.id, me.id])
  async function proceed() {
    if (working.current) return
    working.current = true
    setBusy(true)
    setError('')
    try {
      if (!order) {
        const body = recharge
          ? { kind: 'recharge', amount: intent.rechargeAmount }
          : { planId: intent.plan?.id, coupon: coupon.trim() }
        setOrder(
          await api<Row>('/extensions/commerce/orders', {
            method: 'POST',
            body: { ...body, requestId: requestId.current },
          }),
        )
      } else if (redirect) {
        const orders = await api<Row[]>('/extensions/commerce/orders')
        const current = orders.find((row) => row.id === order.id && row.userId === me.id)
        if (current?.status === 'fulfilled') {
          complete()
          return
        }
        if (current) setOrder(current)
        message.info(
          current?.status === 'paid' ? '已收到付款，正在开通' : '尚未确认付款，请稍后刷新',
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
        if (!result.redirectUrl) throw new Error('未取得支付地址，请重试')
        setRedirect(String(result.redirectUrl))
      }
    } catch (e) {
      setError(errorText(e))
    } finally {
      working.current = false
      setBusy(false)
    }
  }
  const insufficient = method === 'wallet' && wallet.balance < amount
  const settled = order && !['pending', 'paid'].includes(order.status)
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
              disabled={!!order && !redirect && (insufficient || !method || wallet.loading)}
              onClick={() => void proceed()}
            >
              {!order
                ? '创建订单'
                : redirect
                  ? '刷新支付状态'
                  : method === 'wallet'
                    ? '余额支付'
                    : '获取支付链接'}
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
          ...(intent.plan
            ? [{ key: 'duration', label: '期限', children: duration(intent.plan) }]
            : []),
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
      {order && !settled && !redirect && (
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
      {redirect && (
        <Alert
          type="info"
          showIcon
          title="等待支付"
          description={
            <Space orientation="vertical">
              <a href={redirect} target="_blank" rel="noreferrer">
                打开支付页面
              </a>
              <span>完成付款后刷新订单状态。</span>
            </Space>
          }
          className="portal-notice"
        />
      )}
    </Modal>
  )
}
