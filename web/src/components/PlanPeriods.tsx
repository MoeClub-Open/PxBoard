import { useState, type ReactNode } from 'react'
import { Button, Collapse, Input, InputNumber, Popconfirm, Select, Space, Typography } from 'antd'
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
  const [open, setOpen] = useState<string[]>([])
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
  const field = (label: string, element: ReactNode) => (
    <label style={{ display: 'grid', gap: 4 }}>
      <span>{label}</span>
      {element}
    </label>
  )
  const flag = (period: Row, index: number, key: string, label: string, yes: string, no: string) =>
    field(
      label,
      <Select
        aria-label={label}
        value={period[key] === undefined ? 'inherit' : period[key] ? 'yes' : 'no'}
        onChange={(v) => change(index, key, v === 'inherit' ? undefined : v === 'yes')}
        options={[
          { label: '跟随套餐', value: 'inherit' },
          { label: yes, value: 'yes' },
          { label: no, value: 'no' },
        ]}
      />,
    )
  const grid = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))',
    gap: 12,
  } as const
  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Collapse
        activeKey={open}
        onChange={(keys) => setOpen(keys.map(String))}
        items={value.map((period, index) => ({
          key: String(period.id),
          label: (
            <Space wrap>
              <strong>{periodLabel(period)}</strong>
              <Typography.Text type="secondary">
                {typeof period.price === 'number'
                  ? `${currencySymbol}${(period.price / 100).toFixed(2)}`
                  : '未设置价格'}
              </Typography.Text>
            </Space>
          ),
          extra: (
            <Popconfirm
              title="删除此周期？"
              description="保存后将不再提供此购买选项。"
              okText="删除"
              cancelText="取消"
              onConfirm={() => onChange?.(value.filter((_, i) => i !== index))}
            >
              <Button
                type="text"
                danger
                aria-label={`删除${periodLabel(period)}`}
                icon={<DeleteOutlined />}
                onClick={(e) => e.stopPropagation()}
              />
            </Popconfirm>
          ),
          children: (
            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
              <div style={grid}>
                {field(
                  '周期名称',
                  <Input
                    aria-label="周期名称"
                    placeholder="自动生成"
                    value={period.label || ''}
                    onChange={(e) => change(index, 'label', e.target.value)}
                  />,
                )}
                {field(
                  '周期类型',
                  <Select
                    aria-label="周期类型"
                    value={period.kind || 'subscription'}
                    onChange={(v) => change(index, 'kind', v)}
                    options={[
                      { label: '订阅 / 续费', value: 'subscription' },
                      { label: '延长时间', value: 'time' },
                      { label: '流量加油包', value: 'traffic' },
                      { label: '重置流量', value: 'reset' },
                    ]}
                  />,
                )}
                {!['reset', 'traffic'].includes(period.kind) &&
                  field(
                    '期限',
                    <Space.Compact style={{ width: '100%' }}>
                      <InputNumber
                        aria-label="期限数量"
                        min={1}
                        precision={0}
                        value={period.durationValue}
                        onChange={(v) => change(index, 'durationValue', v)}
                        disabled={period.durationUnit === 'permanent'}
                        style={{ width: '55%' }}
                      />
                      <Select
                        aria-label="期限单位"
                        value={period.durationUnit || 'month'}
                        onChange={(v) => change(index, 'durationUnit', v)}
                        style={{ width: '45%' }}
                        options={[
                          { label: '月', value: 'month' },
                          { label: '天', value: 'day' },
                          { label: '长期', value: 'permanent' },
                        ]}
                      />
                    </Space.Compact>,
                  )}
                {field(
                  '价格',
                  <InputNumber
                    aria-label="周期价格"
                    min={0}
                    precision={2}
                    prefix={currencySymbol}
                    value={typeof period.price === 'number' ? period.price / 100 : null}
                    onChange={(v) => change(index, 'price', v == null ? null : Math.round(v * 100))}
                    style={{ width: '100%' }}
                  />,
                )}
              </div>
              <Collapse
                size="small"
                items={[
                  {
                    key: 'options',
                    label: '此周期的销售设置',
                    children: (
                      <div style={grid}>
                        {flag(period, index, 'enabled', '上架', '上架', '下架')}
                        {flag(period, index, 'visible', '公开展示', '公开', '隐藏')}
                        {flag(period, index, 'renewable', '续费', '允许续费', '禁止续费')}
                        {flag(period, index, 'reviewRequired', '核对', '待核对', '已核对')}
                      </div>
                    ),
                  },
                ]}
              />
            </Space>
          ),
        }))}
      />
      <Button
        icon={<PlusOutlined />}
        onClick={() => {
          const id = crypto.randomUUID()
          onChange?.([
            ...value,
            {
              id,
              label: '',
              kind: 'subscription',
              durationUnit: 'month',
              durationValue: 1,
              price: 1000,
            },
          ])
          setOpen((keys) => [...keys, id])
        }}
      >
        添加周期
      </Button>
    </Space>
  )
}
