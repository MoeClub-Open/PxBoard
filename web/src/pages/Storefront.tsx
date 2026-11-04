import type { CSSProperties } from 'react'
import { Alert, Button } from 'antd'
import {
  ArrowRightOutlined,
  CheckOutlined,
  CloudServerOutlined,
  CopyOutlined,
  LaptopOutlined,
  LockOutlined,
  MobileOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import type { User } from '../api'
import { Brand } from '../components/Brand'
import { AppearanceButton } from '../appearance'
import { usePublicSite } from '../publicSite'
import '../storefront.css'

const defaultIntroduction = '统一管理账户权限、客户端订阅配置与在线服务状态。'
const currentYear = new Date().getFullYear()

function QrGlyph() {
  return (
    <svg
      className="preview-qr"
      viewBox="0 0 19 19"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path d="M0 0h6v6H0V0zm1 1v4h4V1H1zm1 1h2v2H2V2zm11-2h6v6h-6V0zm1 1v4h4V1h-4zm1 1h2v2h-2V2zM0 13h6v6H0v-6zm1 1v4h4v-4H1zm1 1h2v2H2v-2z" />
      <path
        opacity="0.72"
        d="M8 1h2v2H8V1zm3 2h1v3h-1V3zM8 5h2v2H8V5zM1 8h3v1H1V8zm5 0h2v2H6V8zm4 0h3v1h-3V8zm5 0h3v2h-3V8zM3 10h2v2H3v-2zm5 1h3v2H8v-2zm5 0h2v2h-2v-2zm3 2h3v1h-3v-1zm-8 2h2v4H8v-4zm3 1h3v1h-3v-1zm4 0h2v3h-2v-3zm-3 2h2v1h-2v-1z"
      />
    </svg>
  )
}

function highlightColumns(count: number) {
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
  const highlights = (content?.highlights || []) as string[]
  const siteName = document?.site.name || 'PxBoard'
  const heading = content?.heading || siteName
  const introduction = content?.introduction || defaultIntroduction
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
      <header className="storefront-header">
        <div className="storefront-header-inner">
          <a href="/" className="storefront-name">
            <Brand />
          </a>
          <nav aria-label="首页导航">
            {!!highlights.length && (
              <a className="storefront-nav-link" href="#services">
                服务说明
              </a>
            )}
            <AppearanceButton />
          </nav>
        </div>
      </header>
      <main className="storefront-frame">
        <div className="storefront-stage">
          <div className="storefront-band-wrap">
            <span className="frame-cross frame-cross-tl" aria-hidden="true" />
            <span className="frame-cross frame-cross-tr" aria-hidden="true" />
            <span className="frame-cross frame-cross-bl" aria-hidden="true" />
            <span className="frame-cross frame-cross-br" aria-hidden="true" />
            <section className="storefront-hero" aria-labelledby="storefront-heading">
              <div className="storefront-copy">
                <h1 id="storefront-heading">{heading}</h1>
                <p className="storefront-intro-text">{introduction}</p>
                <div className="storefront-actions">
                  <Button
                    type="primary"
                    size="large"
                    className="storefront-action"
                    href={user ? '/user' : '/login'}
                    icon={<ArrowRightOutlined />}
                    iconPlacement="end"
                  >
                    {user ? '进入账户' : '登录账户'}
                  </Button>
                  {canRegister && (
                    <Button size="large" className="storefront-action" href="/register">
                      注册账户
                    </Button>
                  )}
                </div>
              </div>
              <div className="storefront-showcase" aria-hidden="true">
                <div className="preview-card">
                  <div className="preview-card-top">
                    <div className="preview-endpoint">
                      <div className="preview-label-row">
                        <span className="preview-label">HTTPS 订阅凭证</span>
                        <span className="preview-badge">
                          <i />
                          TLS
                        </span>
                      </div>
                      <div className="preview-url-box">
                        <LockOutlined className="preview-lock" />
                        <code>https://••••••••••/s/••••••••</code>
                        <span className="preview-copy-btn">
                          <CopyOutlined />
                        </span>
                      </div>
                    </div>
                    <div className="preview-qr-box">
                      <QrGlyph />
                    </div>
                  </div>
                  <div className="preview-divider" />
                  <div className="preview-topology">
                    <div className="preview-node">
                      <span className="preview-node-icon">
                        <LaptopOutlined />
                        <MobileOutlined />
                      </span>
                      <span>多端客户端</span>
                    </div>
                    <div className="preview-link">
                      <span className="preview-line" />
                      <span className="preview-shield">
                        <SafetyCertificateOutlined />
                      </span>
                      <span className="preview-line" />
                    </div>
                    <div className="preview-node">
                      <span className="preview-node-icon">
                        <CloudServerOutlined />
                      </span>
                      <span>接入节点群</span>
                      <i className="preview-pulse" />
                    </div>
                  </div>
                </div>
              </div>
            </section>
            {!!highlights.length && (
              <section
                id="services"
                className="storefront-services"
                aria-labelledby="storefront-services-heading"
              >
                <div className="storefront-services-head">
                  <h2 id="storefront-services-heading">服务说明</h2>
                </div>
                <ul
                  className="storefront-highlights-grid"
                  style={
                    {
                      '--highlight-cols': highlightColumns(highlights.length),
                    } as CSSProperties
                  }
                >
                  {highlights.map((item, index) => (
                    <li key={index}>
                      <span className="storefront-check" aria-hidden="true">
                        <CheckOutlined />
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          {error && (
            <div className="storefront-alert-wrap">
              <Alert
                type="warning"
                title={error}
                action={<Button onClick={() => void reload()}>重试</Button>}
                className="storefront-alert"
              />
            </div>
          )}
        </div>
      </main>
      <footer className="storefront-footer">
        <div className="storefront-footer-inner">
          <span>
            © {currentYear} {siteName}
          </span>
          {content?.footer && <p>{content.footer}</p>}
        </div>
      </footer>
    </div>
  )
}
