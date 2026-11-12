import type { CSSProperties } from 'react'
import { Alert, Button } from 'antd'
import {
  ArrowRightOutlined,
  ControlOutlined,
  DesktopOutlined,
  GlobalOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import type { Row, User } from '../api'
import { Brand } from '../components/Brand'
import { AppearanceButton } from '../appearance'
import { usePublicSite } from '../publicSite'
import '../storefront.css'

interface RouteEntry {
  title: string
  region?: string
  description?: string
}

interface FeatureEntry {
  title: string
  description?: string
}

const featureIcons = [
  <DesktopOutlined key="devices" />,
  <SafetyCertificateOutlined key="security" />,
  <ControlOutlined key="controls" />,
  <ThunderboltOutlined key="connection" />,
]

function resolveRoutes(content?: Row): RouteEntry[] {
  return Array.isArray(content?.routes)
    ? content.routes.filter((item): item is RouteEntry => !!item && !!item.title)
    : []
}

function resolveFeatures(content?: Row): FeatureEntry[] {
  return Array.isArray(content?.features)
    ? content.features.filter((item): item is FeatureEntry => !!item && !!item.title)
    : []
}

function featureColumns(count: number) {
  if (count <= 1) return 1
  if (count === 2 || count === 4) return 2
  return 3
}

export default function Storefront({
  user,
  registrationOpen,
}: {
  user?: User | null
  registrationOpen?: boolean
}) {
  const { data: document, error, reload } = usePublicSite()
  const content = document?.site.data
  const siteName = document?.site.name || 'PxBoard'
  const heading = content?.heading || siteName
  const introduction = String(content?.introduction || '')
  const routes = resolveRoutes(content)
  const features = resolveFeatures(content)
  const canRegister = !user && (document?.registrationOpen ?? registrationOpen)

  if (document?.available && document.site.renderer !== 'storefront' && document.site.html)
    return (
      <>
        <AppearanceButton className="standalone-appearance" />
        <div dangerouslySetInnerHTML={{ __html: document.site.html }} />
      </>
    )

  return (
    <div className="storefront">
      <a href="#storefront-main" className="storefront-skip">
        跳至主要内容
      </a>
      <header className="storefront-header">
        <div className="storefront-header-inner">
          <a href="/" className="storefront-name" aria-label={`${siteName} 首页`}>
            <Brand />
          </a>
          <nav aria-label="首页导航">
            {!!routes.length && (
              <a className="storefront-nav-link" href="#routes">
                线路介绍
              </a>
            )}
            {!!features.length && (
              <a className="storefront-nav-link" href="#features">
                功能特性
              </a>
            )}
            <AppearanceButton />
          </nav>
        </div>
      </header>

      <main className="storefront-main" id="storefront-main" tabIndex={-1}>
        <div
          className={`storefront-container storefront-hero-grid${routes.length ? ' has-routes' : ''}`}
        >
          <section className="storefront-hero" aria-labelledby="storefront-heading">
            <h1 id="storefront-heading">{heading}</h1>
            {introduction && <p className="storefront-intro-text">{introduction}</p>}
            <div className="storefront-actions">
              <Button
                type="primary"
                className="storefront-action"
                href={user ? '/user' : canRegister ? '/register' : '/login'}
                icon={<ArrowRightOutlined />}
                iconPlacement="end"
              >
                {user ? '进入账户' : canRegister ? '注册账户' : '登录账户'}
              </Button>
              {canRegister && (
                <Button type="text" className="storefront-action" href="/login">
                  已有账户？登录
                </Button>
              )}
            </div>
            {error && (
              <Alert
                type="warning"
                title={error}
                action={<Button onClick={() => void reload()}>重试</Button>}
                className="storefront-alert"
              />
            )}
          </section>

          {!!routes.length && (
            <section
              id="routes"
              className="storefront-network"
              aria-labelledby="storefront-routes-heading"
            >
              <div className="storefront-network-heading">
                <GlobalOutlined aria-hidden="true" />
                <h2 id="storefront-routes-heading">线路介绍</h2>
              </div>
              <div
                className={`storefront-routes-grid${routes.length === 1 ? ' single-route' : ''}`}
              >
                {routes.map((item, index) => (
                  <article key={index} className="storefront-route">
                    <h3>{item.title}</h3>
                    {item.region && <p className="storefront-route-region">{item.region}</p>}
                    {item.description && (
                      <p className="storefront-route-description">{item.description}</p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>

        {!!features.length && (
          <section
            id="features"
            className="storefront-features"
            aria-labelledby="storefront-features-heading"
          >
            <div className="storefront-container">
              <h2 id="storefront-features-heading">功能特性</h2>
              <div
                className="storefront-features-grid"
                style={{ '--feature-cols': featureColumns(features.length) } as CSSProperties}
              >
                {features.map((item, index) => (
                  <article key={index} className="storefront-feature">
                    <span className="storefront-feature-icon" aria-hidden="true">
                      {featureIcons[index % featureIcons.length]}
                    </span>
                    <div>
                      <h3>{item.title}</h3>
                      {item.description && <p>{item.description}</p>}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="storefront-footer">
        <div className="storefront-footer-inner">
          <span>
            © {new Date().getFullYear()} {siteName}
          </span>
          {content?.footer && <p>{content.footer}</p>}
        </div>
      </footer>
    </div>
  )
}
