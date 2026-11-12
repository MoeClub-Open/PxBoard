import { useCurrency } from '../currency'
import { Alert, Button, Card, Col, Empty, Row, Space, Statistic, Tag } from 'antd'
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
function Summary({ plugin }: { plugin: Plugin }) {
  const { currencyName } = useCurrency()
  const { data, loading, error, reload } = useRpc<RecordRow[]>(`${plugin.id}/summary.get`)
  return (
    <Card size="small" title={plugin.name} loading={loading}>
      {error ? (
        <span className="danger">
          {error}{' '}
          <Button type="link" size="small" onClick={reload}>
            重试
          </Button>
        </span>
      ) : (
        <Row gutter={[12, 8]}>
          {data?.map((m) => (
            <Col key={m.label} xs={8}>
              <Statistic
                title={m.label}
                value={m.value}
                suffix={m.unit === '元' ? currencyName : m.unit}
              />
            </Col>
          ))}
        </Row>
      )}
    </Card>
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
      {me.role === 'admin' && (
        <Row gutter={[12, 12]} className="metrics-row">
          {[
            { label: '用户总数', value: data?.users ?? '—' },
            {
              label: '运行插件',
              value: data?.enabled ?? '—',
              suffix: `/ ${data?.plugins ?? 0}`,
            },
            { label: '待处理任务', value: data?.jobs ?? '—' },
            {
              label: '服务状态',
              value: status.length ? '需处理' : '运行正常',
              suffix: data ? `v${data.version}` : undefined,
              danger: status.length > 0,
            },
          ].map((m) => (
            <Col key={m.label} xs={12} lg={6}>
              <Card size="small">
                <Statistic
                  title={m.label}
                  value={m.value}
                  suffix={m.suffix}
                  styles={m.danger ? { content: { color: 'var(--px-error)' } } : undefined}
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}
      {!!summaries.length && (
        <Row gutter={[12, 12]} className="metrics-row">
          {summaries.map((p) => (
            <Col key={p.id} xs={24} md={12}>
              <Summary plugin={p} />
            </Col>
          ))}
        </Row>
      )}
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={me.role === 'admin' ? 12 : 24}>
          <Card
            size="small"
            title="插件状态"
            extra={
              me.role === 'admin' ? (
                <Link to={adminURL('/admin/plugins', me)}>管理</Link>
              ) : undefined
            }
          >
            {plugins.length ? (
              <div className="data-list">
                {plugins.map((p) => (
                  <div className="data-row" key={p.id}>
                    <div className="data-row-main">
                      {p.error ? (
                        <ExclamationCircleFilled className="danger data-row-icon" />
                      ) : (
                        <CheckCircleFilled
                          className={`${p.enabled ? 'success' : 'muted'} data-row-icon`}
                        />
                      )}
                      <div className="data-row-copy">
                        <strong>{p.name}</strong>
                        <small className={p.error ? 'danger' : undefined}>
                          {p.error || `v${p.version}`}
                        </small>
                      </div>
                    </div>
                    <Tag color={p.error ? 'error' : p.enabled ? 'success' : 'default'}>
                      {p.error ? '异常' : p.enabled ? '运行中' : '已停用'}
                    </Tag>
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
