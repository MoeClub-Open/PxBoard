import type { Row } from './api'

export function periodLabel(period: Row) {
  if (period.label) return String(period.label)
  if (period.kind === 'reset') return '重置流量'
  if (period.kind === 'traffic') return '流量加油包'
  if (period.durationUnit === 'permanent') return '长期'
  return `${period.durationValue || 0} ${period.durationUnit === 'month' ? '个月' : '天'}`
}

export function availablePeriods(plan: Row): Row[] {
  return Array.isArray(plan.periods) ? plan.periods : []
}
