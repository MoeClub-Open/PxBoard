import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  App,
  Avatar,
  Button,
  Drawer,
  Dropdown,
  Empty,
  Input,
  Layout,
  Menu,
  Modal,
  Space,
} from 'antd'
import {
  ApiOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BookOutlined,
  CloudServerOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  GiftOutlined,
  LinkOutlined,
  LogoutOutlined,
  MailOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  MoonOutlined,
  SearchOutlined,
  SettingOutlined,
  ShareAltOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  ExportOutlined,
  SunOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'
import { api, useData } from '../api'
import { useSession } from '../context'
import { Brand } from './Brand'
import { useBrand, useBrandTitle } from '../branding'

const icons: Record<string, ReactNode> = {
  server: <CloudServerOutlined />,
  users: <TeamOutlined />,
  link: <LinkOutlined />,
  gift: <GiftOutlined />,
  shop: <ShopOutlined />,
  receipt: <AuditOutlined />,
  wallet: <WalletOutlined />,
  share: <ShareAltOutlined />,
  credit: <CreditCardOutlined />,
  shield: <SafetyCertificateOutlined />,
  message: <MessageOutlined />,
  book: <BookOutlined />,
  mail: <MailOutlined />,
}
export default function Shell({
  dark,
  toggleTheme,
  onLogout,
  children,
}: {
  dark: boolean
  toggleTheme: () => void
  onLogout: () => void
  children: ReactNode
}) {
  const { me, plugins } = useSession()
  const brand = useBrand()
  const health = useData<{ version: string }>('/health')
  const [collapsed, setCollapsed] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [command, setCommand] = useState(false)
  const [search, setSearch] = useState('')
  const location = useLocation()
  const navigate = useNavigate()
  const { message } = App.useApp()
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setCommand((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  useEffect(() => {
    setMobile(false)
  }, [location.pathname])
  const entries = [
    { key: '/', label: '总览', icon: <DashboardOutlined />, group: '工作空间' },
    ...plugins
      .filter((p) => p.enabled)
      .flatMap((p) =>
        p.pages
          .filter((page) => page.roles.includes(me.role) && page.surface !== 'portal')
          .map((page) => ({
            key: `/p/${p.id}/${page.id}`,
            label: page.title,
            icon: icons[page.icon] || <AppstoreOutlined />,
            group: page.group,
          })),
      ),
    ...(me.role === 'admin'
      ? [
          { key: '/users', label: '用户', icon: <TeamOutlined />, group: '管理' },
          { key: '/plugins', label: '插件中心', icon: <AppstoreOutlined />, group: '管理' },
          { key: '/jobs', label: '后台任务', icon: <ApiOutlined />, group: '管理' },
          { key: '/activity', label: '操作记录', icon: <AuditOutlined />, group: '管理' },
          { key: '/settings', label: '系统设置', icon: <SettingOutlined />, group: '管理' },
        ]
      : []),
  ]
  entries.push({ key: '/account', label: '我的账户', icon: <SettingOutlined />, group: '账户' })
  const groups = new Map<string, typeof entries>()
  entries.forEach((e) => groups.set(e.group, [...(groups.get(e.group) || []), e]))
  const items = collapsed
    ? entries
    : [...groups.entries()].map(([label, children]) => ({
        key: label,
        type: 'group' as const,
        label,
        children,
      }))
  const menu = (
    <Menu
      mode="inline"
      selectedKeys={[location.pathname]}
      items={items}
      onClick={({ key }) => navigate(key)}
    />
  )
  const current = entries.find((e) => e.key === location.pathname)
  useBrandTitle(current?.label || '管理后台')
  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' })
      onLogout()
      navigate('/login')
    } catch {
      message.error('退出失败，请重试')
    }
  }
  const results = entries.filter((e) => e.label.toLowerCase().includes(search.toLowerCase()))
  return (
    <>
      <Layout className={dark ? 'workspace dark' : 'workspace'}>
        <Layout.Sider
          width={236}
          collapsed={collapsed}
          collapsedWidth={76}
          className="desktop-sider"
          theme={dark ? 'dark' : 'light'}
        >
          <Link to="/" className="sidebar-brand" aria-label={brand.name}>
            <Brand compact={collapsed} />
          </Link>
          <div className="sidebar-menu">{menu}</div>
          <div className="sidebar-bottom">
            <span className="online-dot" />
            {!collapsed && (
              <>
                <span>{health.error ? '连接异常' : health.loading ? '连接中' : '服务已连接'}</span>
                {health.data?.version && <small>v{health.data.version}</small>}
              </>
            )}
          </div>
        </Layout.Sider>
        <Drawer
          placement="left"
          size={260}
          open={mobile}
          onClose={() => setMobile(false)}
          styles={{ body: { padding: 0 } }}
          title={<Brand />}
        >
          {menu}
        </Drawer>
        <Layout className="main-layout">
          <Layout.Header className="workspace-header">
            <Space>
              <Button
                type="text"
                className="desktop-collapse"
                aria-label="切换侧栏"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed(!collapsed)}
              />
              <Button
                type="text"
                className="mobile-menu"
                aria-label="打开导航"
                icon={<MenuUnfoldOutlined />}
                onClick={() => setMobile(true)}
              />
              <span className="header-path">
                {brand.name} <span>/</span> <strong>{current?.label || '页面'}</strong>
              </span>
            </Space>
            <Space size={12}>
              {me.role === 'admin' && me.mode !== 'personal' && (
                <Button icon={<ExportOutlined />} onClick={() => navigate('/user')}>
                  用户前台
                </Button>
              )}
              <Button
                type="text"
                className="command-button"
                icon={<SearchOutlined />}
                onClick={() => {
                  setSearch('')
                  setCommand(true)
                }}
              >
                跳转 <kbd>Ctrl K</kbd>
              </Button>
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
                    {
                      key: 'identity',
                      label: (
                        <div>
                          <strong>{me.name}</strong>
                          <div className="muted">{me.email}</div>
                        </div>
                      ),
                      disabled: true,
                    },
                    { type: 'divider' },
                    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: logout },
                  ],
                }}
              >
                <Button type="text" className="account-button">
                  <Avatar size={28} style={{ background: '#ede9fe', color: '#6d28d9' }}>
                    {(me.name || me.email)[0].toUpperCase()}
                  </Avatar>
                  <span>{me.name}</span>
                </Button>
              </Dropdown>
            </Space>
          </Layout.Header>
          <Layout.Content className="workspace-content">
            <div className="page-container">{children}</div>
            <footer className="workspace-footer">
              {brand.name} {health.data?.version && <span>v{health.data.version}</span>}
            </footer>
          </Layout.Content>
        </Layout>
      </Layout>
      <Modal
        open={command}
        onCancel={() => setCommand(false)}
        footer={null}
        title="跳转到"
        styles={{ body: { paddingTop: 12 } }}
      >
        <Input
          autoFocus
          prefix={<SearchOutlined />}
          placeholder="搜索页面"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="large"
        />
        <div className="command-results">
          {results.map((e) => (
            <button
              key={e.key}
              onClick={() => {
                navigate(e.key)
                setCommand(false)
              }}
            >
              {e.icon}
              <span>{e.label}</span>
              <span>↵</span>
            </button>
          ))}
          {!results.length && (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到页面" />
          )}
        </div>
      </Modal>
    </>
  )
}
