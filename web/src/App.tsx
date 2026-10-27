import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Alert, App as AntApp, Button, ConfigProvider, Spin, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import type { Plugin, User } from './api'
import { api, configurationChanged } from './api'
import { SessionContext } from './context'
import SharedPluginPage, { PluginPageRoute } from './components/SharedPluginPage'
import Shell from './components/Shell'
import Auth, { Register, Reset } from './pages/Auth'
import Overview from './pages/Overview'
import Plugins from './pages/Plugins'
import { Activity, Jobs, Settings, Users } from './pages/Core'
import Account from './pages/Account'
import ModeSetup from './pages/ModeSetup'
import Portal from './pages/Portal'
import Storefront from './pages/Storefront'
import type { AuthInfo } from './pages/Register'
import OAuthComplete from './pages/OAuthComplete'

const PortalSupport = lazy(() =>
  import('./pages/PortalSupport').then((module) => ({ default: module.PortalSupport })),
)

function Workspace({ dark, toggleTheme }: { dark: boolean; toggleTheme: () => void }) {
  const [me, setMe] = useState<User | null>(null)
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [initialized, setInitialized] = useState(true)
  const [site, setSite] = useState<AuthInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const location = useLocation()
  const refresh = useCallback(async () => {
    const [user, installed, setup] = await Promise.all([
      api<User>('/me'),
      api<Plugin[]>('/plugins'),
      api<AuthInfo>('/setup'),
    ])
    setMe(user)
    setPlugins(installed)
    setSite(setup)
  }, [])
  useEffect(() => {
    const expired = () => setMe(null)
    window.addEventListener('px:unauthenticated', expired)
    return () => window.removeEventListener('px:unauthenticated', expired)
  }, [])
  useEffect(() => {
    const update = () => {
      if (me) void refresh().catch(() => {})
      else
        void api<AuthInfo>('/setup')
          .then(setSite)
          .catch(() => {})
    }
    const shared = (event: StorageEvent) => {
      if (event.key === 'px:configuration-change') {
        window.dispatchEvent(new Event('px:configuration-changed'))
      }
    }
    window.addEventListener('px:configuration-changed', update)
    window.addEventListener('focus', update)
    window.addEventListener('storage', shared)
    return () => {
      window.removeEventListener('px:configuration-changed', update)
      window.removeEventListener('focus', update)
      window.removeEventListener('storage', shared)
    }
  }, [me?.id, refresh])
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const setup = await api<AuthInfo>('/setup')
        if (!alive) return
        setInitialized(!!setup.initialized)
        setSite(setup)
        if (setup.initialized) {
          try {
            await refresh()
          } catch (e) {
            if (e instanceof Error && e.message !== '请先登录') throw e
          }
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : '连接服务器失败')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [refresh])
  if (loading)
    return (
      <div className="full-loading">
        <Spin size="large" />
      </div>
    )
  if (error)
    return (
      <div className="full-loading">
        <Alert
          type="error"
          title={error}
          showIcon
          action={<Button onClick={() => window.location.reload()}>重新连接</Button>}
        />
      </div>
    )
  if (!initialized)
    return (
      <Auth
        setup
        onLogin={async () => {
          await refresh()
          setInitialized(true)
        }}
      />
    )
  if (location.pathname === '/auth/external') return <OAuthComplete onLogin={refresh} />
  if (!me)
    return (
      <Routes>
        {site?.mode === 'business' && site.extensions.includes('commerce') && (
          <Route path="/" element={<Storefront auth={site} />} />
        )}
        <Route path="/register" element={<Register />} />
        <Route path="/forgot" element={<Reset request />} />
        <Route path="/reset" element={<Reset />} />
        <Route path="/login" element={<Auth onLogin={refresh} />} />
        <Route
          path="/user/*"
          element={
            <Navigate
              to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`}
              replace
            />
          }
        />
        <Route
          path="/admin/*"
          element={
            <Navigate
              to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`}
              replace
            />
          }
        />
        <Route path="*" element={<Auth onLogin={refresh} />} />
      </Routes>
    )
  const admin = me.role === 'admin'
  const adminPath = location.pathname === '/admin' || location.pathname.startsWith('/admin/')
  return (
    <SessionContext.Provider value={{ me, plugins, refresh }}>
      {!adminPath ? (
        <Routes>
          <Route
            path="/user/*"
            element={<Portal dark={dark} toggleTheme={toggleTheme} onLogout={() => setMe(null)} />}
          />
          <Route path="*" element={<Navigate to="/user" replace />} />
        </Routes>
      ) : !admin ? (
        <Navigate to="/user" replace />
      ) : location.pathname === '/admin/mode' ? (
        <ModeSetup
          onReady={async () => {
            await refresh()
            configurationChanged()
          }}
          initialMode={site?.requestedMode || me.mode}
        />
      ) : /^\/admin\/?$/.test(location.pathname) && site?.needsModeSetup ? (
        <Navigate to="/admin/mode" replace />
      ) : (
        <Shell dark={dark} toggleTheme={toggleTheme} onLogout={() => setMe(null)}>
          <Routes>
            <Route path="/admin" element={<Overview />} />
            <Route path="/admin/account" element={<Account />} />
            <Route
              path="/admin/p/support/tickets"
              element={
                plugins.some((p) => p.id === 'support' && p.enabled) ? (
                  <Suspense fallback={<Spin />}>
                    <PortalSupport admin />
                  </Suspense>
                ) : (
                  <Navigate to="/admin" replace />
                )
              }
            />
            <Route
              path="/admin/p/:pluginId/:pageId"
              element={<PluginPageRoute key={location.pathname} />}
            />
            <Route path="/admin/shared/:sharedId" element={<SharedPluginPage />} />
            {admin && (
              <>
                <Route path="/admin/users" element={<Users />} />
                <Route path="/admin/plugins" element={<Plugins key={location.search} />} />
                <Route path="/admin/jobs" element={<Jobs />} />
                <Route path="/admin/activity" element={<Activity />} />
                <Route path="/admin/settings" element={<Settings />} />
              </>
            )}
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </Shell>
      )}
    </SessionContext.Provider>
  )
}
export default function App() {
  const [dark, setDark] = useState(localStorage.getItem('px-theme') === 'dark')
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#7454d9',
          borderRadius: 7,
          fontFamily: 'Inter, "Segoe UI", "Microsoft YaHei", sans-serif',
          fontSize: 14,
          colorBgLayout: dark ? '#141418' : '#f7f8fb',
        },
        components: {
          Layout: { headerBg: dark ? '#1b1b20' : '#ffffff', siderBg: dark ? '#1b1b20' : '#ffffff' },
          Menu: {
            itemSelectedBg: dark ? '#33294f' : '#f0ecfa',
            itemSelectedColor: dark ? '#c4b5fd' : '#6d45cf',
            itemHeight: 40,
            itemMarginInline: 12,
          },
          Table: { headerBg: dark ? '#24242b' : '#f8f9fc', cellPaddingBlockMD: 15 },
        },
      }}
    >
      <AntApp className={dark ? 'theme-dark' : undefined}>
        <BrowserRouter>
          <Workspace
            dark={dark}
            toggleTheme={() =>
              setDark((v) => {
                localStorage.setItem('px-theme', v ? 'light' : 'dark')
                return !v
              })
            }
          />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  )
}
