import { useCurrency } from '../currency'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Empty, Space, Table, Tag, Typography, theme } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useData } from '../api'
import { Brand } from '../components/Brand'
import { useBrandTitle } from '../branding'
import '../storefront.css'
import { availablePeriods, periodLabel } from '../planPeriods'

interface StoreAuth {
  name?: string
  mode?: string
  registration?: unknown[]
}

interface PublicPlan {
  id: string
  name: string
  periods: {
    id: string
    label?: string
    price: number
    durationUnit: string
    durationValue: number
    kind: string
  }[]
  quotaGiB: number
  unlimited: boolean
  kind: string
  currency?: string
}

export default function Storefront({ auth }: { auth?: StoreAuth }) {
  useBrandTitle()
  const { money } = useCurrency()
  const { token } = theme.useToken()
  const {
    data: site,
    error: siteError,
    reload: reloadSite,
  } = useData<StoreAuth>(auth ? null : '/setup')
  const { data, loading, error, reload } = useData<PublicPlan[]>(
    '/extensions/commerce/public/plans',
  )
  const currentSite = auth || site
  const plans = (data || []).filter((plan) =>
    availablePeriods(plan).some((period) =>
      ['subscription', 'time'].includes(period.kind || plan.kind),
    ),
  )
  const style = {
    '--store-border': token.colorBorderSecondary,
    '--store-surface': token.colorBgContainer,
    '--store-background': token.colorBgLayout,
    '--store-text': token.colorText,
    '--store-secondary': token.colorTextSecondary,
  } as CSSProperties

  return (
    <div className="storefront" style={style}>
      <header className="storefront-header">
        <div className="storefront-header-inner">
          <Link to="/" className="storefront-name">
            <Brand />
          </Link>
          <Space>
            <Link to="/login">
              <Button>登录</Button>
            </Link>
            {!!currentSite?.registration?.length && (
              <Link to="/register">
                <Button type="primary">注册</Button>
              </Link>
            )}
          </Space>
        </div>
      </header>
      <main className="storefront-main">
        <div className="storefront-heading">
          <h1>选择套餐</h1>
          <Button icon={<ReloadOutlined />} onClick={reload} loading={loading}>
            {error ? '重试' : '刷新'}
          </Button>
        </div>
        {siteError && (
          <Alert
            type="error"
            title={siteError}
            showIcon
            action={<Button onClick={reloadSite}>重试</Button>}
            className="storefront-alert"
          />
        )}
        {error && <Alert type="error" title={error} showIcon className="storefront-alert" />}
        <Table<PublicPlan>
          rowKey="id"
          dataSource={plans}
          loading={loading}
          pagination={false}
          scroll={{ x: 600 }}
          className="storefront-plans"
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={error ? '套餐暂时无法读取' : '暂无在售套餐'}
              />
            ),
          }}
          columns={[
            {
              title: '套餐',
              dataIndex: 'name',
              render: (name: string, plan) => (
                <Space orientation="vertical" size={4}>
                  <Typography.Text strong>{name}</Typography.Text>
                  {plan.kind === 'time' && <Tag>仅延长时间</Tag>}
                </Space>
              ),
            },
            {
              title: '购买选项',
              key: 'periods',
              render: (_, plan) =>
                availablePeriods(plan).map((period) => (
                  <div key={period.id}>
                    {periodLabel(period)} · {money(Number(period.price))}
                  </div>
                )),
            },
            {
              title: '每周期流量',
              key: 'quota',
              render: (_, plan) =>
                plan.kind === 'time' ? (
                  <Typography.Text type="secondary">维持原额度</Typography.Text>
                ) : plan.unlimited ? (
                  '不限流量'
                ) : (
                  `${Number(plan.quotaGiB).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} GB`
                ),
            },
            {
              title: '购买',
              key: 'purchase',
              width: 118,
              render: (_, plan) => {
                const redirect = `/user/plans?plan=${encodeURIComponent(plan.id)}`
                return (
                  <Link to={`/login?redirect=${encodeURIComponent(redirect)}`}>
                    <Button type="primary">选择</Button>
                  </Link>
                )
              },
            },
          ]}
        />
      </main>
    </div>
  )
}
