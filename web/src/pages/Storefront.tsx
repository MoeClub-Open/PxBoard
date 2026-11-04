import type { CSSProperties } from 'react'
import { Alert, Button } from 'antd'
import {
  ApiOutlined,
  AppstoreOutlined,
  ArrowRightOutlined,
  ControlOutlined,
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

const fallbackIntroduction =
  '覆盖亚太、北美与欧洲机房的加密网络接入服务，为跨区域访问、远程协作与日常终端连接提供稳定通道。'

const fallbackRoutes: RouteEntry[] = [
  {
    title: '亚太高速接入',
    region: '香港 · 日本 · 新加坡',
    description:
      '毗邻核心国际海缆与优质直连入口，提供低延迟响应，适合高频网页浏览、即时通讯与流媒体播放。',
  },
  {
    title: '北美骨干互联',
    region: '美西 · 美东',
    description:
      '接入高带宽北美数据中心骨干网络，兼顾跨洋吞吐能力，适合开发工具、云端平台与大体积数据传输。',
  },
  {
    title: '欧洲多点覆盖',
    region: '德国 · 荷兰 · 瑞士',
    description:
      '部署多国独立接入节点与冗余出口路由，满足跨区域业务访问、地区内容解锁及备用线路切换。',
  },
  {
    title: '抗干扰传输架构',
    region: 'TLS · IPv4 / IPv6',
    description: '采用现代加密传输协议与多栈接入地址，针对晚高峰与复杂网络环境优化连接稳定性。',
  },
]

const fallbackFeatures: FeatureEntry[] = [
  {
    title: '主流客户端通用订阅',
    description:
      '通过同一订阅地址按客户端标识自动下发节点与分流规则，支持桌面端、移动端及路由设备直接导入。',
  },
  {
    title: '多链接与凭据隔离',
    description:
      '支持按设备单独创建订阅链接并绑定客户端类型，连接凭据与账户密码相互独立，异常时可随时重置。',
  },
  {
    title: '自助管理与状态可视',
    description:
      '在线完成多周期开通、套餐折抵升级、兑换码核销与工单咨询，实时查看周期流量明细与服务器负载。',
  },
]

const featureIcons = [
  <ApiOutlined key="api" />,
  <SafetyCertificateOutlined key="sec" />,
  <ControlOutlined key="ctrl" />,
  <ThunderboltOutlined key="fast" />,
]

const currentYear = new Date().getFullYear()

function resolveRoutes(content?: Row): RouteEntry[] {
  if (!content) return fallbackRoutes
  if (Array.isArray(content.routes)) {
    return content.routes.filter(
      (item): item is RouteEntry => !!item && (!!item.title || !!item.region),
    )
  }
  return fallbackRoutes
}

function resolveFeatures(content?: Row): FeatureEntry[] {
  if (!content) return fallbackFeatures
  if (Array.isArray(content.features)) {
    return content.features.filter((item): item is FeatureEntry => !!item && !!item.title)
  }
  if (Array.isArray(content.highlights) && content.highlights.length > 0) {
    return content.highlights
      .map((line) => String(line || '').trim())
      .filter(Boolean)
      .map((title) => ({ title }))
  }
  return fallbackFeatures
}

function routeColumns(count: number) {
  if (count <= 1) return 1
  if (count === 2) return 2
  if (count === 4) return 4
  return 3
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
  const introduction =
    content && 'introduction' in content ? String(content.introduction || '') : fallbackIntroduction
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
      <header className="storefront-header">
        <div className="storefront-header-inner">
          <a href="/" className="storefront-name">
            <Brand />
          </a>
          <nav aria-label="首页导航">
            {!!routes.length && (
              <a className="storefront-nav-link" href="#routes">
                线路与网络
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

      <main className="storefront-main">
        <section className="storefront-hero" aria-labelledby="storefront-heading">
          <div className="storefront-container">
            <div className="storefront-hero-inner">
              <h1 id="storefront-heading">{heading}</h1>
              {introduction && <p className="storefront-intro-text">{introduction}</p>}
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
        </section>

        {!!routes.length && (
          <section
            id="routes"
            className="storefront-section storefront-routes-band"
            aria-labelledby="storefront-routes-heading"
          >
            <div className="storefront-container">
              <div className="storefront-section-head">
                <span className="section-head-icon" aria-hidden="true">
                  <GlobalOutlined />
                </span>
                <h2 id="storefront-routes-heading">线路与网络</h2>
              </div>
              <div
                className="storefront-routes-grid"
                style={{ '--route-cols': routeColumns(routes.length) } as CSSProperties}
              >
                {routes.map((item, index) => (
                  <article key={index} className="storefront-route-card">
                    {item.region && (
                      <span className="route-tag">
                        <i aria-hidden="true" />
                        {item.region}
                      </span>
                    )}
                    <h3>{item.title}</h3>
                    {item.description && <p>{item.description}</p>}
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {!!features.length && (
          <section
            id="features"
            className="storefront-section storefront-features-band"
            aria-labelledby="storefront-features-heading"
          >
            <div className="storefront-container">
              <div className="storefront-section-head">
                <span className="section-head-icon" aria-hidden="true">
                  <AppstoreOutlined />
                </span>
                <h2 id="storefront-features-heading">功能特性</h2>
              </div>
              <div
                className="storefront-features-grid"
                style={{ '--feature-cols': featureColumns(features.length) } as CSSProperties}
              >
                {features.map((item, index) => (
                  <article key={index} className="storefront-feature-card">
                    <div className="feature-card-head">
                      <span className="feature-card-icon" aria-hidden="true">
                        {featureIcons[index % featureIcons.length]}
                      </span>
                      <h3>{item.title}</h3>
                    </div>
                    {item.description && <p>{item.description}</p>}
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
            © {currentYear} {siteName}
          </span>
          {content?.footer && <p>{content.footer}</p>}
        </div>
      </footer>
    </div>
  )
}
