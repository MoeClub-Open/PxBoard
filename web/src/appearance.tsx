import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { App, Button, ConfigProvider, Popover, Radio, Segmented, theme } from 'antd'
import type { ThemeConfig } from 'antd'
import { DesktopOutlined, MoonOutlined, SkinOutlined, SunOutlined } from '@ant-design/icons'
import zhCN from 'antd/locale/zh_CN'

const colors = {
  blue: { name: '蓝色', seed: '#1677ff' },
  violet: { name: '紫色', seed: '#722ed1' },
  green: { name: '绿色', seed: '#389e0d' },
  cyan: { name: '青色', seed: '#08979c' },
  amber: { name: '橙色', seed: '#d46b08' },
  rose: { name: '玫红', seed: '#c41d7f' },
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
        borderRadius: 6,
        fontSize: 14,
      },
    }
    const token = theme.getDesignToken(base)
    return {
      token,
      config: {
        ...base,
        components: {
          Layout: {
            bodyBg: token.colorBgLayout,
            headerBg: token.colorBgContainer,
            siderBg: token.colorBgContainer,
            headerHeight: 48,
            headerPadding: '0 16px',
          },
          Card: {
            headerHeightSM: 38,
            paddingSM: 14,
          },
          Button: {
            primaryShadow: 'none',
            defaultShadow: 'none',
            dangerShadow: 'none',
          },
          Form: {
            itemMarginBottom: 14,
            verticalLabelPadding: '0 0 4px',
          },
          Menu: {
            itemBg: 'transparent',
            subMenuItemBg: 'transparent',
            activeBarBorderWidth: 0,
            itemHeight: 34,
            itemMarginInline: 6,
            itemMarginBlock: 2,
            itemBorderRadius: 6,
          },
          Table: {
            cellPaddingBlock: 10,
            cellPaddingInline: 12,
            cellPaddingBlockMD: 8,
            cellPaddingInlineMD: 12,
            cellPaddingBlockSM: 6,
            cellPaddingInlineSM: 10,
          },
          Statistic: {
            titleFontSize: 12,
            contentFontSize: 18,
          },
          Tabs: {
            horizontalMargin: '0 0 12px 0',
          },
          Modal: {
            titleFontSize: 15,
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
        size="small"
        className={`appearance-button ${className}`}
        icon={<SkinOutlined aria-hidden />}
        aria-label="外观设置"
      >
        <span className="appearance-button-label">外观</span>
      </Button>
    </Popover>
  )
}
