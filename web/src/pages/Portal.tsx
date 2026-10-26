import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  Alert,
  App,
  Avatar,
  Button,
  Drawer,
  Dropdown,
  Empty,
  Layout,
  Menu,
  Progress,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import {
  AppstoreOutlined,
  CustomerServiceOutlined,
  DashboardOutlined,
  FileTextOutlined,
  LinkOutlined,
  LogoutOutlined,
  MenuOutlined,
  MoonOutlined,
  ReloadOutlined,
  SettingOutlined,
  ShopOutlined,
  SunOutlined,
  UserOutlined,
  WalletOutlined,
  ShareAltOutlined,
  CloudServerOutlined,
} from '@ant-design/icons'
import { api, useData } from '../api'
import type { Row } from '../api'
import { useSession } from '../context'
import Account from './Account'
import ResourcePage from '../components/ResourcePage'
import { date, money, PortalOrders, PortalPlans, PortalWallet, useWallet } from './PortalCommerce'
import {
  PortalAnnouncements,
  PortalHelp,
  PortalSubscriptions,
  PortalSupport,
} from './PortalServices'
import '../portal.css'
import PortalReferrals from './PortalReferrals'
import PortalStatus from './PortalStatus'

function ServiceOverview() {
  const { me, plugins } = useSession()
  const accounts = useData<Row[]>(
    plugins.some((p) => p.id === 'access' && p.enabled) ? '/extensions/access/accounts' : null,
    5,
  )
  const business = me.mode === 'business' && plugins.some((p) => p.id === 'commerce' && p.enabled)
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
          <Button icon={<ReloadOutlined />} onClick={accounts.reload} aria-label="刷新服务" />
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
      ) : account ? (
        <>
          <div className="portal-statistics">
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
          <section className="portal-usage">
            <div>
              <h2>本周期流量</h2>
              <Typography.Text type="secondary">
                已使用 {used.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} GB
                {!account.unlimited && ` / ${quota.toLocaleString()} GB`}
              </Typography.Text>
            </div>
            {!account.unlimited && (
              <Progress
                percent={quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 100}
                status={exhausted ? 'exception' : 'normal'}
              />
            )}
          </section>
          {!account.effective && (
            <Alert
              type="warning"
              title={state}
              description={
                account.status === 'suspended'
                  ? '请联系工作人员处理账户状态。'
                  : business
                    ? '购买或续费后，可在“我的订阅”获取连接。'
                    : '请联系分享者检查访问权限。'
              }
              className="portal-notice"
              action={
                business && account.status !== 'suspended' ? (
                  <Link to="/user/plans">
                    <Button>选购套餐</Button>
                  </Link>
                ) : undefined
              }
            />
          )}
        </>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={business ? '还没有开通服务' : '尚未分配访问权限'}
        >
          {business && (
            <Link to="/user/plans">
              <Button type="primary">选购套餐</Button>
            </Link>
          )}
        </Empty>
      )}
      {plugins.some((p) => p.id === 'support' && p.enabled) && <PortalAnnouncements />}
    </>
  )
}

