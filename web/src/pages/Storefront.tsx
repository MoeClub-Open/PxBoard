import { Alert, Button } from 'antd'
import { ArrowRightOutlined, CheckOutlined, GlobalOutlined } from '@ant-design/icons'
import type { User } from '../api'
import { Brand } from '../components/Brand'
import { AppearanceButton } from '../appearance'
import NetworkScene from '../assets/NetworkScene'
import { usePublicSite } from '../publicSite'
import '../storefront.css'

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
      <main className="storefront-main">
        <section className="storefront-hero" aria-labelledby="storefront-heading">
          <div className="storefront-copy">
            <span className="storefront-eyebrow">
              <GlobalOutlined aria-hidden />
              网络与订阅服务
            </span>
            <h1 id="storefront-heading">{content?.heading || document?.site.name || 'PxBoard'}</h1>
            {content?.introduction && (
              <p className="storefront-intro-text">{content.introduction}</p>
            )}
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
              {!user && (document?.registrationOpen ?? registrationOpen) && (
                <Button size="large" className="storefront-action" href="/register">
                  注册账户
                </Button>
              )}
            </div>
          </div>
          <div className="storefront-art" aria-hidden="true">
            <NetworkScene />
          </div>
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
                <li key={index}>
                  <span className="storefront-check" aria-hidden="true">
                    <CheckOutlined />
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <footer className="storefront-footer">
        <div className="storefront-footer-inner">
          <span>© {document?.site.name || 'PxBoard'}</span>
          {content?.footer && <p>{content.footer}</p>}
        </div>
      </footer>
    </div>
  )
}
