import { Button, Input, InputNumber, Select, Space } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useCurrency } from '../currency'
import type { Row } from '../api'
import { periodLabel } from '../planPeriods'

export function PlanPeriods({
  value = [],
  onChange,
}: {
  value?: Row[]
  onChange?: (value: Row[]) => void
}) {
  const { currencySymbol } = useCurrency()
  const change = (index: number, key: string, next: unknown) => {
    onChange?.(
      value.map((row, i) => {
        if (i !== index) return row
        const updated = { ...row }
        if (next === undefined) delete updated[key]
        else updated[key] = next
        if (
          ['kind', 'durationUnit', 'durationValue'].includes(key) &&
          row.label === periodLabel({ ...row, label: '' })
        ) {
          updated.label = periodLabel({ ...updated, label: '' })
        }
        return updated
      }),
    )
  }
  const flag = (
    period: Row,
    index: number,
    key: string,
    label: string,
    yes: string,
    no: string,
  ) => (
    <Select
      aria-label={label}
      value={period[key] === undefined ? 'inherit' : period[key] ? 'yes' : 'no'}
      onChange={(v) => change(index, key, v === 'inherit' ? undefined : v === 'yes')}
      style={{ width: 125 }}
      options={[
        { label: `${label}：跟随套餐`, value: 'inherit' },
        { label: yes, value: 'yes' },
        { label: no, value: 'no' },
      ]}
    />
  )
  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      {value.map((period, index) => (
        <div key={period.id}>
          <Space wrap align="start">
            <Input
              aria-label="周期名称"
              placeholder="名称（可选）"
              value={period.label || ''}
              onChange={(e) => change(index, 'label', e.target.value)}
              style={{ width: 130 }}
            />
            <Select
              aria-label="周期类型"
              value={period.kind || 'subscription'}
              onChange={(v) => change(index, 'kind', v)}
              style={{ width: 140 }}
              options={[
                { label: '订阅 / 续费', value: 'subscription' },
                { label: '延长时间', value: 'time' },
                { label: '流量加油包', value: 'traffic' },
                { label: '重置流量', value: 'reset' },
              ]}
            />
            {!['reset', 'traffic'].includes(period.kind) && (
              <>
                <InputNumber
                  aria-label="期限数量"
                  min={1}
                  precision={0}
                  value={period.durationValue}
                  onChange={(v) => change(index, 'durationValue', v)}
                  disabled={period.durationUnit === 'permanent'}
                  style={{ width: 78 }}
                />
                <Select
                  aria-label="期限单位"
                  value={period.durationUnit || 'month'}
                  onChange={(v) => change(index, 'durationUnit', v)}
                  style={{ width: 86 }}
                  options={[
                    { label: '月', value: 'month' },
                    { label: '天', value: 'day' },
                    { label: '长期', value: 'permanent' },
                  ]}
                />
              </>
            )}
            <InputNumber
              aria-label="周期价格"
              min={0}
              precision={2}
              prefix={currencySymbol}
              value={typeof period.price === 'number' ? period.price / 100 : null}
              onChange={(v) => change(index, 'price', v == null ? null : Math.round(v * 100))}
              style={{ width: 110 }}
            />
            <Button
              type="text"
              danger
              aria-label="删除周期"
              icon={<DeleteOutlined />}
              onClick={() => onChange?.(value.filter((_, i) => i !== index))}
            />
          </Space>
          <Space wrap style={{ marginTop: 6 }}>
            {flag(period, index, 'enabled', '上架', '上架', '下架')}
            {flag(period, index, 'visible', '公开', '公开', '隐藏')}
            {flag(period, index, 'renewable', '续费', '允许续费', '禁止续费')}
            {flag(period, index, 'reviewRequired', '核对', '待核对', '已核对')}
          </Space>
        </div>
      ))}
      <Button
        icon={<PlusOutlined />}
        onClick={() =>
          onChange?.([
            ...value,
            {
              id: crypto.randomUUID(),
              label: '',
              kind: 'subscription',
              durationUnit: 'month',
              durationValue: 1,
              price: 1000,
            },
          ])
        }
      >
        添加周期
      </Button>
    </Space>
  )
}
