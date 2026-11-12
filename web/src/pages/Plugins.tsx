import { useState } from 'react'
import {
  Alert,
  App,
  Button,
  Checkbox,
  Descriptions,
  Drawer,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import {
  CheckCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import type { Plugin, Row as RecordRow } from '../api'
import { configurationChanged, errorText, rpc, useRpc } from '../api'
import { useSession } from '../context'

interface Catalog {
  plugins: Plugin[]
  sources: RecordRow[]
  platform: string
  bundles?: RecordRow[]
}
function installedRelease(installed: Plugin | undefined, candidate: Plugin | undefined) {
  if (
    !installed ||
    !candidate ||
    installed.version !== candidate.version ||
    (installed.versionEpoch || 0) !== (candidate.versionEpoch || 0)
  )
    return false
  const installedBuild = installed.buildRevision || 0
  const candidateBuild = candidate.buildRevision || 0
  return installed.sourceId === candidate.sourceId
    ? installedBuild >= candidateBuild
    : installedBuild === candidateBuild
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

type TabsConfig = {
  activeKey: string
  onChange: (key: string) => void
  items: { key: string; label: string }[]
}

export function Sources({ tabs }: { tabs?: TabsConfig } = {}) {
  const { message, modal } = App.useApp()
  const screens = Grid.useBreakpoint()
  const { data, error, loading, reload } = useRpc<RecordRow[]>('core/sources.list')
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
      await rpc('core/sources.create', b)
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
      {tabs ? (
        <>
          <Tabs
            activeKey={tabs.activeKey}
            onChange={tabs.onChange}
            items={tabs.items}
            tabBarExtraContent={
              screens.md ? (
                <Space size={8}>
                  <Button icon={<ReloadOutlined />} onClick={reload}>
                    刷新
                  </Button>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
                    添加插件源
                  </Button>
                </Space>
              ) : undefined
            }
          />
          {!screens.md && (
            <div className="table-toolbar">
              <Space size={8}>
                <Button icon={<ReloadOutlined />} onClick={reload}>
                  刷新
                </Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
                  添加插件源
                </Button>
              </Space>
            </div>
          )}
        </>
      ) : (
        <div className="table-toolbar">
          <div />
          <Space size={8}>
            <Button icon={<ReloadOutlined />} onClick={reload}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
              添加插件源
            </Button>
          </Space>
        </div>
      )}
      {error && <Alert type="error" title={error} showIcon className="page-notice" />}
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={data}
        pagination={false}
        scroll={{ x: 680 }}
        locale={{
          emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无插件源" />,
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
            width: 80,
            render: (v: boolean, row: RecordRow) => (
              <Switch
                aria-label={`${row.name}插件源`}
                checked={v}
                onChange={async (enabled) => {
                  try {
                    await rpc('core/sources.update', { id: row.id, enabled })
                    reload()
                  } catch (e) {
                    message.error(errorText(e))
                  }
                }}
              />
            ),
          },
          {
            title: '操作',
            key: 'delete',
            width: 72,
            render: (_: any, row: RecordRow) => (
              <Button
                type="text"
                size="small"
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
                        await rpc('core/sources.remove', { id: row.id })
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

function Installed({ tabs }: { tabs: TabsConfig }) {
  const { plugins, refresh } = useSession()
  const { message, modal } = App.useApp()
  const screens = Grid.useBreakpoint()
  const { data: catalog, reload: reloadCatalog } = useRpc<Catalog>('core/plugins.catalog')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  async function action(id: string, operation: string) {
    setBusy(id)
    try {
      await rpc('core/plugins.action', { id, action: operation })
      await refresh()
      configurationChanged()
      message.success('操作完成')
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setBusy('')
    }
  }
  async function updatePlugin(candidate: Plugin) {
    setBusy(candidate.id)
    try {
      await rpc('core/plugins.install', { id: candidate.id, sourceId: candidate.sourceId })
      await refresh()
      configurationChanged()
      message.success(`${candidate.name} 已更新`)
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setBusy('')
    }
  }
  const rows = plugins.filter((p) =>
    `${p.name} ${p.description} ${p.id}`.toLowerCase().includes(search.toLowerCase()),
  )
  return (
    <>
      <Tabs
        activeKey={tabs.activeKey}
        onChange={tabs.onChange}
        items={tabs.items}
        tabBarExtraContent={
          screens.md ? (
            <Space size={8} wrap>
              <Input.Search
                placeholder="搜索已安装插件"
                allowClear
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: 200 }}
              />
              <Button
                icon={<ReloadOutlined />}
                loading={refreshing}
                onClick={async () => {
                  setRefreshing(true)
                  try {
                    reloadCatalog()
                    await refresh()
                  } finally {
                    setRefreshing(false)
                  }
                }}
              >
                刷新
              </Button>
            </Space>
          ) : undefined
        }
      />
      {!screens.md && (
        <div className="table-toolbar">
          <Space size={8} wrap>
            <Input.Search
              placeholder="搜索已安装插件"
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 200 }}
            />
            <Button
              icon={<ReloadOutlined />}
              loading={refreshing}
              onClick={async () => {
                setRefreshing(true)
                try {
                  reloadCatalog()
                  await refresh()
                } finally {
                  setRefreshing(false)
                }
              }}
            >
              刷新
            </Button>
          </Space>
        </div>
      )}
      <Table<Plugin>
        rowKey="id"
        size="small"
        dataSource={rows}
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
            width: 96,
            render: (v: string) => <code>v{v}</code>,
          },
          {
            title: '状态',
            key: 'status',
            width: 96,
            render: (_: any, p: Plugin) => (
              <Tag color={p.error ? 'error' : p.enabled ? 'success' : 'default'}>
                {p.error ? '异常' : p.enabled ? '运行中' : '已停用'}
              </Tag>
            ),
          },
          {
            title: '启用',
            dataIndex: 'enabled',
            width: 72,
            render: (v: boolean, p: Plugin) => (
              <Switch
                aria-label={`${p.name}插件`}
                checked={v}
                loading={busy === p.id}
                onChange={(next) => action(p.id, next ? 'enable' : 'disable')}
              />
            ),
          },
          {
            title: '操作',
            key: 'actions',
            width: 170,
            render: (_: any, p: Plugin) => {
              const candidate =
                catalog?.plugins.find(
                  (item) => item.id === p.id && (!p.sourceId || item.sourceId === p.sourceId),
                ) || catalog?.plugins.find((item) => item.id === p.id)
              const canUpdate =
                !!candidate &&
                !!candidate.artifacts?.[catalog?.platform || ''] &&
                !installedRelease(p, candidate)
              return (
                <Space size={4}>
                  {canUpdate && (
                    <Button
                      type="link"
                      size="small"
                      loading={busy === p.id}
                      onClick={() => void updatePlugin(candidate)}
                    >
                      更新
                    </Button>
                  )}
                  <Button
                    type="link"
                    size="small"
                    disabled={!p.enabled}
                    loading={busy === p.id}
                    onClick={() => action(p.id, 'restart')}
                  >
                    重启
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    danger
                    onClick={() =>
                      modal.confirm({
                        title: `卸载 ${p.name}？`,
                        content: '插件数据会保留，重新安装后可以继续使用。',
                        okText: '卸载',
                        cancelText: '取消',
                        okButtonProps: { danger: true },
                        onOk: () => action(p.id, 'remove'),
                      })
                    }
                  >
                    卸载
                  </Button>
                </Space>
              )
            },
          },
        ]}
      />
    </>
  )
}

