import { Link } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Progress,
  Row as GridRow,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
} from 'antd'
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
          <GridRow gutter={[12, 12]} className="metrics-row">
            <Col xs={12} sm={business ? 8 : 12}>
              <Card size="small">
                <Statistic title="到期时间" value={date(account.expiresAt)} />
              </Card>
            </Col>
            <Col xs={12} sm={business ? 8 : 12}>
              <Card size="small">
                <Statistic
                  title="剩余流量"
                  value={
                    account.unlimited
                      ? '不限量'
                      : `${Math.max(0, quota - used).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} GB`
                  }
                />
              </Card>
            </Col>
            {business && (
              <Col xs={24} sm={8}>
                <Card size="small">
                  <Statistic
                    title="账户余额"
                    value={wallet.loading ? '—' : wallet.error ? '读取失败' : money(wallet.balance)}
                  />
                </Card>
              </Col>
            )}
          </GridRow>
          <Card size="small" title="本周期流量" className="section-card">
            <Flex vertical gap={6}>
              <Typography.Text type="secondary">
                已使用 {used.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} GB
                {!account.unlimited && ` / ${quota.toLocaleString()} GB`}
              </Typography.Text>
              {!account.unlimited && (
                <Progress
                  percent={quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 100}
                  status={exhausted ? 'exception' : 'normal'}
                />
              )}
            </Flex>
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
      )}
      {plugins.some((p) => p.id === 'support' && p.enabled) && <PortalAnnouncements />}
    </>
  )
}
