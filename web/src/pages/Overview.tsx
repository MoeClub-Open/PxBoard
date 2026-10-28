import { useCurrency } from '../currency'
import { Alert, Button, Empty, List, Tag } from 'antd'
import {
  AppstoreOutlined,
  ArrowRightOutlined,
  CheckCircleFilled,
  ExclamationCircleFilled,
  LinkOutlined,
} from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { useData } from '../api'
import type { Plugin, Row } from '../api'
import { useSession } from '../context'
import { adminURL } from '../adminPath'

const modeLabels: Record<string, string> = {
  personal: '自用',
  business: '商业运营',
}
function Summary({ plugin }: { plugin: Plugin }) {
  const { currencyName } = useCurrency()
  const { data, loading, error, reload } = useData<Row[]>(`/extensions/${plugin.id}/summary`)
  return (
    <div className="summary-row">
      <h2>{plugin.name}</h2>
      {loading ? (
        <span className="muted">正在读取…</span>
      ) : error ? (
        <span className="danger">
          {error}{' '}
          <Button type="link" size="small" onClick={reload}>
            重试
          </Button>
        </span>
      ) : (
        <div className="summary-metrics">
          {data?.map((m) => (
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
    </div>
  )
}
export default function Overview() {
  const { me, plugins } = useSession()
  const { data, error } = useData<Row>('/overview')
  const { data: activity } = useData<Row[]>(me.role === 'admin' ? '/activity' : null)
  const status = plugins.filter((p) => p.error)
  const summaries = plugins.filter(
    (p) => p.enabled && p.summary && p.pages.some((page) => page.roles.includes(me.role)),
  )
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">工作空间</div>
          <h1>总览</h1>
        </div>
        <Tag color="purple">{modeLabels[me.mode] || '自用'}</Tag>
      </div>
      {error && <Alert type="error" title={error} />}
      {me.role === 'admin' && (
        <div className="metric-strip overview-metrics">
          {[
            { label: '用户', value: data?.users ?? '—', note: '账户总数' },
            {
              label: '运行中的插件',
              value: data?.enabled ?? '—',
              note: `已安装 ${data?.plugins ?? 0} 个`,
            },
            { label: '待处理任务', value: data?.jobs ?? '—', note: '插件事件投递' },
            {
              label: '服务状态',
              value: status.length ? '需处理' : '运行正常',
              note: data ? `v${data.version} · ${data.platform}` : '正在连接',
            },
          ].map((m) => (
            <div key={m.label}>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
              <small>{m.note}</small>
            </div>
          ))}
        </div>
      )}
      {!plugins.length && me.role === 'admin' && (
        <div className="getting-started">
          <div className="extension-icon">
            <AppstoreOutlined />
          </div>
          <h2>添加需要的功能</h2>
          <p>连接插件源后，选择适合自己的功能组合。</p>
          <Link to={adminURL('/admin/plugins?tab=sources', me)}>
            <Button type="primary" icon={<LinkOutlined />}>
              连接插件源
            </Button>
          </Link>
        </div>
      )}
      {!!summaries.length && (
        <section className="summary-section">
          {summaries.map((p) => (
            <Summary key={p.id} plugin={p} />
          ))}
        </section>
      )}
      <div className="overview-columns">
        <section className="workspace-section">
          <div className="section-heading">
            <h2>插件状态</h2>
          </div>
          {plugins.length ? (
            <List
              dataSource={plugins}
              renderItem={(p) => (
                <List.Item
                  extra={
                    <Tag color={p.error ? 'error' : p.enabled ? 'success' : 'default'}>
                      {p.error ? '异常' : p.enabled ? '运行中' : '已停用'}
                    </Tag>
                  }
                >
                  <List.Item.Meta
                    avatar={
                      p.error ? (
                        <ExclamationCircleFilled className="danger" />
                      ) : (
                        <CheckCircleFilled className={p.enabled ? 'success' : 'muted'} />
                      )
                    }
                    title={p.name}
                    description={p.error || `v${p.version}`}
                  />
                </List.Item>
              )}
            />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未安装插件" />
          )}
        </section>
        {me.role === 'admin' && (
          <section className="workspace-section">
            <div className="section-heading">
              <h2>最近活动</h2>
              <Link to={adminURL('/admin/activity', me)}>
                查看全部 <ArrowRightOutlined />
              </Link>
            </div>
            {activity?.length ? (
              <List
                dataSource={activity.slice(0, 6)}
                renderItem={(item) => (
                  <List.Item>
                    <List.Item.Meta title={activityLabel(item.action)} description={item.actor} />
                    <span className="muted date-cell">
                      {new Date(item.createdAt).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </List.Item>
                )}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无活动" />
            )}
          </section>
        )}
      </div>
    </>
  )
}
export function activityLabel(action: string) {
  return (
    {
      'auth.login': '登录面板',
      'plugin.install': '安装插件',
      'plugin.enable': '启用插件',
      'plugin.disable': '停用插件',
      'plugin.restart': '重启插件',
      'plugin.remove': '卸载插件',
      'source.add': '添加插件源',
      'user.create': '创建用户',
      'user.update': '更新用户',
      'settings.update': '更新系统设置',
    }[action] || action
  )
}
