import { useCurrency } from '../currency'
import { Alert, Button, Card, Col, Empty, Row, Space, Tag } from 'antd'
import { CheckCircleFilled, ExclamationCircleFilled, ReloadOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { useRpc } from '../api'
import type { Plugin, Row as RecordRow } from '../api'
import { useSession } from '../context'
import { adminURL } from '../adminPath'

const modeLabels: Record<string, string> = {
  personal: '自用',
  business: '商业运营',
}
function formatStat(value: unknown) {
  if (typeof value === 'number') return value.toLocaleString('zh-CN')
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
  }
  return String(value ?? '—')
}
function Summary({ plugin }: { plugin: Plugin }) {
  const { currencyName } = useCurrency()
  const { me } = useSession()
  const { data, loading, error, reload } = useRpc<RecordRow[]>(`${plugin.id}/summary.get`)
  const firstPage = plugin.pages.find(
    (page) => page.roles.includes(me.role) && page.surface !== 'portal',
  )
  const href = firstPage
    ? adminURL(
        firstPage.shared
          ? `/admin/shared/${encodeURIComponent(firstPage.shared.id)}`
          : `/admin/p/${plugin.id}/${firstPage.id}`,
        me,
      )
    : ''
  return (
    <div className="summary-panel">
      <div className="summary-panel-head">
        <span>{plugin.name}</span>
        {href && (
          <Link to={href} style={{ fontSize: 12, fontWeight: 400 }}>
            查看
          </Link>
        )}
      </div>
      {error ? (
        <span className="danger">
          {error}{' '}
          <Button type="link" size="small" onClick={reload}>
            重试
          </Button>
        </span>
      ) : loading && !data ? (
        <span className="muted" style={{ fontSize: 12 }}>
          加载中…
        </span>
      ) : (
        <div className="summary-panel-stats">
          {data?.map((m) => {
            const unit = m.unit === '元' ? currencyName : m.unit
            const label = m.label === plugin.name ? '总计' : m.label
            return (
              <div key={m.label}>
                <span>{label}</span>
                <strong>
                  {formatStat(m.value)}
                  {unit ? ` ${unit}` : ''}
                </strong>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
export default function Overview() {
  const { me, plugins, refresh } = useSession()
  const { data, error, reload } = useRpc<RecordRow>('core/overview.get')
  const { data: activity, reload: reloadActivity } = useRpc<RecordRow[]>(
    me.role === 'admin' ? 'core/activity.list' : null,
  )
  const status = plugins.filter((p) => p.error)
  const summaries = plugins.filter(
    (p) => p.enabled && p.summary && p.pages.some((page) => page.roles.includes(me.role)),
  )
  return (
    <>
      <div className="page-heading">
        <h1>总览</h1>
        <Space size={8}>
          <Tag className="mode-tag">{modeLabels[me.mode] || '自用'}</Tag>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              reload()
              reloadActivity()
              void refresh().catch(() => {})
            }}
          >
            刷新
          </Button>
        </Space>
      </div>
      {error && <Alert type="error" title={error} showIcon className="page-notice" />}
      {status.length > 0 && (
        <Alert
          type="error"
          showIcon
          className="page-notice"
          title={`${status.length} 个插件运行异常：${status.map((p) => p.name).join('、')}`}
          action={
            me.role === 'admin' ? (
              <Link to={adminURL('/admin/plugins?tab=installed', me)}>
                <Button size="small" danger>
                  处理
                </Button>
              </Link>
            ) : undefined
          }
        />
      )}
      {me.role === 'admin' && (
        <div className="metric-strip">
          <div>
            <span>用户总数</span>
            <strong>
              {typeof data?.users === 'number' ? data.users.toLocaleString('zh-CN') : '—'}
            </strong>
          </div>
          <div>
            <span>运行插件</span>
            <strong>
              {data?.enabled ?? '—'}
              <small>/ {data?.plugins ?? 0}</small>
            </strong>
          </div>
          <div>
            <span>待处理任务</span>
            <strong>
              {Number(data?.jobs) > 0 ? (
                <Link to={adminURL('/admin/jobs', me)}>{data?.jobs}</Link>
              ) : (
                (data?.jobs ?? '—')
              )}
            </strong>
          </div>
          <div>
            <span>服务状态</span>
            <strong className={status.length ? 'danger' : undefined}>
              {status.length ? '需处理' : '运行正常'}
              {data?.version ? <small>v{data.version}</small> : null}
            </strong>
          </div>
        </div>
      )}
      {!!summaries.length && (
        <div className="summary-grid">
          {summaries.map((p) => (
            <Summary key={p.id} plugin={p} />
          ))}
        </div>
      )}
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={me.role === 'admin' ? 12 : 24}>
          <Card
            size="small"
            title="插件状态"
            extra={
              me.role === 'admin' ? (
                <Link to={adminURL('/admin/plugins?tab=installed', me)}>管理</Link>
              ) : undefined
            }
          >
            {plugins.length ? (
              <div className="plugin-grid">
                {plugins.map((p) => (
                  <div
                    className="plugin-chip"
                    key={p.id}
                    title={p.error || `${p.name} v${p.version}`}
                  >
                    <div className="plugin-chip-main">
                      {p.error ? (
                        <ExclamationCircleFilled className="danger" />
                      ) : (
                        <CheckCircleFilled className={p.enabled ? 'success' : 'muted'} />
                      )}
                      <span>{p.name}</span>
                    </div>
                    {p.error ? (
                      <Tag color="error" style={{ marginInlineEnd: 0 }}>
                        异常
                      </Tag>
                    ) : !p.enabled ? (
                      <Tag style={{ marginInlineEnd: 0 }}>停用</Tag>
                    ) : (
                      <code>v{p.version}</code>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未安装插件">
                {me.role === 'admin' && (
                  <Link to={adminURL('/admin/plugins', me)}>
                    <Button type="primary" size="small">
                      前往插件中心
                    </Button>
                  </Link>
                )}
              </Empty>
            )}
          </Card>
        </Col>
        {me.role === 'admin' && (
          <Col xs={24} lg={12}>
            <Card
              size="small"
              title="最近活动"
              extra={<Link to={adminURL('/admin/activity', me)}>全部</Link>}
            >
              {activity?.length ? (
                <div className="data-list">
                  {activity.slice(0, 8).map((item) => (
                    <div className="data-row" key={item.id}>
                      <div className="data-row-copy">
                        <strong>{activityLabel(item.action)}</strong>
                        <small>{item.actor}</small>
                      </div>
                      <span className="muted date-cell">
                        {new Date(item.createdAt).toLocaleTimeString('zh-CN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无活动" />
              )}
            </Card>
          </Col>
        )}
      </Row>
    </>
  )
}
export function activityLabel(action: string) {
  return (
    {
      'auth.login': '登录面板',
      'auth.external-login': '第三方登录',
      'auth.native-login': '客户端登录',
      'auth.native-approved': '授权客户端登录',
      'account.mfa-enabled': '开启两步验证',
      'account.mfa-disabled': '关闭两步验证',
      'plugin.install': '安装插件',
      'plugin.enable': '启用插件',
      'plugin.disable': '停用插件',
      'plugin.restart': '重启插件',
      'plugin.remove': '卸载插件',
      'source.add': '添加插件源',
      'user.create': '创建用户',
      'user.update': '更新用户',
      'settings.update': '更新系统设置',
      'workspace.mode': '切换使用方式',
      'migration.commit': '提交数据迁移',
    }[action] || action
  )
}
