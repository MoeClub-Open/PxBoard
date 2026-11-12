import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  App,
  Avatar,
  Breadcrumb,
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
  DatabaseOutlined,
  GiftOutlined,
  LinkOutlined,
  LogoutOutlined,
  MailOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  SearchOutlined,
  SettingOutlined,
  ShareAltOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  ExportOutlined,
  TeamOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'
import { rpc } from '../api'
import { useSession } from '../context'
import { Brand } from './Brand'
import { AppearanceButton } from '../appearance'
import { useBrand, useBrandTitle } from '../branding'
import { settingsDestinations } from '../settingsDestinations'
import { adminRoot, adminURL } from '../adminPath'

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
  database: <DatabaseOutlined />,
}
export default function Shell({
  onLogout,
  children,
}: {
  onLogout: () => void
  children: ReactNode
}) {
  const { me, plugins } = useSession()
  const brand = useBrand()
  const [collapsed, setCollapsed] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [command, setCommand] = useState(false)
  const [search, setSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const location = useLocation()
  const navigate = useNavigate()
  const { message } = App.useApp()
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearch('')
        setActiveIndex(0)
        setCommand((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  useEffect(() => {
    setMobile(false)
  }, [location.pathname])
  const sharedSeen = new Set<string>()
  const pluginEntries = plugins
    .filter((plugin) => plugin.enabled)
    .flatMap((plugin) =>
      plugin.pages
        .filter(
          (page) =>
            page.roles.includes(me.role) &&
            page.surface !== 'portal' &&
            !settingsDestinations[`${plugin.id}/${page.id}`],
        )
        .flatMap((page) => {
          if (page.shared) {
            if (sharedSeen.has(page.shared.id)) return []
            sharedSeen.add(page.shared.id)
            return [
              {
                key: `/admin/shared/${encodeURIComponent(page.shared.id)}`,
                label: page.shared.title,
                icon: icons[page.icon] || <AppstoreOutlined />,
                group: page.group,
              },
            ]
          }
          return [
            {
              key: `/admin/p/${plugin.id}/${page.id}`,
              label: page.title,
              icon: icons[page.icon] || <AppstoreOutlined />,
              group: page.group,
            },
          ]
        }),
    )
  const entries = [
    { key: '/admin', label: '总览', icon: <DashboardOutlined />, group: '工作空间' },
    ...pluginEntries,
    ...(me.role === 'admin'
      ? [
          { key: '/admin/users', label: '用户', icon: <TeamOutlined />, group: '管理' },
          { key: '/admin/plugins', label: '插件中心', icon: <AppstoreOutlined />, group: '管理' },
          { key: '/admin/jobs', label: '后台任务', icon: <ApiOutlined />, group: '管理' },
          { key: '/admin/activity', label: '操作记录', icon: <AuditOutlined />, group: '管理' },
          { key: '/admin/settings', label: '系统设置', icon: <SettingOutlined />, group: '管理' },
        ]
      : []),
  ]
  const mappedEntries = entries.map((entry) => ({ ...entry, key: adminURL(entry.key, me) }))
  const accountEntry = {
    key: adminURL('/admin/account', me),
    label: '我的账户',
    icon: <UserOutlined />,
    group: '账户',
  }
  const allEntries = [...mappedEntries, accountEntry]
  const groups = new Map<string, typeof entries>()
  mappedEntries.forEach((e) => groups.set(e.group, [...(groups.get(e.group) || []), e]))
  const items = collapsed
    ? mappedEntries
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
  const current = allEntries.find((e) => e.key === location.pathname)
  useBrandTitle(current?.label || '管理后台')
  const logout = async () => {
    try {
      await rpc('core/auth.logout')
      onLogout()
      navigate('/login')
    } catch {
      message.error('退出失败，请重试')
    }
  }
  const results = allEntries.filter((e) => e.label.toLowerCase().includes(search.toLowerCase()))
  return (
    <>
      <Layout className="workspace">
        <Layout.Sider
          width={200}
          collapsed={collapsed}
          collapsedWidth={56}
          className="desktop-sider"
        >
          <Link
            to={adminRoot(me)}
            className={`sidebar-brand${collapsed ? ' collapsed' : ''}`}
            aria-label={brand.name}
          >
            <Brand compact={collapsed} />
          </Link>
          <div className="sidebar-menu">{menu}</div>
        </Layout.Sider>
        <Drawer
          placement="left"
          size={220}
          open={mobile}
          onClose={() => setMobile(false)}
          styles={{ body: { padding: 0 } }}
          title={<Brand />}
        >
          {menu}
        </Drawer>
        <Layout className="main-layout">
          <Layout.Header className="workspace-header">
            <Space size={8}>
              <Button
                type="text"
                size="small"
                className="desktop-collapse"
                aria-label="切换侧栏"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed(!collapsed)}
              />
              <Button
                type="text"
                size="small"
                className="mobile-menu"
                aria-label="打开导航"
                icon={<MenuUnfoldOutlined />}
                onClick={() => setMobile(true)}
              />
              <Breadcrumb
                className="header-breadcrumb"
                items={[{ title: brand.name }, { title: current?.label || '总览' }]}
              />
            </Space>
            <Space size={8}>
              {me.role === 'admin' && (
                <Button size="small" icon={<ExportOutlined />} onClick={() => navigate('/user')}>
                  用户前台
                </Button>
              )}
              <Button
                type="text"
                size="small"
                className="command-button"
                icon={<SearchOutlined />}
                onClick={() => {
                  setSearch('')
                  setActiveIndex(0)
                  setCommand(true)
                }}
              >
                跳转 <kbd>Ctrl K</kbd>
              </Button>
              <AppearanceButton />
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
                    {
                      key: 'account',
                      icon: <UserOutlined />,
                      label: '我的账户',
                      onClick: () => navigate(accountEntry.key),
                    },
                    { type: 'divider' },
                    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: logout },
                  ],
                }}
              >
                <Button type="text" className="account-button">
                  <Avatar size={24} className="workspace-avatar">
                    {(me.name || me.email)[0].toUpperCase()}
                  </Avatar>
                  <span>{me.name}</span>
                </Button>
              </Dropdown>
            </Space>
          </Layout.Header>
          <Layout.Content className="workspace-content">
            <div className="page-container">{children}</div>
          </Layout.Content>
        </Layout>
      </Layout>
      <Modal
        open={command}
        onCancel={() => setCommand(false)}
        footer={null}
        title="页面跳转"
        width={460}
        styles={{ body: { paddingTop: 8 } }}
      >
        <Input
          autoFocus
          prefix={<SearchOutlined />}
          placeholder="搜索页面"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setActiveIndex(0)
          }}
          onKeyDown={(e) => {
            if (!results.length) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActiveIndex((i) => (i + 1) % results.length)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActiveIndex((i) => (i - 1 + results.length) % results.length)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const item = results[activeIndex] || results[0]
              if (item) {
                navigate(item.key)
                setCommand(false)
              }
            }
          }}
        />
        <div className="command-results">
          {results.map((e, index) => (
            <button
              key={e.key}
              type="button"
              className={index === activeIndex ? 'active' : undefined}
              onMouseEnter={() => setActiveIndex(index)}
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
