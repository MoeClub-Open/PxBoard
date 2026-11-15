import { Button, Input, InputNumber, Space } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { Row } from '../api'

export function NodeEndpoints({
  value,
  onChange,
}: {
  value?: Row[]
  onChange?: (value: Row[]) => void
}) {
  const rows: Row[] =
    Array.isArray(value) && value.length > 0 ? value : [{ host: '', port: 443 }]
  const showName = rows.length > 1 || rows.some((item) => Boolean(item?.name))

  function updateRow(index: number, patch: Row) {
    const next = rows.map((item, i) => (i === index ? { ...item, ...patch } : { ...item }))
    onChange?.(next)
  }

  return (
    <Space orientation="vertical" size={8} style={{ width: '100%' }}>
      {rows.map((item, index) => (
        <div
          key={index}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <Input
            style={{ flex: '2 1 190px' }}
            aria-label="连接地址"
            placeholder="连接地址（域名或 IP）"
            value={String(item.host ?? '')}
            onChange={(e) => updateRow(index, { host: e.target.value })}
          />
          <InputNumber
            style={{ width: 100 }}
            min={1}
            max={65535}
            precision={0}
            aria-label="连接端口"
            placeholder="端口"
            value={typeof item.port === 'number' ? item.port : Number(item.port) || 443}
            onChange={(v) => updateRow(index, { port: v ?? undefined })}
          />
          {showName && (
            <Input
              style={{ flex: '1.4 1 150px' }}
              aria-label="订阅显示名称"
              placeholder="订阅显示名称（选填）"
              value={String(item.name ?? '')}
              onChange={(e) => updateRow(index, { name: e.target.value })}
            />
          )}
          {rows.length > 1 && (
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              aria-label="删除地址"
              onClick={() => onChange?.(rows.filter((_, i) => i !== index))}
            />
          )}
        </div>
      ))}
      <Button
        icon={<PlusOutlined />}
        onClick={() =>
          onChange?.([
            ...rows,
            { host: '', port: Number(rows[0]?.port) || 443, name: '' },
          ])
        }
      >
        添加地址
      </Button>
    </Space>
  )
}
