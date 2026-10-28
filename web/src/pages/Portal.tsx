import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { App, Avatar, Button, Drawer, Dropdown, Empty, Layout, Menu, Space, Spin } from 'antd'
import {
  AppstoreOutlined,
  CloudServerOutlined,
  CustomerServiceOutlined,
  FileTextOutlined,
  GiftOutlined,
  LinkOutlined,
  LogoutOutlined,
  MenuOutlined,
  MoonOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { api } from '../api'
import { useSession } from '../context'
import { Brand } from '../components/Brand'
import ResourcePage from '../components/ResourcePage'
import { useBrandTitle } from '../branding'
import Account from './Account'
import { PortalSubscriptions } from './PortalSubscriptions'
import { PortalHelp } from './PortalHelp'
import PortalStatus from './PortalStatus'
import PortalRedeem from './PortalRedeem'
import '../portal.css'

const PortalSupport = lazy(() =>
  import('./PortalSupport').then((module) => ({ default: module.PortalSupport })),
)
const coveredPages = new Set([
  'access/accounts',
  'subscriptions/subscriptions',
  'commerce/plans',
  'commerce/orders',
  'commerce/wallet',
  'affiliate/referrals',
  'redeem/redeem',
  'support/tickets',
  'support/content',
  'support/notifications',
  'nodes/status',
])
export type PortalProps = { dark: boolean; toggleTheme: () => void; onLogout: () => void }
export type NavigationItem = { key: string; label: string; icon: ReactNode }

export function usePortalFeatures() {
  const { plugins } = useSession()
  const enabled = (id: string) => plugins.some((plugin) => plugin.id === id && plugin.enabled)
  const hasPage = (id: string, pageId: string) =>
    plugins.some(
      (plugin) =>
        plugin.id === id &&
        plugin.enabled &&
        plugin.pages.some(
          (page) => page.id === pageId && page.roles.includes('member') && page.surface !== 'admin',
        ),
    )
  return {
    subscriptions: enabled('subscriptions'),
    commerce: enabled('commerce'),
    affiliate: hasPage('affiliate', 'referrals'),
    redeem: hasPage('redeem', 'redeem'),
    nodeStatus: hasPage('nodes', 'status'),
    support: enabled('support'),
  }
}
type Features = ReturnType<typeof usePortalFeatures>
export const unavailable = (
  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="此功能暂未开放" />
)

export function subscriptionNavigation(features: Features): NavigationItem[] {
  return features.subscriptions
    ? [{ key: '/user/subscriptions', label: '我的订阅', icon: <LinkOutlined /> }]
    : []
}
export function serviceNavigation(features: Features): NavigationItem[] {
  return [
    ...(features.redeem ? [{ key: '/user/redeem', label: '兑换码', icon: <GiftOutlined /> }] : []),
    ...(features.nodeStatus
      ? [{ key: '/user/status', label: '节点状态', icon: <CloudServerOutlined /> }]
      : []),
    ...(features.support
      ? [
          { key: '/user/support', label: '我的工单', icon: <CustomerServiceOutlined /> },
          { key: '/user/help', label: '使用帮助', icon: <FileTextOutlined /> },
        ]
      : []),
  ]
}
export function serviceRoutes(features: Features) {
  return (
    <>
      <Route
        path="subscriptions"
        element={features.subscriptions ? <PortalSubscriptions /> : unavailable}
      />
      <Route path="redeem" element={features.redeem ? <PortalRedeem /> : unavailable} />
      <Route path="status" element={features.nodeStatus ? <PortalStatus /> : unavailable} />
      <Route
        path="support"
        element={
          features.support ? (
            <Suspense fallback={<Spin />}>
              <PortalSupport />
            </Suspense>
          ) : (
            unavailable
          )
        }
      />
      <Route path="help" element={features.support ? <PortalHelp /> : unavailable} />
    </>
  )
}

function PortalExtension() {
  const { pluginId, pageId } = useParams()
  const { me, plugins } = useSession()
  const id = `${pluginId}/${pageId}`
  const page = plugins
    .find((plugin) => plugin.id === pluginId && plugin.enabled)
    ?.pages.find(
      (item) =>
        item.id === pageId &&
        item.roles.includes('member') &&
        item.roles.includes(me.role) &&
        item.surface !== 'admin',
    )
  if (!page || coveredPages.has(id)) return unavailable
  return <ResourcePage key={id} />
}

export default function PortalLayout({
  dark,
  toggleTheme,
  onLogout,
  navigation: entries,
  children,
}: PortalProps & { navigation: NavigationItem[]; children: ReactNode }) {
  const { me, plugins } = useSession()
  const { message } = App.useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobile, setMobile] = useState(false)
  const extraPages = plugins
    .filter((plugin) => plugin.enabled)
    .flatMap((plugin) =>
      plugin.pages
        .filter(
          (page) =>
            page.roles.includes('member') &&
            page.roles.includes(me.role) &&
            page.surface !== 'admin' &&
            !coveredPages.has(`${plugin.id}/${page.id}`),
        )
        .map((page) => ({
          key: `/user/extensions/${plugin.id}/${page.id}`,
          label: page.title,
          icon: <AppstoreOutlined />,
        })),
    )
  const navigation = [...entries, ...extraPages]
  const selected = location.pathname.replace(/\/$/, '')
  const current = [...navigation, { key: '/user/account', label: '我的账户' }].find(
    (item) => item.key === selected,
  )
  useEffect(() => {
    setMobile(false)
  }, [location.pathname])
  useBrandTitle(current?.label || '用户中心')
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
              <Brand />
            </Link>
          </Space>
          <Space size={8}>
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
        title={<Brand />}
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
          {children}
          <Route path="account" element={<Account />} />
          <Route path="extensions/:pluginId/:pageId" element={<PortalExtension />} />
          <Route path="*" element={<Navigate to="/user" replace />} />
        </Routes>
      </Layout.Content>
    </Layout>
  )
}
