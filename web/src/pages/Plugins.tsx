import { useState } from 'react'
import {
  Alert,
  App,
  Button,
  Checkbox,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import {
  CheckCircleOutlined,
  CloudDownloadOutlined,
  DeleteOutlined,
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import type { Plugin, Row } from '../api'
import { api, configurationChanged, errorText, useData } from '../api'
import { useSession } from '../context'

interface Catalog {
  plugins: Plugin[]
  sources: Row[]
  platform: string
  bundles?: Row[]
}
const permissionLabel = (p: string) =>
  ({
    'storage:own': '读写插件自己的数据',
    'users:read': '读取用户基本信息',
    'users:create': '创建普通用户',
  })[p] ||
  (p.startsWith('import:')
    ? `迁移${p.slice(7) === 'users' ? '用户账户和密码' : `${p.slice(7)} 插件的数据`}`
    : p.startsWith('call:')
      ? `调用 ${p.slice(5)} 插件`
      : p.startsWith('emit:')
        ? `发布 ${p.slice(5)} 事件`
        : p)

export function Sources() {
  const { message, modal } = App.useApp()
  const { data, error, loading, reload } = useData<Row[]>('/sources')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form] = Form.useForm()
  async function save() {
    let b
    try {
      b = await form.validateFields()
    } catch {
      return
    }
    setBusy(true)
    try {
      await api('/sources', { method: 'POST', body: b })
      message.success('已添加插件源')
      setOpen(false)
      form.resetFields()
      reload()
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="table-toolbar">
        <h2>插件源</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          添加插件源
        </Button>
      </div>
      {error && <Alert type="error" title={error} />}
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        pagination={false}
        scroll={{ x: 680 }}
        locale={{
          emptyText: (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="添加插件源以浏览和安装插件" />
          ),
        }}
        columns={[
          { title: '名称', dataIndex: 'name', render: (v: string) => <strong>{v}</strong> },
          { title: '地址', dataIndex: 'url', ellipsis: true },
          {
            title: '发布签名',
            dataIndex: 'publicKey',
            render: (v: string) => (v ? <Tag color="success">已固定公钥</Tag> : <Tag>未设置</Tag>),
          },
          {
            title: '启用',
            dataIndex: 'enabled',
            render: (v: boolean, row: Row) => (
              <Switch
                checked={v}
                onChange={async (enabled) => {
                  try {
                    await api(`/sources/${row.id}`, { method: 'PATCH', body: { enabled } })
                    reload()
                  } catch (e) {
                    message.error(errorText(e))
                  }
                }}
              />
            ),
          },
          {
            title: '',
            key: 'delete',
            render: (_: any, row: Row) => (
              <Button
                type="text"
                danger
                aria-label="移除插件源"
                icon={<DeleteOutlined />}
                onClick={() =>
                  modal.confirm({
                    title: `移除 ${row.name}？`,
                    content: '已安装的插件和数据会保留。',
                    okText: '移除',
                    cancelText: '取消',
                    onOk: async () => {
                      try {
                        await api(`/sources/${row.id}`, { method: 'DELETE' })
                        reload()
                      } catch (e) {
                        message.error(errorText(e))
                      }
                    },
                  })
                }
              />
            ),
          },
        ]}
      />
      <Modal
        open={open}
        title="添加插件源"
        onOk={save}
        onCancel={() => setOpen(false)}
        confirmLoading={busy}
        okText="添加"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" className="editor-form">
          <Form.Item name="name" label="名称">
            <Input placeholder="留空使用插件源名称" />
          </Form.Item>
          <Form.Item
            name="url"
            label="索引地址"
            rules={[{ required: true, message: '请输入插件源地址' }]}
          >
            <Input placeholder="https://plugins.example.com/index.json" />
          </Form.Item>
          <Form.Item
            name="publicKey"
            label="发布公钥"
            tooltip="填写插件源提供的 Ed25519 公钥后，安装时会验证发布签名。"
          >
            <Input.TextArea autoSize={{ minRows: 2 }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

function Installed() {
  const { plugins, refresh } = useSession()
  const { message, modal } = App.useApp()
  const [busy, setBusy] = useState('')
  async function action(id: string, operation: string) {
    setBusy(id)
    try {
      await api(`/plugins/${id}${operation === 'remove' ? '' : `/${operation}`}`, {
        method: operation === 'remove' ? 'DELETE' : 'POST',
      })
      await refresh()
      configurationChanged()
      message.success('操作完成')
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setBusy('')
    }
  }
  return (
    <Table<Plugin>
      rowKey="id"
      dataSource={plugins}
      pagination={false}
      scroll={{ x: 720 }}
      locale={{
        emptyText: <Empty description="尚未安装插件" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
      }}
      columns={[
        {
          title: '插件',
          dataIndex: 'name',
          render: (name: string, p: Plugin) => (
            <div className="plugin-name">
              <strong>{name}</strong>
              <span>{p.description}</span>
              {p.error && <Typography.Text type="danger">{p.error}</Typography.Text>}
            </div>
          ),
        },
        {
          title: '版本',
          dataIndex: 'version',
          width: 100,
          render: (v: string) => <code>{v}</code>,
        },
        {
          title: '状态',
          key: 'status',
          width: 110,
          render: (_: any, p: Plugin) => (
            <Tag color={p.error ? 'error' : p.enabled ? 'success' : 'default'}>
              {p.error ? '异常' : p.enabled ? '运行中' : '已停用'}
            </Tag>
          ),
        },
        {
          title: '启用',
          dataIndex: 'enabled',
          width: 80,
          render: (v: boolean, p: Plugin) => (
            <Switch
              checked={v}
              loading={busy === p.id}
              onChange={(next) => action(p.id, next ? 'enable' : 'disable')}
            />
          ),
        },
        {
          title: '操作',
          key: 'actions',
          width: 150,
          render: (_: any, p: Plugin) => (
            <Space>
              <Button
                size="small"
                disabled={!p.enabled}
                loading={busy === p.id}
                onClick={() => action(p.id, 'restart')}
              >
                重启
              </Button>
              <Button
                size="small"
                danger
                onClick={() =>
                  modal.confirm({
                    title: `卸载 ${p.name}？`,
                    content: '插件数据会保留，重新安装后可以继续使用。',
                    okText: '卸载',
                    cancelText: '取消',
                    onOk: () => action(p.id, 'remove'),
                  })
                }
              >
                卸载
              </Button>
            </Space>
          ),
        },
      ]}
    />
  )
}

function Marketplace() {
  const { message, modal } = App.useApp()
  const { plugins, refresh } = useSession()
  const { data, error, loading, reload } = useData<Catalog>('/plugins/catalog')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('全部')
  const [detail, setDetail] = useState<Plugin | null>(null)
  const [trusted, setTrusted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [bundleBusy, setBundleBusy] = useState('')
  const categories = [...new Set((data?.plugins || []).map((p) => p.category))]
  const results = (data?.plugins || []).filter(
    (p) =>
      (category === '全部' || p.category === category) &&
      `${p.name}${p.description}`.toLowerCase().includes(search.toLowerCase()),
  )
  async function install() {
    if (!detail) return
    setBusy(true)
    try {
      await api('/plugins/install', {
        method: 'POST',
        body: { id: detail.id, sourceId: detail.sourceId },
      })
      await refresh()
      configurationChanged()
      setDetail(null)
      message.success(`${detail.name} 已安装并启用`)
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  async function installBundle(bundle: Row) {
    setBundleBusy(bundle.id)
    try {
      for (const id of bundle.plugins) {
        await api('/plugins/install', { method: 'POST', body: { id, sourceId: bundle.sourceId } })
      }
      await refresh()
      configurationChanged()
      message.success(`${bundle.name}功能已安装`)
    } catch (e) {
      await refresh()
      message.error(errorText(e))
    } finally {
      setBundleBusy('')
    }
  }
  return (
    <>
      {!!data?.bundles?.length && (
        <div className="bundle-options">
          {data.bundles.map((bundle) => (
            <div key={`${bundle.sourceId}/${bundle.id}`}>
              <h3>{bundle.name}</h3>
              <p>{bundle.description}</p>
              <Button
                size="small"
                loading={bundleBusy === bundle.id}
                disabled={!!bundleBusy && bundleBusy !== bundle.id}
                onClick={() =>
                  modal.confirm({
                    title: `安装${bundle.name}功能？`,
                    content: (
                      <>
                        <p>{bundle.plugins.join('、')}</p>
                        <p>
                          将从 {bundle.sourceName}{' '}
                          安装插件及依赖。插件具有面板服务的系统访问权限，请确认你信任此来源。
                        </p>
                      </>
                    ),
                    okText: '信任并安装',
                    cancelText: '取消',
                    onOk: () => installBundle(bundle),
                  })
                }
              >
                安装组合
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="table-toolbar">
        <Space>
          <Input.Search
            placeholder="搜索插件"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 260 }}
          />
          <Select
            value={category}
            onChange={setCategory}
            options={['全部', ...categories].map((v) => ({ value: v, label: v }))}
            style={{ width: 110 }}
          />
        </Space>
        <Button icon={<ReloadOutlined />} onClick={reload} loading={loading}>
          刷新
        </Button>
      </div>
      {error && <Alert type="error" title={error} showIcon />}
      {data?.sources
        .filter((s) => s.error)
        .map((s) => (
          <Alert
            key={s.id}
            type="warning"
            title={`${s.name}：${s.error}`}
            showIcon
            className="page-notice"
          />
        ))}
      {loading ? (
        <div className="page-loading">
          <Spin />
        </div>
      ) : !results.length ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={data?.sources.length ? '没有找到插件' : '先添加插件源，再浏览可安装的插件'}
        />
      ) : (
        <div className="market-list">
          {results.map((p) => {
            const installed = plugins.find((v) => v.id === p.id)
            const supported = !!p.artifacts?.[data?.platform || '']
            return (
              <div className="market-row" key={`${p.sourceId}/${p.id}`}>
                <div className={`extension-icon category-${p.category}`}>
                  <CloudDownloadOutlined />
                </div>
                <div className="market-copy">
                  <div className="market-title">
                    <strong>{p.name}</strong>
                    <Tag>{p.category}</Tag>
                    {p.signed && <SafetyCertificateOutlined title="发布签名" className="success" />}
                  </div>
                  <p>{p.description}</p>
                  <span className="muted">
                    {p.sourceName} <span className="separator">·</span> v{p.version}
                    {Object.keys(p.dependencies || {}).length > 0 && (
                      <span>
                        {' '}
                        <span className="separator">·</span> {Object.keys(p.dependencies).length}{' '}
                        个依赖
                      </span>
                    )}
                  </span>
                </div>
                {installed?.version === p.version ? (
                  <Button
                    icon={<CheckCircleOutlined />}
                    onClick={() => {
                      setDetail(p)
                      setTrusted(false)
                    }}
                  >
                    已安装
                  </Button>
                ) : (
                  <Button
                    disabled={!supported}
                    icon={<PlusOutlined />}
                    onClick={() => {
                      setDetail(p)
                      setTrusted(false)
                    }}
                  >
                    {!supported ? '平台不支持' : installed ? '更新' : '安装'}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name}
        size={460}
        footer={
          <Button
            type="primary"
            block
            disabled={
              !trusted || plugins.some((p) => p.id === detail?.id && p.version === detail?.version)
            }
            loading={busy}
            onClick={install}
          >
            安装并启用
          </Button>
        }
      >
        {detail && (
          <>
            <Typography.Paragraph>{detail.description}</Typography.Paragraph>
            <div className="detail-lines">
              <span>版本</span>
              <strong>{detail.version}</strong>
              <span>发布者</span>
              <strong>{detail.author}</strong>
              <span>来源</span>
              <strong>{detail.sourceName}</strong>
              <span>发布签名</span>
              <strong>{detail.signed ? '安装时验证' : '未固定发布公钥'}</strong>
            </div>
            <h3>依赖插件</h3>
            {Object.keys(detail.dependencies || {}).length ? (
              Object.entries(detail.dependencies).map(([id, version]) => (
                <p key={id}>
                  <LinkOutlined /> {id} <code>{version}</code>
                </p>
              ))
            ) : (
              <p className="muted">无</p>
            )}
            <h3>需要的权限</h3>
            {detail.permissions.map((p) => (
              <p key={p}>
                <CheckCircleOutlined className="muted" /> {permissionLabel(p)}
              </p>
            ))}
            <Alert
              type="info"
              title="插件以独立进程运行，具有面板服务的系统访问权限。请仅安装可信来源。"
              showIcon
              className="page-notice"
            />
            <Checkbox checked={trusted} onChange={(e) => setTrusted(e.target.checked)}>
              我信任此来源及其依赖插件
            </Checkbox>
          </>
        )}
      </Drawer>
    </>
  )
}

export default function Plugins() {
  const [tab, setTab] = useState(new URLSearchParams(location.search).get('tab') || 'market')
  return (
    <>
      <div className="page-heading">
        <h1>插件中心</h1>
      </div>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        destroyOnHidden
        items={[
          { key: 'market', label: '发现插件', children: <Marketplace /> },
          { key: 'installed', label: '已安装', children: <Installed /> },
          { key: 'sources', label: '插件源', children: <Sources /> },
        ]}
      />
    </>
  )
}
