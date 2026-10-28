import type { Field, Row } from '../api'
import { PlanPeriods } from '../components/PlanPeriods'
import { periodLabel } from '../planPeriods'

const controls = { periods: () => <PlanPeriods /> }

export function officialControl(field: Field) {
  return controls[field.type as keyof typeof controls]?.()
}

export function officialCell(field: Field, value: unknown, money: (amount: number) => string) {
  if (field.type !== 'periods' || !Array.isArray(value)) return undefined
  return (
    <>
      {value.map((period: Row) => (
        <div key={period.id}>
          {periodLabel(period)} · {money(Number(period.price))}
          {period.enabled === false ? '（下架）' : ''}
        </div>
      ))}
    </>
  )
}
