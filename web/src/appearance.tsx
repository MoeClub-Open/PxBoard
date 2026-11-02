import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { App, Button, ConfigProvider, Popover, Radio, Segmented, theme } from 'antd'
import type { ThemeConfig } from 'antd'
import { DesktopOutlined, MoonOutlined, SkinOutlined, SunOutlined } from '@ant-design/icons'
import zhCN from 'antd/locale/zh_CN'

const colors = {
  blue: { name: '蓝色', seed: '#2563eb', ink: '#93c5fd' },
  violet: { name: '紫色', seed: '#7c3aed', ink: '#c4b5fd' },
  green: { name: '绿色', seed: '#047857', ink: '#6ee7b7' },
  cyan: { name: '青色', seed: '#0e7490', ink: '#67e8f9' },
  amber: { name: '橙色', seed: '#b45309', ink: '#fcd34d' },
  rose: { name: '玫红', seed: '#be123c', ink: '#fda4af' },
}
type Color = keyof typeof colors
type Mode = 'system' | 'light' | 'dark'

function savedMode(): Mode {
  const value = localStorage.getItem('px-theme')
  return value === 'light' || value === 'dark' ? value : 'system'
}
function savedColor(): Color {
  const value = localStorage.getItem('px-accent') as Color
  return value in colors ? value : 'blue'
}

const AppearanceContext = createContext({
  mode: 'system' as Mode,
  color: 'blue' as Color,
  setMode: (_value: Mode) => {},
  setColor: (_value: Color) => {},
})

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [mode, updateMode] = useState(savedMode)
  const [color, updateColor] = useState(savedColor)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  const dark = mode === 'dark' || (mode === 'system' && systemDark)
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const changed = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    const stored = (event: StorageEvent) => {
      if (event.key === 'px-theme' || event.key === 'px-accent' || event.key === null) {
        updateMode(savedMode())
        updateColor(savedColor())
      }
    }
    query.addEventListener('change', changed)
    window.addEventListener('storage', stored)
    return () => {
      query.removeEventListener('change', changed)
      window.removeEventListener('storage', stored)
    }
  }, [])
  const { config, token } = useMemo(() => {
    const base: ThemeConfig = {
      algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: {
        colorPrimary: colors[color].seed,
        colorInfo: colors[color].seed,
        ...(dark
          ? {
              colorPrimaryText: colors[color].ink,
              colorPrimaryTextHover: colors[color].ink,
              colorPrimaryTextActive: colors[color].ink,
              colorInfoText: colors[color].ink,
              colorLink: colors[color].ink,
              colorLinkHover: colors[color].ink,
            }
          : {}),
        colorBgLayout: dark ? '#101318' : '#f5f7fa',
        colorBgContainer: dark ? '#191e26' : '#ffffff',
        colorBgElevated: dark ? '#202630' : '#ffffff',
        colorBorder: dark ? '#394352' : '#dce2ea',
        colorBorderSecondary: dark ? '#2d3541' : '#e8ecf1',
        borderRadius: 8,
        fontSize: 14,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
      },
    }
    const token = theme.getDesignToken(base)
    return {
      token,
      config: {
        ...base,
        components: {
          Layout: { headerBg: token.colorBgContainer, siderBg: token.colorBgContainer },
          Menu: {
            itemBg: token.colorBgContainer,
            itemSelectedBg: token.colorPrimaryBg,
            itemSelectedColor: token.colorPrimaryText,
            itemHeight: 38,
            itemMarginInline: 10,
          },
          Table: {
            headerBg: token.colorFillAlter,
            cellPaddingBlockMD: 11,
            cellPaddingInlineMD: 14,
          },
          Tabs: {
            inkBarColor: token.colorPrimaryText,
            itemSelectedColor: token.colorPrimaryText,
            itemHoverColor: token.colorPrimaryText,
          },
        },
      } satisfies ThemeConfig,
    }
  }, [color, dark])
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.theme = dark ? 'dark' : 'light'
    root.dataset.accent = color
    root.style.colorScheme = dark ? 'dark' : 'light'
    const properties = {
      '--px-bg': token.colorBgLayout,
      '--px-surface': token.colorBgContainer,
      '--px-elevated': token.colorBgElevated,
      '--px-fill': token.colorFillAlter,
      '--px-border': token.colorBorder,
      '--px-border-soft': token.colorBorderSecondary,
      '--px-text': token.colorText,
      '--px-secondary': token.colorTextSecondary,
      '--px-muted': token.colorTextTertiary,
      '--px-primary': token.colorPrimary,
      '--px-primary-hover': token.colorPrimaryHover,
      '--px-primary-soft': token.colorPrimaryBg,
      '--px-primary-border': token.colorPrimaryBorder,
      '--px-primary-text': token.colorPrimaryText,
      '--px-success': token.colorSuccessText,
      '--px-error': token.colorErrorText,
      '--px-font': token.fontFamily,
      '--px-shadow': token.boxShadowSecondary,
    }
    for (const [name, value] of Object.entries(properties)) root.style.setProperty(name, value)
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', token.colorBgContainer)
  }, [color, dark, token])
  return (
    <AppearanceContext.Provider
      value={{
        mode,
        color,
        setMode(value) {
          localStorage.setItem('px-theme', value)
          updateMode(value)
        },
        setColor(value) {
          localStorage.setItem('px-accent', value)
          updateColor(value)
        },
      }}
    >
      <ConfigProvider locale={zhCN} theme={config}>
        <App>{children}</App>
      </ConfigProvider>
    </AppearanceContext.Provider>
  )
}

export function AppearanceButton({ className = '' }: { className?: string }) {
  const { mode, color, setMode, setColor } = useContext(AppearanceContext)
  return (
    <Popover
      title="外观设置"
      trigger="click"
      placement="bottomRight"
      content={
        <div className="appearance-settings">
          <div>
            <label className="appearance-label" id="appearance-mode-label">
              显示模式
            </label>
            <Segmented
              block
              aria-labelledby="appearance-mode-label"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'light', label: '浅色', icon: <SunOutlined aria-hidden /> },
                { value: 'dark', label: '深色', icon: <MoonOutlined aria-hidden /> },
                { value: 'system', label: '自动', icon: <DesktopOutlined aria-hidden /> },
              ]}
            />
          </div>
          <div>
            <label className="appearance-label" id="appearance-color-label">
              主题色
            </label>
            <Radio.Group
              className="appearance-colors"
              aria-labelledby="appearance-color-label"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            >
              {Object.entries(colors).map(([value, item]) => (
                <Radio.Button value={value} key={value}>
                  <span className="appearance-color">
                    <span className="appearance-swatch" style={{ background: item.seed }} />
                    {item.name}
                  </span>
                </Radio.Button>
              ))}
            </Radio.Group>
          </div>
        </div>
      }
    >
      <Button
        type="text"
        className={`appearance-button ${className}`}
        icon={<SkinOutlined aria-hidden />}
        aria-label="外观设置"
      >
        <span className="appearance-button-label">外观</span>
      </Button>
    </Popover>
  )
}
