import { DatePicker, Form, Input, InputNumber, Select, Switch } from 'antd'
import dayjs from 'dayjs'
import type { Field, Row } from '../api'

export function Fields({ fields }: { fields: Field[] }) {
  return fields.map((f) => {
    if (f.type === 'hidden')
      return (
        <Form.Item key={f.key} name={f.key} hidden>
          <Input />
        </Form.Item>
      )
    let control = <Input disabled={f.readOnly} />
    if (f.type === 'password') control = <Input.Password autoComplete="new-password" />
    else if (f.type === 'textarea')
      control = <Input.TextArea autoSize={{ minRows: 4, maxRows: 14 }} />
    else if (['number', 'money', 'gib'].includes(f.type || ''))
      control = (
        <InputNumber
          style={{ width: '100%' }}
          precision={f.type === 'money' ? 2 : undefined}
          prefix={f.type === 'money' ? '¥' : undefined}
          step={f.type === 'money' ? 0.01 : 1}
        />
      )
    else if (f.type === 'boolean') control = <Switch />
    else if (f.type === 'select')
      control = (
        <Select
          showSearch
          optionFilterProp="label"
          options={f.options || []}
          allowClear={!f.required}
        />
      )
    else if (f.type === 'datetime')
      control = <DatePicker showTime style={{ width: '100%' }} format="YYYY-MM-DD HH:mm" />
    else if (f.type === 'email') control = <Input type="email" autoComplete="email" />
    else if (f.type === 'url') control = <Input type="url" placeholder="https://" />
    return (
      <Form.Item
        key={f.key}
        label={f.label}
        name={f.key}
        tooltip={f.hint}
        valuePropName={f.type === 'boolean' ? 'checked' : 'value'}
        rules={f.required ? [{ required: true, message: `请填写${f.label}` }] : []}
      >
        {control}
      </Form.Item>
    )
  })
}
export function formValues(fields: Field[], row?: Row) {
  return Object.fromEntries(
    fields.map((f) => {
      const value = row?.[f.key] ?? f.default
      return [
        f.key,
        f.type === 'datetime' && value
          ? dayjs(value)
          : f.type === 'money' && typeof value === 'number'
            ? value / 100
            : value,
      ]
    }),
  )
}
export function serialize(fields: Field[], values: Row) {
  return Object.fromEntries(
    fields.map((f) => [
      f.key,
      f.type === 'datetime'
        ? values[f.key]?.toISOString() || ''
        : f.type === 'money' && typeof values[f.key] === 'number'
          ? Math.round(values[f.key] * 100)
          : (values[f.key] ?? (f.type === 'boolean' ? false : '')),
    ]),
  )
}
