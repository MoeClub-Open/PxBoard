import { useCurrency } from '../currency'
import { DatePicker, Form, Input, InputNumber, Select, Switch } from 'antd'
import dayjs from 'dayjs'
import { useData, type Field, type Row } from '../api'
import { PlanPeriods } from './PlanPeriods'

function RemoteSelect({
  field,
  value,
  onChange,
}: {
  field: Field
  value?: string
  onChange?: (value: string) => void
}) {
  const { data, loading, error } = useData<Row[]>(field.optionsEndpoint || null)
  return (
    <Select
      value={value}
      onChange={onChange}
      disabled={field.readOnly}
      loading={loading}
      showSearch
      optionFilterProp="label"
      allowClear={!field.required}
      options={(data || []).map((row) => ({ label: row.name, value: row.id }))}
      notFoundContent={error || (loading ? '加载中' : '暂无可用选项')}
      status={error ? 'error' : undefined}
    />
  )
}

function visible(field: Field, values: Row) {
  return (
    !field.when ||
    Object.entries(field.when).every(([key, allowed]) =>
      allowed.includes(String(values[key] ?? '')),
    )
  )
}

function fieldValue(row: Row | undefined, key: string) {
  return key.split('.').reduce<any>((value, part) => value?.[part], row)
}

function fieldItem(f: Field, symbol: string) {
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
        prefix={f.type === 'money' ? symbol : undefined}
        step={f.type === 'money' ? 0.01 : 1}
      />
    )
  else if (f.type === 'boolean') control = <Switch />
  else if (f.type === 'periods') control = <PlanPeriods />
  else if (f.type === 'select' && f.optionsEndpoint) control = <RemoteSelect field={f} />
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
}

export function Fields({ fields, row }: { fields: Field[]; row?: Row }) {
  const { currencySymbol } = useCurrency()
  return fields.map((original) => {
    const field = original.optionsEndpoint?.includes('{id}')
      ? {
          ...original,
          optionsEndpoint: original.optionsEndpoint.replace(
            '{id}',
            encodeURIComponent(String(row?.id || '')),
          ),
        }
      : original
    return field.type === 'discount' ? (
      <Form.Item
        key={field.key}
        noStyle
        shouldUpdate={(previous, current) => previous.type !== current.type}
      >
        {({ getFieldValue }) =>
          fieldItem(
            {
              ...field,
              type: getFieldValue('type') === 'fixed' ? 'money' : 'number',
              label: getFieldValue('type') === 'fixed' ? '优惠金额' : '优惠比例（%）',
            },
            currencySymbol,
          )
        }
      </Form.Item>
    ) : field.when ? (
      <Form.Item
        key={field.key}
        noStyle
        shouldUpdate={(previous, current) =>
          Object.keys(field.when!).some((key) => previous[key] !== current[key])
        }
      >
        {({ getFieldsValue }) =>
          visible(field, getFieldsValue(true)) ? fieldItem(field, currencySymbol) : null
        }
      </Form.Item>
    ) : (
      fieldItem(field, currencySymbol)
    )
  })
}
export function formValues(fields: Field[], row?: Row) {
  return Object.fromEntries(
    fields.map((f) => {
      const stored = fieldValue(row, f.key)
      const value = stored ?? (row && f.key.includes('.') ? undefined : f.default)
      return [
        f.key,
        f.type === 'datetime' && value
          ? dayjs(value)
          : (f.type === 'money' || (f.type === 'discount' && row?.type === 'fixed')) &&
              typeof value === 'number'
            ? value / 100
            : value,
      ]
    }),
  )
}
export function serialize(fields: Field[], values: Row) {
  const result: Row = {}
  for (const field of fields) {
    if (!visible(field, values)) continue
    const value = values[field.key]
    const path = field.key.split('.')
    if (path.length > 1 && value === undefined) continue
    const key = path.pop()!
    const parent = path.reduce<Row>((row, part) => (row[part] ??= {}), result)
    parent[key] =
      field.type === 'datetime'
        ? value?.toISOString() || ''
        : (field.type === 'money' || (field.type === 'discount' && values.type === 'fixed')) &&
            typeof value === 'number'
          ? Math.round(value * 100)
          : (value ?? (field.type === 'boolean' ? false : ''))
  }
  return result
}
