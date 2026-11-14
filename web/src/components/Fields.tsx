import { useCurrency } from '../currency'
import { App, Button, DatePicker, Form, Input, InputNumber, Select, Space, Switch } from 'antd'
import { CopyOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { absoluteURL, pluginResourceTarget, useRpc, type Field, type Row } from '../api'
import { officialControl } from '../official/fields'

function CopyField({ value }: { value?: string }) {
  const { message } = App.useApp()
  const raw = String(value ?? '')
  const text = raw.startsWith('/') && !raw.startsWith('//') ? absoluteURL(raw) : raw
  return (
    <Space.Compact style={{ width: '100%' }}>
      <Input readOnly value={text} />
      <Button
        icon={<CopyOutlined />}
        disabled={!text}
        onClick={() =>
          void navigator.clipboard
            .writeText(text)
            .then(() => message.success('已复制'))
            .catch(() => message.error('复制失败，请手动复制'))
        }
      >
        复制
      </Button>
    </Space.Compact>
  )
}

function RemoteSelect({
  field,
  pluginId,
  value,
  onChange,
}: {
  field: Field
  pluginId?: string
  value?: string
  onChange?: (value: string) => void
}) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250)
    return () => clearTimeout(timer)
  }, [search])
  const resolved = field.optionsEndpoint
    ? pluginResourceTarget(
        pluginId || 'core',
        field.optionsEndpoint,
        undefined,
        field.optionsSearch ? { q: query, id: value || '' } : undefined,
      )
    : null
  const { data, loading, error } = useRpc<Row[]>(resolved?.target || null, resolved?.input)
  return (
    <Select
      value={value}
      onChange={onChange}
      disabled={field.readOnly}
      loading={loading}
      showSearch
      optionFilterProp="label"
      filterOption={field.optionsSearch ? false : undefined}
      onSearch={field.optionsSearch ? setSearch : undefined}
      allowClear={!field.required}
      options={(data || []).map((row) => ({ label: row.name, value: row.id }))}
      notFoundContent={error || (loading ? '加载中' : '暂无可用选项')}
      status={error ? 'error' : undefined}
    />
  )
}

function GroupSelect({
  field,
  pluginId,
  value = [],
  onChange,
}: {
  field: Field
  pluginId?: string
  value?: string[]
  onChange?: (value: string[]) => void
}) {
  const resolved = field.optionsEndpoint
    ? pluginResourceTarget(pluginId || 'nodes', field.optionsEndpoint)
    : null
  const { data, loading, error } = useRpc<Row[]>(resolved?.target || null, resolved?.input)
  const options = (data || []).map((row) => ({
    label: row.name,
    value: row.id,
    disabled: row.enabled === false && !value.includes(String(row.id)),
  }))
  const known = new Set(options.map((item) => item.value))
  for (const id of value) {
    if (!known.has(id)) options.push({ label: id, value: id, disabled: false })
  }
  return (
    <Select
      mode="multiple"
      value={value}
      onChange={onChange}
      disabled={field.readOnly}
      loading={loading}
      showSearch
      optionFilterProp="label"
      options={options}
      notFoundContent={error || (loading ? '加载中' : '暂无分组，请先在节点管理中添加')}
      status={error ? 'error' : undefined}
    />
  )
}

function visible(
  field: Field,
  values: Row,
  byKey?: Map<string, Field>,
  seen: Set<string> = new Set(),
): boolean {
  if (!field.when) return true
  return Object.entries(field.when).every(([key, allowed]) => {
    const controller = byKey?.get(key)
    if (controller && !seen.has(key)) {
      const nextSeen = new Set(seen)
      nextSeen.add(key)
      if (!visible(controller, values, byKey, nextSeen)) return true
    }
    const rawVal = values[key]
    if (key === 'protocolOptions.channels' && Array.isArray(rawVal)) {
      const hasInheritedTls = rawVal.some((ch: unknown) => {
        if (!ch || typeof ch !== 'object') return false
        const item = ch as Row
        if (item.enabled === false) return false
        const sec = String(item.security || 'obfs').toLowerCase()
        const cm = String(item.certMode ?? item.cert_mode ?? 'inherit').toLowerCase() || 'inherit'
        return sec === 'tls' && cm === 'inherit'
      })
      return allowed.includes(hasInheritedTls ? 'tls_inherit' : 'no_tls_inherit')
    }
    return allowed.includes(String(rawVal ?? ''))
  })
}