function Marketplace({ tabs, onOpenSources }: { tabs: TabsConfig; onOpenSources: () => void }) {
  const { message } = App.useApp()
  const screens = Grid.useBreakpoint()
  const { plugins, refresh } = useSession()
  const { data, error, loading, reload } = useRpc<Catalog>('core/plugins.catalog')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('全部')
  const [detail, setDetail] = useState<Plugin | null>(null)
  const [trusted, setTrusted] = useState(false)
  const [busy, setBusy] = useState(false)
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
      await rpc('core/plugins.install', {
        id: detail.id,
        sourceId: detail.sourceId,
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
  return (
    <>
      <Tabs
        activeKey={tabs.activeKey}
        onChange={tabs.onChange}
        items={tabs.items}
        tabBarExtraContent={
          screens.md ? (
            <Space size={8} wrap>
              <Input.Search
                placeholder="搜索插件"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                allowClear
                style={{ width: 200 }}
              />
              <Select
                value={category}
                onChange={setCategory}
                options={['全部', ...categories].map((v) => ({ value: v, label: v }))}
                style={{ width: 104 }}
              />
              <Button icon={<ReloadOutlined />} onClick={reload} loading={loading}>
                刷新
              </Button>
            </Space>
          ) : undefined
        }
      />
      {!screens.md && (
        <div className="table-toolbar">
          <Space size={8} wrap>
            <Input.Search
              placeholder="搜索插件"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
              style={{ width: 200 }}
            />
            <Select
              value={category}
              onChange={setCategory}
              options={['全部', ...categories].map((v) => ({ value: v, label: v }))}
              style={{ width: 104 }}
            />
            <Button icon={<ReloadOutlined />} onClick={reload} loading={loading}>
              刷新
            </Button>
          </Space>
        </div>
      )}
      {error && <Alert type="error" title={error} showIcon className="page-notice" />}
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
      <Table<Plugin>
        rowKey={(p) => `${p.sourceId}/${p.id}`}
        size="small"
        loading={loading}
        dataSource={results}
        pagination={false}
        scroll={{ x: 680 }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={data?.sources.length ? '没有匹配的插件' : '暂无可用插件源'}
            >
              {!loading && !data?.sources.length && (
                <Button size="small" type="primary" onClick={onOpenSources}>
                  添加插件源
                </Button>
              )}
            </Empty>
          ),
        }}
        columns={[
          {
            title: '插件',
            dataIndex: 'name',
            render: (name: string, p: Plugin) => (
              <div className="plugin-name">
                <strong>{name}</strong>
                <span>{p.description}</span>
              </div>
            ),
          },
          {
            title: '分类',
            dataIndex: 'category',
            width: 96,
            render: (categoryName: string) => <Tag>{categoryName}</Tag>,
          },
          {
            title: '来源',
            dataIndex: 'sourceName',
            width: 150,
            render: (sourceName: string, p: Plugin) => (
              <Space size={4}>
                <span>{sourceName}</span>
                {p.signed && <SafetyCertificateOutlined title="已签名" className="success" />}
              </Space>
            ),
          },
          {
            title: '版本',
            dataIndex: 'version',
            width: 96,
            render: (v: string) => <code>v{v}</code>,
          },
          {
            title: '操作',
            key: 'action',
            width: 110,
            render: (_: any, p: Plugin) => {
              const installed = plugins.find((v) => v.id === p.id)
              const supported = !!p.artifacts?.[data?.platform || '']
              const latest = installedRelease(installed, p)
              return latest ? (
                <Button
                  size="small"
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
                  size="small"
                  type={installed ? 'primary' : 'default'}
                  disabled={!supported}
                  onClick={() => {
                    setDetail(p)
                    setTrusted(false)
                  }}
                >
                  {!supported ? '不支持' : installed ? '更新' : '安装'}
                </Button>
              )
            },
          },
        ]}
      />
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name}
        size={440}
        footer={
          detail && (
            <Flex vertical gap={10}>
              {!plugins.some((p) => p.id === detail.id && installedRelease(p, detail)) && (
                <Checkbox checked={trusted} onChange={(e) => setTrusted(e.target.checked)}>
                  信任此来源并安装插件及依赖
                </Checkbox>
              )}
              <Button
                type="primary"
                block
                disabled={
                  !trusted || plugins.some((p) => p.id === detail.id && installedRelease(p, detail))
                }
                loading={busy}
                onClick={install}
              >
                {plugins.some((p) => p.id === detail.id && !installedRelease(p, detail))
                  ? '更新并启用'
                  : '安装并启用'}
              </Button>
            </Flex>
          )
        }
      >
        {detail && (
          <Space orientation="vertical" size={14} style={{ width: '100%' }}>
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              {detail.description}
            </Typography.Paragraph>
            <Descriptions
              size="small"
              column={1}
              bordered
              items={[
                { key: 'version', label: '版本', children: `v${detail.version}` },
                { key: 'author', label: '发布者', children: detail.author },
                { key: 'source', label: '来源', children: detail.sourceName },
                {
                  key: 'signed',
                  label: '发布签名',
                  children: detail.signed ? '安装时验证' : '未设置公钥',
                },
                {
                  key: 'deps',
                  label: '依赖插件',
                  children: Object.keys(detail.dependencies || {}).length
                    ? Object.entries(detail.dependencies)
                        .map(([id, version]) => `${id} (${version.replace(/^>=\d+!/, '>=')})`)
                        .join('、')
                    : '无',
                },
                {
                  key: 'permissions',
                  label: '所需权限',
                  children: detail.permissions.length
                    ? detail.permissions.map(permissionLabel).join('；')
                    : '无',
                },
              ]}
            />
          </Space>
        )}
      </Drawer>
    </>
  )
}

export default function Plugins() {
  const [tab, setTab] = useState(new URLSearchParams(location.search).get('tab') || 'market')
  const tabs: TabsConfig = {
    activeKey: tab,
    onChange: setTab,
    items: [
      { key: 'market', label: '发现插件' },
      { key: 'installed', label: '已安装' },
      { key: 'sources', label: '插件源' },
    ],
  }
  return (
    <>
      <div className="page-heading">
        <h1>插件中心</h1>
      </div>
      {tab === 'market' ? (
        <Marketplace tabs={tabs} onOpenSources={() => setTab('sources')} />
      ) : tab === 'installed' ? (
        <Installed tabs={tabs} />
      ) : (
        <Sources tabs={tabs} />
      )}
    </>
  )
}
