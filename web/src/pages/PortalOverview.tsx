import { Link } from 'react-router-dom'
import { Alert, Button, Card, Empty, Progress, Space, Spin, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useCurrency } from '../currency'
import { useRpc, type Row } from '../api'
import { useSession } from '../context'
import { date, useWallet } from './PortalShared'
import { PortalAnnouncements } from './PortalHelp'

export default function PortalOverview({ business }: { business: boolean }) {
  const { money } = useCurrency()
  const { me, plugins } = useSession()
  const accounts = useRpc<Row[]>(
    plugins.some((p) => p.id === 'access' && p.enabled) ? 'access/accounts.list' : null,
    { mine: true },
    5,
  )
  const redeem = plugins.some(
    (p) =>
      p.id === 'redeem' &&
      p.enabled &&
      p.pages.some(
        (page) => page.id === 'redeem' && page.roles.includes('member') && page.surface !== 'admin',
      ),
  )
  const wallet = useWallet(business)
  const account = accounts.data?.find((row) => row.userId === me.id)
  const expired = account?.expiresAt && new Date(account.expiresAt).getTime() < Date.now()
  const exhausted =
    account && !account.unlimited && Number(account.usedGiB) >= Number(account.quotaGiB)
  const state = !account
    ? '未开通'
    : account.status === 'suspended'
      ? '已暂停'
      : expired
        ? '已到期'
        : exhausted
          ? '流量已用完'
          : account.effective
            ? '可用'
            : '暂不可用'
  const quota = Number(account?.quotaGiB || 0),
    used = Number(account?.usedGiB || 0)
  return (
    <>
      <div className="page-heading">
        <h1>我的服务</h1>
        <Space>
          {account && <Tag color={account.effective ? 'success' : 'warning'}>{state}</Tag>}
          <Button icon={<ReloadOutlined />} onClick={accounts.reload}>
            刷新
          </Button>
        </Space>
      </div>
      {accounts.error && (
        <Alert
          type="error"
          title={accounts.error}
          action={<Button onClick={accounts.reload}>重试</Button>}
          className="portal-notice"
        />
      )}
      {accounts.loading ? (
        <div className="page-loading">
          <Spin />
        </div>
      ) : accounts.error ? null : account ? (
        <>
          <div className="metric-strip">
            <div>
              <span>到期时间</span>
              <strong>{date(account.expiresAt)}</strong>
            </div>
            <div>
              <span>剩余流量</span>
              <strong>
                {account.unlimited
                  ? '不限量'
                  : `${Math.max(0, quota - used).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} GB`}
              </strong>
            </div>
            {business && (
              <div>
                <span>账户余额</span>
                <strong>
                  {wallet.loading ? '—' : wallet.error ? '读取失败' : money(wallet.balance)}
                </strong>
              </div>
            )}
          </div>
          <Card
            size="small"
            title="本周期流量"
            extra={
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                已使用 {used.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} GB
                {!account.unlimited && ` / ${quota.toLocaleString()} GB`}
              </Typography.Text>
            }
            className="section-card"
          >
            {account.unlimited ? (
              <Typography.Text type="secondary">当前套餐不限制流量额度</Typography.Text>
            ) : (
              <Progress
                percent={quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 100}
                status={exhausted ? 'exception' : 'normal'}
              />
            )}
          </Card>
          {!account.effective && (
            <Alert
              type="warning"
              title={state}
              description={
                account.status === 'suspended'
                  ? '请联系工作人员处理账户状态。'
                  : business
                    ? '购买或续费后，可在“我的订阅”获取连接。'
                    : redeem
                      ? '可使用兑换码获取访问权限，或联系管理员。'
                      : '请联系管理员检查访问权限。'
              }
              className="portal-notice"
              action={
                business && account.status !== 'suspended' ? (
                  <Link to="/user/plans">
                    <Button>选购套餐</Button>
                  </Link>
                ) : !business && redeem && account.status !== 'suspended' ? (
                  <Link to="/user/redeem">
                    <Button>兑换码</Button>
                  </Link>
                ) : undefined
              }
            />
          )}
        </>
      ) : (
        <div className="surface-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              business
                ? '还没有开通服务'
                : redeem
                  ? '输入兑换码后即可获取访问权限'
                  : '尚未分配访问权限'
            }
          >
            {business && (
              <Link to="/user/plans">
                <Button type="primary">选购套餐</Button>
              </Link>
            )}
            {!business && redeem && (
              <Link to="/user/redeem">
                <Button type="primary">兑换码</Button>
              </Link>
            )}
          </Empty>
        </div>
      )}
      {plugins.some((p) => p.id === 'support' && p.enabled) && <PortalAnnouncements />}
    </>
  )
}