function whenKeys(
  field: Field,
  byKey: Map<string, Field>,
  acc: Set<string> = new Set(),
): string[] {
  if (!field.when) return [...acc]
  for (const key of Object.keys(field.when)) {
    if (acc.has(key)) continue
    acc.add(key)
    const controller = byKey.get(key)
    if (controller) whenKeys(controller, byKey, acc)
  }
  return [...acc]
}

function fieldValue(row: Row | undefined, key: string) {
  return key.split('.').reduce<any>((value, part) => value?.[part], row)
}

function fieldItem(f: Field, symbol: string, pluginId?: string) {
  if (f.type === 'hidden')
    return (
      <Form.Item key={f.key} name={f.key} hidden>
        <Input />
      </Form.Item>
    )
  let control = <Input disabled={f.readOnly} />
  if (f.type === 'copy') control = <CopyField />
  else if (f.type === 'password') control = <Input.Password autoComplete="new-password" />
  else if (f.type === 'code')
    control = (
      <Input.TextArea
        autoSize={{ minRows: 16, maxRows: 30 }}
        spellCheck={false}
        style={{ fontFamily: 'monospace', fontSize: 13 }}
      />
    )
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
  else if (f.type === 'groups') control = <GroupSelect field={f} pluginId={pluginId} />
  else if (f.type === 'multiselect')
    control = <Select mode="multiple" options={f.options || []} allowClear />
  else if (f.type === 'select' && f.optionsEndpoint)
    control = <RemoteSelect field={f} pluginId={pluginId} />
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
  else if (f.type === 'daterange')
    control = <DatePicker.RangePicker showTime format="YYYY-MM-DD HH:mm" />
  else if (f.type === 'email') control = <Input type="email" autoComplete="email" />
  else if (f.type === 'url') control = <Input type="url" placeholder="https://" />
  control = officialControl(f) || control
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

export function Fields({
  fields,
  row,
  pluginId,
}: {
  fields: Field[]
  row?: Row
  pluginId?: string
}) {
  const { currencySymbol } = useCurrency()
  const byKey = new Map(fields.map((f) => [f.key, f]))
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
    const watchedKeys = field.when ? whenKeys(field, byKey) : []
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
            pluginId,
          )
        }
      </Form.Item>
    ) : field.when ? (
      <Form.Item
        key={field.key}
        noStyle
        shouldUpdate={(previous, current) =>
          watchedKeys.some((key) => previous[key] !== current[key])
        }
      >
        {({ getFieldsValue }) =>
          visible(field, getFieldsValue(true), byKey)
            ? fieldItem(field, currencySymbol, pluginId)
            : null
        }
      </Form.Item>
    ) : (
      fieldItem(field, currencySymbol, pluginId)
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
        f.type === 'groups'
          ? String(value || '')
              .split(',')
              .map((id) => id.trim())
              .filter(Boolean)
          : f.type === 'daterange' && value
            ? value.map((item: string) => dayjs(item))
            : f.type === 'datetime' && value
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
  const byKey = new Map(fields.map((f) => [f.key, f]))
  for (const field of fields) {
    if (field.readOnly || !visible(field, values, byKey)) continue
    const value = values[field.key]
    const path = field.key.split('.')
    if (path.length > 1 && value === undefined) continue
    const key = path.pop()!
    const parent = path.reduce<Row>((row, part) => (row[part] ??= {}), result)
    parent[key] =
      field.type === 'groups'
        ? Array.isArray(value)
          ? value.join(',')
          : ''
        : field.type === 'multiselect' ||
            field.type === 'siteRoutes' ||
            field.type === 'siteFeatures' ||
            field.type === 'fluxChannels'
          ? Array.isArray(value)
            ? value
            : []
          : field.type === 'daterange'
            ? value?.map((item: dayjs.Dayjs) => item.toISOString()) || []
            : field.type === 'datetime'
              ? value?.toISOString() || ''
              : (field.type === 'money' ||
                    (field.type === 'discount' && values.type === 'fixed')) &&
                  typeof value === 'number'
                ? Math.round(value * 100)
                : (value ?? (field.type === 'boolean' ? false : ''))
  }
  return result
}
