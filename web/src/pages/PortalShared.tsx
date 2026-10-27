import { Tag } from 'antd'
import { useData } from '../api'
import type { Row } from '../api'
import { useSession } from '../context'

export const date = (value?: string) =>
  value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '长期有效'
export const duration = (plan: Row) =>
  plan.kind === 'reset'
    ? '单次重置'
    : plan.kind === 'traffic'
      ? '流量加油包'
      : plan.durationUnit === 'permanent'
        ? '长期'
        : `${plan.durationValue || 0} ${plan.durationUnit === 'month' ? '个月' : '天'}`
const orderStates: Record<string, [string, string]> = {
  pending: ['待支付', 'warning'],
  paid: ['开通中', 'processing'],
  fulfilled: ['已完成', 'success'],
  canceled: ['已取消', 'default'],
  refunded: ['已退款', 'default'],
  refunding: ['退款中', 'processing'],
}
export function OrderStatus({ value }: { value: string }) {
  const status = orderStates[value]
  return <Tag color={status?.[1]}>{status?.[0] || value}</Tag>
}
export function useWallet(enabled = true) {
  const { me } = useSession()
  const data = useData<Row[]>(enabled ? '/extensions/commerce/ledger?mine=1' : null)
  const rows = (data.data || []).filter((row) => row.userId === me.id)
  return {
    ...data,
    rows,
    balance: rows.reduce(
      (sum, row) => (row.affectsBalance === false ? sum : sum + Number(row.amount || 0)),
      0,
    ),
  }
}
