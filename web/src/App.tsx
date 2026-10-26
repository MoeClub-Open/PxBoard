import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Alert, App as AntApp, Button, ConfigProvider, Spin, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import type { Plugin, User } from './api'
import { api } from './api'
import { SessionContext } from './context'
import ResourcePage from './components/ResourcePage'
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
  if (!me)
    return (
      <Routes>
        {site?.mode === 'business' && <Route path="/" element={<Storefront auth={site} />} />}
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
        <Route path="*" element={<Auth onLogin={refresh} />} />
      </Routes>
    )
  const admin = me.role === 'admin'
  const customerPath = location.pathname === '/user' || location.pathname.startsWith('/user/')
  return (
    <SessionContext.Provider value={{ me, plugins, refresh }}>
      {customerPath ? (
        <Routes>
          <Route
            path="/user/*"
            element={<Portal dark={dark} toggleTheme={toggleTheme} onLogout={() => setMe(null)} />}
          />
        </Routes>
      ) : !admin ? (
        <Navigate to="/user" replace />
      ) : location.pathname === '/mode' ? (
        <ModeSetup onReady={refresh} initialMode={site?.requestedMode || me.mode} />
      ) : location.pathname === '/' && site?.needsModeSetup ? (
        <Navigate to="/mode" replace />
      ) : (
        <Shell dark={dark} toggleTheme={toggleTheme} onLogout={() => setMe(null)}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/account" element={<Account />} />
            <Route path="/p/:pluginId/:pageId" element={<ResourcePage key={location.pathname} />} />
            {admin && (
              <>
                <Route path="/users" element={<Users />} />
                <Route path="/plugins" element={<Plugins key={location.search} />} />
                <Route path="/jobs" element={<Jobs />} />
                <Route path="/activity" element={<Activity />} />
                <Route path="/settings" element={<Settings />} />
              </>
            )}
            <Route path="*" element={<Navigate to="/" replace />} />
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
