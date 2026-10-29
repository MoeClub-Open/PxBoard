import type { CSSProperties } from 'react'
import { Alert, Button, Space, theme } from 'antd'
import { ArrowRightOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import type { User } from '../api'
import { Brand } from '../components/Brand'
import { usePublicSite } from '../publicSite'
import '../storefront.css'

export default function Storefront({
  user,
  registrationOpen,
  dark,
  toggleTheme,
}: {
  user?: User | null
  registrationOpen?: boolean
  dark?: boolean
  toggleTheme?: () => void
}) {
  const { data: document, error, reload } = usePublicSite()
  const content = document?.site.data
  const { token } = theme.useToken()
  const highlights = (content?.highlights || []) as string[]
  const style = {
    '--store-border': token.colorBorderSecondary,
    '--store-surface': token.colorBgContainer,
    '--store-background': token.colorBgLayout,
    '--store-text': token.colorText,
    '--store-secondary': token.colorTextSecondary,
    '--store-accent': token.colorPrimary,
    '--store-accent-text': token.colorPrimaryText,
  } as CSSProperties
  if (document?.available && document.site.renderer !== 'storefront' && document.site.html)
    return <div dangerouslySetInnerHTML={{ __html: document.site.html }} />
  return (
    <div className="storefront" style={style}>
      <header className="storefront-header">
        <div className="storefront-header-inner">
          <a href="/" className="storefront-name">
            <Brand />
          </a>
          <nav aria-label="首页导航">
            <Space size={20}>
              {!!highlights.length && (
                <a className="storefront-nav-link" href="#services">
                  服务说明
                </a>
              )}
              {toggleTheme && (
                <Button
                  type="text"
                  shape="circle"
                  icon={dark ? <SunOutlined /> : <MoonOutlined />}
                  onClick={toggleTheme}
                  aria-label={dark ? '切换到浅色' : '切换到深色'}
                />
              )}
            </Space>
          </nav>
        </div>
      </header>
      <main className="storefront-main">
        <section className="storefront-hero">
          <div className="storefront-copy">
            <p className="storefront-eyebrow">网络与订阅服务</p>
            <h1>{content?.heading || document?.site.name || 'PxBoard'}</h1>
            {content?.introduction && (
              <p className="storefront-intro-text">{content.introduction}</p>
            )}
            <div className="storefront-actions">
              <Button
                type="primary"
                size="large"
                className="storefront-action storefront-primary"
                href={user ? '/user' : '/login'}
                icon={<ArrowRightOutlined />}
                iconPlacement="end"
              >
                {user ? '进入账户' : '登录账户'}
              </Button>
              {!user && (document?.registrationOpen ?? registrationOpen) && (
                <Button
                  size="large"
                  className="storefront-action storefront-secondary"
                  href="/register"
                >
                  注册账户
                </Button>
              )}
            </div>
          </div>
          <div className="storefront-art" aria-hidden="true" />
        </section>
        {error && (
          <Alert
            type="warning"
            title={error}
            action={<Button onClick={() => void reload()}>重试</Button>}
            className="storefront-alert"
          />
        )}
        {!!highlights.length && (
          <section
            id="services"
            className="storefront-highlights"
            aria-labelledby="storefront-services-heading"
          >
            <h2 id="storefront-services-heading">服务说明</h2>
            <ul>
              {highlights.map((text, index) => (
                <li key={index}>{text}</li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <footer className="storefront-footer">
        <span>© {document?.site.name || 'PxBoard'}</span>
        {content?.footer && <p>{content.footer}</p>}
      </footer>
    </div>
  )
}
