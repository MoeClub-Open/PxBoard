import { useCurrency } from '../currency'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Empty, Space, Table, Typography, theme } from 'antd'
import { useData } from '../api'
import type { Row, User } from '../api'
import { Brand } from '../components/Brand'
import { usePublicSite } from '../publicSite'
import '../storefront.css'
import { availablePeriods, periodLabel } from '../planPeriods'

export default function Storefront({
  user,
  registrationOpen,
}: {
  user?: User | null
  registrationOpen?: boolean
}) {
  const { data: document, error: siteError, reload: reloadSite } = usePublicSite()
  const content = document?.site.data
  const fallback = useData<Row[]>(content ? null : '/extensions/commerce/public/plans')
  const plans = ((content?.plans || fallback.data || []) as Row[]).filter((plan) =>
    availablePeriods(plan).some((period) =>
      ['subscription', 'time'].includes(period.kind || plan.kind),
    ),
  )
  const { money } = useCurrency()
  const { token } = theme.useToken()
  const style = {
    '--store-border': token.colorBorderSecondary,
    '--store-surface': token.colorBgContainer,
    '--store-background': token.colorBgLayout,
    '--store-text': token.colorText,
    '--store-secondary': token.colorTextSecondary,
  } as CSSProperties
  const commerce = content?.commerceAvailable !== false
  if (document?.available && document.site.renderer !== 'storefront' && document.site.html)
    return <div dangerouslySetInnerHTML={{ __html: document.site.html }} />
  return (
    <div className="storefront" style={style}>
      <header className="storefront-header">
        <div className="storefront-header-inner">
          <Link to="/" className="storefront-name">
            <Brand />
          </Link>
          <nav aria-label="账户">
            <Space>
              {user ? (
                <Link to="/user">
                  <Button type="primary">我的账户</Button>
                </Link>
              ) : (
                <>
                  <Link to="/login">
                    <Button>登录</Button>
                  </Link>
                  {(document?.registrationOpen ?? registrationOpen) && (
                    <Link to="/register">
                      <Button type="primary">注册</Button>
                    </Link>
                  )}
                </>
              )}
            </Space>
          </nav>
        </div>
      </header>
      <main className="storefront-main">
        <section className="storefront-introduction">
          <h1>{content?.heading || document?.site.name || '服务套餐'}</h1>
          {content?.introduction && <p className="storefront-intro-text">{content.introduction}</p>}
          {commerce ? (
            <Button type="primary" href="#plans">
              查看套餐
            </Button>
          ) : (
            !user && (
              <Link to="/login">
                <Button type="primary">登录账户</Button>
              </Link>
            )
          )}
        </section>
        {!!content?.highlights?.length && (
          <section className="storefront-highlights" aria-label="服务说明">
            <ul>
              {(content.highlights as string[]).map((text, index) => (
                <li key={index}>{text}</li>
              ))}
            </ul>
          </section>
        )}
        {siteError && (
          <Alert
            type="warning"
            title={siteError}
            action={<Button onClick={() => void reloadSite()}>重试</Button>}
            className="storefront-alert"
          />
        )}
        {commerce && (
          <section id="plans">
            <h2>服务套餐</h2>
            {fallback.error && (
              <Alert
                type="error"
                title={fallback.error}
                action={<Button onClick={fallback.reload}>重试</Button>}
                className="storefront-alert"
              />
            )}
            <Table<Row>
              rowKey="id"
              dataSource={plans}
              loading={!content && fallback.loading}
              pagination={false}
              scroll={{ x: 640 }}
              className="storefront-plans"
              locale={{
                emptyText: (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂未开放套餐购买" />
                ),
              }}
              columns={[
                {
                  title: '套餐',
                  dataIndex: 'name',
                  render: (name, plan) => (
                    <Space orientation="vertical" size={4}>
                      <Typography.Text strong>{name}</Typography.Text>
                      {plan.description && (
                        <Typography.Text type="secondary">{plan.description}</Typography.Text>
                      )}
                    </Space>
                  ),
                },
                {
                  title: '流量',
                  render: (_, plan) =>
                    plan.kind === 'time'
                      ? '维持原额度'
                      : plan.unlimited
                        ? '不限流量'
                        : `${Number(plan.quotaGiB).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} GB / 周期`,
                },
                {
                  title: '购买选项',
                  render: (_, plan) =>
                    availablePeriods(plan).map((period) => (
                      <div key={period.id}>
                        {periodLabel(period)} · {money(Number(period.price))}
                      </div>
                    )),
                },
                {
                  title: '购买',
                  width: 100,
                  render: (_, plan) => {
                    const path = `/user/plans?plan=${encodeURIComponent(plan.id)}`
                    return (
                      <Link to={user ? path : `/login?redirect=${encodeURIComponent(path)}`}>
                        <Button type="primary">选择</Button>
                      </Link>
                    )
                  },
                },
              ]}
            />
          </section>
        )}
      </main>
      <footer className="storefront-footer">
        {content?.footer && <p>{content.footer}</p>}
        <span>{document?.site.name || 'PxBoard'}</span>
      </footer>
    </div>
  )
}