const coveredPages = new Set([
  'access/accounts',
  'subscriptions/subscriptions',
  'commerce/plans',
  'commerce/orders',
  'commerce/wallet',
  'commerce/referrals',
  'support/tickets',
  'support/content',
  'support/notifications',
  'nodes/status',
])
export default function Portal({
  dark,
  toggleTheme,
  onLogout,
}: {
  dark: boolean
  toggleTheme: () => void
  onLogout: () => void
}) {
  const { me, plugins } = useSession()
  const { message } = App.useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobile, setMobile] = useState(false)
  const enabled = (id: string) => plugins.some((plugin) => plugin.id === id && plugin.enabled)
  const business = me.mode === 'business' && enabled('commerce')
  const navigation = [
    { key: '/user', label: '我的服务', icon: <DashboardOutlined /> },
    ...(business ? [{ key: '/user/plans', label: '选购套餐', icon: <ShopOutlined /> }] : []),
    ...(enabled('subscriptions')
      ? [{ key: '/user/subscriptions', label: '我的订阅', icon: <LinkOutlined /> }]
      : []),
    ...(business
      ? [
          { key: '/user/orders', label: '我的订单', icon: <FileTextOutlined /> },
          { key: '/user/wallet', label: '账户余额', icon: <WalletOutlined /> },
          { key: '/user/referrals', label: '推广返佣', icon: <ShareAltOutlined /> },
        ]
      : []),
    ...(enabled('nodes')
      ? [{ key: '/user/status', label: '节点状态', icon: <CloudServerOutlined /> }]
      : []),
    ...(enabled('support')
      ? [
          { key: '/user/support', label: '我的工单', icon: <CustomerServiceOutlined /> },
          { key: '/user/help', label: '使用帮助', icon: <FileTextOutlined /> },
        ]
      : []),
  ]
  const extraPages = plugins
    .filter((plugin) => plugin.enabled)
    .flatMap((plugin) =>
      plugin.pages
        .filter(
          (page) => page.roles.includes('member') && !coveredPages.has(`${plugin.id}/${page.id}`),
        )
        .map((page) => ({
          key: `/user/extensions/${plugin.id}/${page.id}`,
          label: page.title,
          icon: <AppstoreOutlined />,
        })),
    )
  if (me.role === 'member') navigation.push(...extraPages)
  const selected = location.pathname.replace(/\/$/, '')
  const current = [...navigation, { key: '/user/account', label: '我的账户' }].find(
    (item) => item.key === selected,
  )
  useEffect(() => {
    setMobile(false)
    document.title = `${current?.label || '用户中心'} · ${me.siteName || 'PxBoard'}`
  }, [location.pathname, me.siteName, current?.label])
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' })
      onLogout()
      navigate('/login')
    } catch {
      message.error('退出失败，请重试')
    }
  }
  const menu = (
    <Menu
      mode="inline"
      selectedKeys={[selected]}
      items={navigation}
      onClick={({ key }) => navigate(key)}
    />
  )
  const unavailable = <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="此功能暂未开放" />
  return (
    <Layout className={`customer-portal${dark ? ' portal-dark' : ''}`}>
      <Layout.Header className="portal-header">
        <div className="portal-header-content">
          <Space size={12}>
            <Button
              className="portal-mobile-toggle"
              type="text"
              icon={<MenuOutlined />}
              aria-label="打开导航"
              onClick={() => setMobile(true)}
            />
            <Link className="portal-brand" to="/user">
              {me.siteName || 'PxBoard'}
            </Link>
          </Space>
          <Space size={8}>
            {me.role === 'admin' && (
              <Button href="/" icon={<SettingOutlined />}>
                管理后台
              </Button>
            )}
            <Button
              type="text"
              aria-label={dark ? '切换浅色' : '切换深色'}
              icon={dark ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggleTheme}
            />
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'identity', label: me.email, disabled: true },
                  {
                    key: 'account',
                    label: '我的账户',
                    icon: <UserOutlined />,
                    onClick: () => navigate('/user/account'),
                  },
                  { type: 'divider' },
                  {
                    key: 'logout',
                    label: '退出登录',
                    icon: <LogoutOutlined />,
                    onClick: () => void logout(),
                  },
                ],
              }}
            >
              <Button type="text" className="portal-account">
                <Avatar size={28}>{(me.name || me.email).slice(0, 1).toUpperCase()}</Avatar>
                <span>{me.name || me.email}</span>
              </Button>
            </Dropdown>
          </Space>
        </div>
      </Layout.Header>
      <div className="portal-desktop-nav">
        <Menu
          mode="horizontal"
          selectedKeys={[selected]}
          items={navigation}
          onClick={({ key }) => navigate(key)}
        />
      </div>
      <Drawer
        title={me.siteName || 'PxBoard'}
        placement="left"
        size={260}
        open={mobile}
        onClose={() => setMobile(false)}
        styles={{ body: { padding: 0 } }}
      >
        {menu}
      </Drawer>
      <Layout.Content className="portal-content">
        <Routes>
          <Route index element={<ServiceOverview />} />
          <Route path="plans" element={business ? <PortalPlans /> : unavailable} />
          <Route path="orders" element={business ? <PortalOrders /> : unavailable} />
          <Route path="wallet" element={business ? <PortalWallet /> : unavailable} />
          <Route path="referrals" element={business ? <PortalReferrals /> : unavailable} />
          <Route path="status" element={enabled('nodes') ? <PortalStatus /> : unavailable} />
          <Route
            path="subscriptions"
            element={enabled('subscriptions') ? <PortalSubscriptions /> : unavailable}
          />
          <Route path="support" element={enabled('support') ? <PortalSupport /> : unavailable} />
          <Route path="help" element={enabled('support') ? <PortalHelp /> : unavailable} />
          <Route path="account" element={<Account />} />
          {me.role === 'member' && (
            <Route
              path="extensions/:pluginId/:pageId"
              element={<ResourcePage key={location.pathname} />}
            />
          )}
          <Route path="*" element={<Navigate to="/user" replace />} />
        </Routes>
      </Layout.Content>
    </Layout>
  )
}
