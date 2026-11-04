import { Button, Input, Space } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { Field, Row } from '../api'
import { PlanPeriods } from '../components/PlanPeriods'
import { periodLabel } from '../planPeriods'

function SiteItemsEditor({
  value = [],
  onChange,
  withRegion = false,
}: {
  value?: Row[]
  onChange?: (value: Row[]) => void
  withRegion?: boolean
}) {
  const items = Array.isArray(value) ? value : []
  const update = (index: number, key: string, next: string) => {
    onChange?.(items.map((item, i) => (i === index ? { ...item, [key]: next } : item)))
  }
  return (
    <Space orientation="vertical" size={10} style={{ width: '100%' }}>
      {items.map((item, index) => (
        <div
          key={index}
          style={{
            padding: 12,
            borderRadius: 8,
            border: '1px solid var(--px-border-soft)',
            background: 'var(--px-fill)',
            display: 'grid',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <Input
              style={{ flex: '1 1 180px' }}
              aria-label={withRegion ? '线路标题' : '功能标题'}
              placeholder={
                withRegion ? '线路标题，如：亚太高速接入' : '功能标题，如：主流客户端通用订阅'
              }
              value={String(item.title ?? '')}
              onChange={(e) => update(index, 'title', e.target.value)}
            />
            {withRegion && (
              <Input
                style={{ flex: '1 1 180px' }}
                aria-label="覆盖区域或标签"
                placeholder="区域或标签，如：香港 · 日本 · 新加坡"
                value={String(item.region ?? '')}
                onChange={(e) => update(index, 'region', e.target.value)}
              />
            )}
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              aria-label="删除条目"
              onClick={() => onChange?.(items.filter((_, i) => i !== index))}
            />
          </div>
          <Input.TextArea
            aria-label={withRegion ? '线路说明' : '功能说明'}
            placeholder={withRegion ? '线路特点与适用场景说明' : '功能说明'}
            autoSize={{ minRows: 2, maxRows: 4 }}
            value={String(item.description ?? '')}
            onChange={(e) => update(index, 'description', e.target.value)}
          />
        </div>
      ))}
      <Button
        icon={<PlusOutlined />}
        onClick={() =>
          onChange?.([
            ...items,
            withRegion
              ? { title: '', region: '', description: '' }
              : { title: '', description: '' },
          ])
        }
      >
        {withRegion ? '添加线路介绍' : '添加功能特性'}
      </Button>
    </Space>
  )
}

const controls = {
  periods: () => <PlanPeriods />,
  siteRoutes: () => <SiteItemsEditor withRegion />,
  siteFeatures: () => <SiteItemsEditor />,
}

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
