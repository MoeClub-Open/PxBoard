import { useRef, useState } from 'react'
import { Alert, App, Button, Descriptions, Form, Input, InputNumber, Modal, Space } from 'antd'
import { api, errorText } from '../api'
import { money } from './PortalCommerce'

export type Method = 'wallet' | 'cash'
function cents(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('金额最多保留两位小数')
  const [whole, fraction = ''] = value.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

export default function AffiliateWithdrawal({
  method,
  available,
  onClose,
  onSubmitted,
}: {
  method: Method
  available: number
  onClose: () => void
  onSubmitted: () => void
}) {
  const { message } = App.useApp()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const wallet = method === 'wallet'
  const minimum = wallet ? 1 : 100
  const requestId = useRef(crypto.randomUUID())
  const sending = useRef(false)
  async function submit(values: { amount: string; payoutAccount?: string }) {
    if (sending.current) return
    let amount: number
    try {
      amount = cents(values.amount)
    } catch (e) {
      setError(errorText(e))
      return
    }
    if (amount < minimum || amount > available) {
      setError(wallet ? '转入金额需在 0.01 元至可用佣金之间' : '申请金额需在 1 元至可用佣金之间')
      return
    }
    sending.current = true
    setBusy(true)
    setError('')
    try {
      const result = await api<{ status: string }>('/extensions/affiliate/withdrawals', {
        method: 'POST',
        body: {
          amount,
          method,
          requestId: requestId.current,
          ...(method === 'cash' ? { payoutAccount: values.payoutAccount?.trim() } : {}),
        },
      })
      onClose()
      onSubmitted()
      if (wallet && result.status !== 'approved') message.info('正在转入余额，请稍后查看')
      else message.success(wallet ? '已转入余额' : '提现申请已提交，等待审核')
    } catch (e) {
      setError(errorText(e))
    } finally {
      sending.current = false
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      title={wallet ? '转入余额' : '申请提现'}
      onCancel={busy ? undefined : onClose}
      closable={!busy}
      maskClosable={!busy}
      footer={null}
      destroyOnHidden
    >
      {error && <Alert type="error" title={error} showIcon className="portal-notice" />}
      <Descriptions
        size="small"
        column={1}
        items={[
          { key: 'available', label: '可用佣金', children: money(available) },
          {
            key: 'process',
            label: '处理方式',
            children: wallet ? '直接计入账户余额' : '审核通过后安排打款',
          },
        ]}
      />
      <Form
        initialValues={{ amount: (Math.max(0, available) / 100).toFixed(2) }}
        layout="vertical"
        disabled={busy}
        onValuesChange={() => {
          requestId.current = crypto.randomUUID()
          setError('')
        }}
        onFinish={(values) => void submit(values)}
        className="affiliate-form"
      >
        <Form.Item
          name="amount"
          label={wallet ? '转入金额（元）' : '申请金额（元）'}
          rules={[{ required: true, message: wallet ? '请输入转入金额' : '请输入申请金额' }]}
        >
          <InputNumber<string>
            stringMode
            precision={2}
            min={wallet ? '0.01' : '1'}
            max={(available / 100).toFixed(2)}
            prefix="¥"
            style={{ width: '100%' }}
          />
        </Form.Item>
        {method === 'cash' && (
          <Form.Item
            name="payoutAccount"
            label="收款方式与账户"
            rules={[{ required: true, whitespace: true, message: '请填写收款方式、账户和收款人' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="支付宝 / 银行卡及收款人"
              maxLength={500}
              showCount
            />
          </Form.Item>
        )}
        <Space className="affiliate-form-actions">
          <Button disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button type="primary" htmlType="submit" loading={busy}>
            {wallet ? '确认转入' : '提交申请'}
          </Button>
        </Space>
      </Form>
    </Modal>
  )
}
