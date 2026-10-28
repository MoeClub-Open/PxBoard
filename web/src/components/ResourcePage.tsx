import { useCurrency } from '../currency'
import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import {
  Alert,
  App,
  Button,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  QRCode,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import {
  CopyOutlined,
  DownloadOutlined,
  MoreOutlined,
  PlusOutlined,
  QrcodeOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import type { Action, Field, Resource, Row, View } from '../api'
import { absoluteURL, api, errorText, redirectToPayment, useData } from '../api'
import { Fields, formValues, serialize } from './Fields'
import { ResourceSettings } from './ResourceSettings'
import { useSession } from '../context'
import { useBrandTitle } from '../branding'
import { configurationChanged } from '../api'
import { officialCell } from '../official/fields'
import { useResourcePresentation } from '../official/resourcePresentation'

const statuses: Record<string, [string, string]> = {
  active: ['正常', 'success'],
  suspended: ['已暂停', 'error'],
  draft: ['草稿', 'default'],
  running: ['发送中', 'processing'],
  paused: ['已暂停', 'warning'],
  completed: ['已完成', 'success'],
  skipped: ['已跳过', 'default'],
  expired: ['已过期', 'default'],
  pending: ['待处理', 'warning'],
  paid: ['已支付', 'processing'],
  fulfilled: ['已完成', 'success'],
  credited: ['已折抵', 'default'],
  canceled: ['已取消', 'default'],
  refunded: ['已退回', 'default'],
  refunding: ['退款处理中', 'warning'],
  open: ['待回复', 'warning'],
  answered: ['已回复', 'processing'],
  closed: ['已关闭', 'default'],
  sent: ['已发送', 'success'],
  failed: ['发送失败', 'error'],
  created: ['待预览', 'default'],
  preparing: ['预览中', 'processing'],
  ready: ['待提交', 'success'],
  blocked: ['需处理', 'error'],
  importing: ['导入中', 'processing'],
  committed: ['已导入', 'success'],
  historical: ['历史记录', 'default'],
  legacy_pending: ['旧系统待核对', 'warning'],
  unused: ['未使用', 'success'],
  used: ['已兑换', 'default'],
  approved: ['已通过', 'success'],
  approving: ['转入中', 'processing'],
  rejected: ['已拒绝', 'error'],
  available: ['可用', 'success'],
  reversed: ['已撤回', 'default'],
  log: ['记录', 'processing'],
  block: ['阻断', 'error'],
  suspend: ['暂停账户', 'error'],
}
const labels: Record<string, string> = {
  day: '天',
  month: '月',
  permanent: '长期',
  time: '仅延长时间',
  subscription: '订阅 / 续费',
  traffic: '流量加油包',
  reset: '重置流量',
  wallet: '余额',
  manual: '人工收款',
  online: '在线支付',
  percent: '百分比',
  fixed: '固定金额',
  domain: '域名',
  keyword: '关键词',
  regex: '正则',
  cidr: 'IP 网段',
  protocol: '协议',
}

function Cell({
  field,
  value,
  row,
  groupNames,
}: {
  field: Field
  value: any
  row: Row
  groupNames: Map<string, string>
}) {
  const { money } = useCurrency()
  const { message } = App.useApp()
  const [open, setOpen] = useState(false)
  if (value === null || value === undefined || value === '') return <span className="muted">—</span>
  const text = String(value)
  if (field.type === 'multiselect' && Array.isArray(value))
    return (
      <span>
        {value
          .map((item) => field.options?.find((option) => option.value === item)?.label || item)
          .join('、') || '—'}
      </span>
    )
  if (field.type === 'groups')
    return (
      <Space size={[4, 4]} wrap>
        {text
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
          .map((id) => (
            <Tag key={id}>{groupNames.get(id) || id}</Tag>
          ))}
      </Space>
    )
  const official = officialCell(field, value, money)
  if (official !== undefined) return official
  if (field.type === 'discount')
    return <span>{row.type === 'fixed' ? money(Number(value)) : `${value}%`}</span>
  if (field.type === 'money')
    return (
      <span className={Number(value) < 0 ? 'amount-negative' : 'amount'}>
        {money(Number(value))}
      </span>
    )
  if (field.type === 'gib')
    return (
      <span className="amount">
        {Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}{' '}
        <span className="muted">GB</span>
      </span>
    )
  if (field.type === 'datetime')
    return (
      <span className="date-cell">
        {new Date(value).toLocaleString('zh-CN', { hour12: false })}
      </span>
    )
  if (field.type === 'nodeService') {
    const label = row.parentId && !value ? '复用主节点' : value ? '独立服务' : '已停用'
    return <Tag color={value || row.parentId ? 'success' : 'default'}>{label}</Tag>
  }
  if (field.type === 'boolean')
    return <Tag color={value ? 'success' : 'default'}>{value ? '是' : '否'}</Tag>
  if (field.type === 'status') {
    const status = statuses[text]
    return <Tag color={status?.[1]}>{status?.[0] || text}</Tag>
  }
  if (field.type === 'tag') return <Tag>{labels[text] || text}</Tag>
  if (field.type === 'longtext')
    return (
      <>
        <Typography.Link onClick={() => setOpen(true)}>查看内容</Typography.Link>
        <Modal open={open} title={field.label} footer={null} onCancel={() => setOpen(false)}>
          <div className="text-content">{text}</div>
        </Modal>
      </>
    )
  if (field.type === 'link' || field.type === 'copy') {
    const link = field.type === 'link' ? absoluteURL(text) : text
    return (
      <Space size={4}>
        <Button
          size="small"
          type="text"
          icon={<CopyOutlined />}
          onClick={() =>
            navigator.clipboard
              .writeText(link)
              .then(() => message.success('已复制'))
              .catch(() => message.error('无法访问剪贴板，请打开内容后手动复制'))
          }
        >
          {field.type === 'link' ? '复制链接' : text.length > 18 ? `${text.slice(0, 10)}…` : text}
        </Button>
        {field.type === 'link' && (
          <Button
            type="text"
            size="small"
            aria-label={`${field.label}二维码`}
            icon={<QrcodeOutlined />}
            onClick={() => setOpen(true)}
          />
        )}
        <Modal open={open} title={field.label} onCancel={() => setOpen(false)} footer={null}>
          <div className="qr-content">
            <QRCode value={link} size={220} />
            <Typography.Paragraph copyable className="link-content">
              {link}
            </Typography.Paragraph>
          </div>
        </Modal>
      </Space>
    )
  }
  return <span title={text}>{text}</span>
}

function exportCSV(title: string, columns: Field[], rows: Row[], groupNames: Map<string, string>) {
  const escape = (value: any) => {
    let v = String(value ?? '')
    if (/^[=+\-@]/.test(v)) v = `'${v}`
    return `"${v.replaceAll('"', '""')}"`
  }
  const csv =
    '\ufeff' +
    [
      columns.map((c) => escape(c.label)).join(','),
      ...rows.map((row) =>
        columns
          .map((c) =>
            escape(
              c.type === 'groups'
                ? String(row[c.key] || '')
                    .split(',')
                    .map((id) => groupNames.get(id.trim()) || id.trim())
                    .join(', ')
                : row[c.key],
            ),
          )
          .join(','),
      ),
    ].join('\r\n')
  const href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = href
  a.download = `${title}.csv`
  a.click()
  URL.revokeObjectURL(href)
}

function SingletonResource({ resource, base }: { resource: Resource; base: string }) {
  const { message } = App.useApp()
  const endpoint = resource.endpoint.startsWith('/api/')
    ? resource.endpoint
    : base + resource.endpoint
  const { data, loading, error, reload } = useData<Row[]>(endpoint)
  const [busy, setBusy] = useState(false)
  const fields = resource.fields || []
  const row = data?.[0]

  return (
    <section className="resource-section">
      <h2 className="settings-section-title">{resource.title}</h2>
      {error && (
        <Alert
          type="error"
          title={error}
          showIcon
          action={<Button onClick={reload}>重试</Button>}
        />
      )}
      {loading ? (
        <Spin />
      ) : (
        row && (
          <div className="settings-inline-form">
            <Form
              layout="vertical"
              requiredMark={false}
              initialValues={formValues(fields, row)}
              onFinish={async (values) => {
                setBusy(true)
                try {
                  await api(endpoint, { method: 'PATCH', body: serialize(fields, values) })
                  configurationChanged()
                  message.success('已保存')
                  reload()
                } catch (e) {
                  message.error(errorText(e))
                } finally {
                  setBusy(false)
                }
              }}
            >
              <Fields fields={fields} row={row} />
              <Button type="primary" htmlType="submit" loading={busy}>
                保存
              </Button>
            </Form>
          </div>
        )
      )}
    </section>
  )
}

function ResourceTable({
  resource,
  base,
  onChange,
}: {
  resource: Resource
  base: string
  onChange: () => void
}) {
  const { message, modal } = App.useApp()
  const endpoint = resource.endpoint.startsWith('/api/')
    ? resource.endpoint
    : base + resource.endpoint
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(12)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [filterForm] = Form.useForm()
  const [filterValues, setFilterValues] = useState<Row>({})
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search)
      setPage(1)
    }, 250)
    return () => clearTimeout(timer)
  }, [search])
  const params = new URLSearchParams()
  if (resource.paginated) {
    params.set('limit', String(pageSize))
    params.set('offset', String((page - 1) * pageSize))
    params.set('q', query)
  }
  for (const field of resource.filters || []) {
    const value = filterValues[field.key]
    if (field.type === 'daterange') {
      if (value?.[0]) params.set(`${field.key}From`, value[0])
      if (value?.[1]) params.set(`${field.key}To`, value[1])
    } else if (value !== undefined && value !== null && value !== '') {
      params.set(field.key, String(value))
    }
  }
  const listURL = params.size
    ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}${params}`
    : endpoint
  const { data, loading, error, reload } = useData<Row[] | { items: Row[]; total: number }>(
    resource.columns.length ? listURL : null,
    resource.pollIntervalSeconds,
  )
  const groupEndpoint = resource.columns.find((field) => field.type === 'groups')?.optionsEndpoint
  const { data: groups } = useData<Row[]>(groupEndpoint || null)
  const groupNames = new Map((groups || []).map((group) => [String(group.id), String(group.name)]))
  const [editor, setEditor] = useState<{ row?: Row; action?: Action } | null>(null)
  const [busy, setBusy] = useState(false)
  const [form] = Form.useForm()
  const fields = editor?.action?.fields || resource.fields || []
  const allRows = Array.isArray(data) ? data : data?.items || []
  const presentation = useResourcePresentation(resource, allRows, endpoint, reload, openEditor)
  const rows = presentation.rows.filter(
    (row) =>
      resource.paginated ||
      !search ||
      presentation.searchRows(row).some((candidate) =>
        resource.columns.some((column) =>
          String(candidate[column.key] ?? '')
            .toLowerCase()
            .includes(search.toLowerCase()),
        ),
      ),
  )
  const total = Array.isArray(data) ? rows.length : data?.total || 0
  function openEditor(row?: Row, action?: Action) {
    if (!action && presentation.openEditor(row)) return
    const fs = action?.fields || resource.fields || []
    form.resetFields()
    form.setFieldsValue(formValues(fs, action ? undefined : row))
    setEditor({ row, action })
  }
  function complete(result?: Row, changed = false) {
    if (result?.redirectUrl) {
      redirectToPayment(result.redirectUrl)
      return
    }
    reload()
    onChange()
    setEditor(null)
    if (changed) configurationChanged()
    if (result?.details)
      modal.info({
        title: result.title || '详情',
        width: 800,
        content: (
          <div
            className="text-content"
            style={{ maxHeight: '65vh', overflow: 'auto', whiteSpace: 'pre-wrap' }}
          >
            {result.details}
          </div>
        ),
        okText: '关闭',
      })
    else if (result?.token)
      modal.info({
        title: '接入凭据',
        width: 600,
        content: (
          <>
            <Typography.Paragraph>{result.identifierLabel || '节点 ID'}</Typography.Paragraph>
            <Typography.Paragraph copyable>
              {String(result.identifier ?? result.nodeId)}
            </Typography.Paragraph>
            <Typography.Paragraph>接入令牌</Typography.Paragraph>
            <Typography.Paragraph copyable>{result.token}</Typography.Paragraph>
          </>
        ),
        okText: '已保存',
      })
    else message.success(result?.message || '操作完成')
  }
  async function runAction(row: Row, action: Action, values: Row = {}) {
    const path = action.endpoint
      ? action.endpoint.startsWith('/api/')
        ? action.endpoint
        : base + action.endpoint
      : `${endpoint.split('?')[0]}/${row.id}/${action.key}`
    const bind = Object.fromEntries(
      Object.entries(action.bind || {}).map(([key, source]) => [key, row[source]]),
    )
    setBusy(true)
    try {
      complete(await api(path, { method: 'POST', body: { ...bind, ...values } }))
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  function action(row: Row, a: Action) {
    if (a.fields?.length) openEditor(row, a)
    else if (a.confirm)
      modal.confirm({
        title: a.label,
        content: a.confirm,
        okText: '确定',
        cancelText: '取消',
        okButtonProps: { danger: a.danger },
        onOk: () => runAction(row, a),
      })
    else void runAction(row, a)
  }
  async function submit() {
    let values: Row
    try {
      values = serialize(fields, await form.validateFields())
    } catch {
      return
    }
    if (editor?.action && editor.row) {
      await runAction(editor.row, editor.action, values)
      return
    }
    setBusy(true)
    try {
      complete(
        await api(
          editor?.row && !resource.singleton
            ? `${endpoint.split('?')[0]}/${editor.row.id}`
            : endpoint,
          {
            method: editor?.row ? 'PATCH' : 'POST',
            body: values,
          },
        ),
        true,
      )
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const hasActions = resource.editable || resource.deletable || resource.actions?.length
  return (
    <section className="resource-section">
      <div className="table-toolbar">
        <div>
          <h2>{resource.title}</h2>
          {resource.columns.length > 0 && <span className="muted">{total} 条记录</span>}
        </div>
        <Space wrap>
          {resource.settings && (
            <ResourceSettings settings={resource.settings} base={base} onSaved={reload} />
          )}
          {resource.columns.length > 0 && (
            <>
              <Input.Search
                placeholder="搜索记录"
                allowClear
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: 220 }}
              />
              <Button aria-label="刷新记录" icon={<ReloadOutlined />} onClick={reload} />
              <Button
                aria-label={resource.paginated ? '导出当前页' : '导出记录'}
                title={resource.paginated ? '导出当前页' : '导出记录'}
                icon={<DownloadOutlined />}
                disabled={!rows.length}
                onClick={() => {
                  const result = presentation.exportRows(rows)
                  exportCSV(resource.title, result.columns, result.rows, groupNames)
                }}
              />
            </>
          )}
          {resource.createLabel && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>
              {resource.createLabel}
            </Button>
          )}
        </Space>
      </div>
      {!!resource.filters?.length && (
        <Form
          form={filterForm}
          layout="inline"
          className="resource-filters"
          onValuesChange={(_, values) => {
            setFilterValues(serialize(resource.filters!, values))
            setPage(1)
          }}
        >
          <Fields fields={resource.filters} />
          <Button
            onClick={() => {
              filterForm.resetFields()
              setFilterValues({})
              setPage(1)
            }}
          >
            清空筛选
          </Button>
        </Form>
      )}
      {error && (
        <Alert
          type="error"
          title={error}
          showIcon
          action={<Button onClick={reload}>重试</Button>}
        />
      )}
      {resource.columns.length > 0 && (
        <Table<Row>
          rowKey="id"
          loading={loading}
          dataSource={rows}
          size="middle"
          scroll={{ x: 'max-content' }}
          pagination={{
            current: resource.paginated ? page : undefined,
            pageSize,
            total: resource.paginated ? total : undefined,
            onChange: (current, size) => {
              setPage(current)
              setPageSize(size)
            },
            showSizeChanger: true,
            pageSizeOptions: [12, 30, 60],
            showTotal: (total) => `共 ${total} 条`,
          }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={resource.empty || '暂无记录'}
              />
            ),
          }}
          columns={[
            ...resource.columns.map((f) => ({
              key: f.key,
              dataIndex: f.key,
              title: f.label,
              render: (v: any, row: Row) =>
                presentation.cell(
                  f,
                  row,
                  <Cell field={f} value={v} row={row} groupNames={groupNames} />,
                ),
              sorter: resource.paginated
                ? undefined
                : (a: Row, b: Row) =>
                    typeof a[f.key] === 'number'
                      ? a[f.key] - b[f.key]
                      : String(a[f.key] ?? '').localeCompare(String(b[f.key] ?? '')),
            })),
            ...(hasActions
              ? [
                  {
                    key: 'actions',
                    title: '操作',
                    fixed: 'right' as const,
                    width: 100,
                    render: (_: any, row: Row) => {
                      const actions = (resource.actions || []).filter(
                        (a) =>
                          !a.when ||
                          Object.entries(a.when).every(([key, values]) =>
                            values.includes(String(row[key])),
                          ),
                      )
                      const items = [
                        ...(resource.editable ? [{ key: 'edit', label: '编辑' }] : []),
                        ...actions.map((a) => ({ key: a.key, label: a.label, danger: a.danger })),
                        ...(resource.deletable
                          ? [
                              {
                                key: 'delete',
                                label: '删除',
                                danger: true,
                                disabled: !presentation.canDelete(row),
                              },
                            ]
                          : []),
                      ]
                      return items.length ? (
                        <Dropdown
                          menu={{
                            items,
                            onClick: ({ key }) => {
                              if (key === 'edit') openEditor(row)
                              else if (key === 'delete')
                                modal.confirm({
                                  title: `删除${resource.title}记录？`,
                                  content: '此操作无法撤销。',
                                  okText: '删除',
                                  cancelText: '取消',
                                  okButtonProps: { danger: true },
                                  onOk: async () => {
                                    try {
                                      await api(
                                        resource.singleton
                                          ? endpoint
                                          : `${endpoint.split('?')[0]}/${row.id}`,
                                        {
                                          method: 'DELETE',
                                        },
                                      )
                                      complete(undefined, true)
                                    } catch (e) {
                                      message.error(errorText(e))
                                    }
                                  },
                                })
                              else {
                                const chosen = actions.find((a) => a.key === key)
                                if (chosen) action(row, chosen)
                              }
                            },
                          }}
                          trigger={['click']}
                        >
                          <Button type="text" icon={<MoreOutlined />} aria-label="记录操作" />
                        </Dropdown>
                      ) : null
                    },
                  },
                ]
              : []),
          ]}
        />
      )}
      {presentation.overlay}
      <Modal
        open={!!editor}
        title={
          editor?.action?.label || (editor?.row ? `编辑${resource.title}` : resource.createLabel)
        }
        onCancel={() => setEditor(null)}
        onOk={submit}
        confirmLoading={busy}
        okText={editor?.action?.label || (editor?.row ? '保存' : resource.createLabel || '确定')}
        cancelText="取消"
        destroyOnHidden
        width={
          fields.some((field) => field.type === 'code')
            ? 960
            : fields.some((field) => field.type === 'periods')
              ? 760
              : 560
        }
      >
        <Form form={form} layout="vertical" requiredMark="optional" className="editor-form">
          <Fields fields={fields} row={editor?.row} />
        </Form>
      </Modal>
    </section>
  )
}

export default function ResourcePage({
  pluginId: pluginOverride,
  pageId: pageOverride,
  hideHeading = false,
}: { pluginId?: string; pageId?: string; hideHeading?: boolean } = {}) {
  const { currencyName } = useCurrency()
  const params = useParams()
  const pluginId = pluginOverride || params.pluginId
  const pageId = pageOverride || params.pageId
  const location = useLocation()
  const { me, plugins } = useSession()
  const selected = plugins.find((plugin) => plugin.id === pluginId && plugin.enabled)
  const surface = location.pathname.startsWith('/user/') ? 'portal' : 'admin'
  const page = selected?.pages.find(
    (page) =>
      page.id === pageId &&
      page.roles.includes(me.role) &&
      (!page.surface || page.surface === surface),
  )
  const base = `/api/v1/extensions/${pluginId}`
  const { data, loading, error, reload } = useData<View>(page ? `${base}/ui/${pageId}` : null)
  useBrandTitle(data?.title || page?.title || '功能未开放', !hideHeading)
  if (!page) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="此功能暂未开放" />
  if (loading)
    return (
      <div className="page-loading">
        <Spin />
      </div>
    )
  if (error || !data)
    return (
      <Alert
        type="error"
        title={error || '页面不可用'}
        showIcon
        action={<Button onClick={reload}>重试</Button>}
      />
    )
  return (
    <>
      {!hideHeading && (
        <div className="page-heading">
          <h1>{data.title}</h1>
          <Button icon={<ReloadOutlined />} onClick={reload}>
            刷新
          </Button>
        </div>
      )}
      {data.notice && <Alert type="info" title={data.notice} showIcon className="page-notice" />}
      {!!data.metrics?.length && (
        <div className="metric-strip">
          {data.metrics.map((m) => (
            <div key={m.label}>
              <span>{m.label}</span>
              <strong>
                {m.value}
                <small>{m.unit === '元' ? currencyName : m.unit}</small>
              </strong>
            </div>
          ))}
        </div>
      )}
      {(() => {
        const settings = data.resources.filter(
          (resource) => resource.singleton && resource.editable,
        )
        const lists = data.resources.filter((resource) => !settings.includes(resource))
        const renderResource = (resource: Resource) =>
          resource.singleton && resource.editable ? (
            <SingletonResource key={resource.key} resource={resource} base={base} />
          ) : (
            <ResourceTable key={resource.key} resource={resource} base={base} onChange={() => {}} />
          )
        if (data.resources.length === 1) return renderResource(data.resources[0])
        const items = lists.map((resource) => ({
          key: resource.key,
          label: resource.title,
          children: renderResource(resource),
        }))
        if (settings.length)
          items.push({
            key: '__settings',
            label: settings.length === 1 ? settings[0].title : '设置',
            children: <>{settings.map(renderResource)}</>,
          })
        return <Tabs items={items} />
      })()}
    </>
  )
}
