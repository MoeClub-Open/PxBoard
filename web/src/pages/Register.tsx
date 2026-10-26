import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, App, Button, Empty, Form, Segmented, Spin } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { api, errorText, useData } from '../api'
import type { Field, Row } from '../api'
import { Fields, formValues, serialize } from '../components/Fields'
import { Brand } from '../components/Brand'

export interface AuthProvider {
  key: string
  title: string
  path: string
  fields: Field[]
  query?: Record<string, string>
}
export interface AuthInfo {
  initialized?: boolean
  name?: string
  mode?: string
  requestedMode?: string
  needsModeSetup?: boolean
  registration: AuthProvider[]
  passwordReset: boolean
}
export default function Register() {
  const [query] = useSearchParams()
  const { data, error: loadError, loading } = useData<AuthInfo>('/setup')
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { message } = App.useApp()
  const navigate = useNavigate()
  const redirect = query.get('redirect') || ''
  const loginPath =
    redirect === '/user' || redirect.startsWith('/user/')
      ? `/login?redirect=${encodeURIComponent(redirect)}`
      : '/login'
  const providers = data?.registration || []
  const provider =
    providers.find((p) => p.key === selected) ||
    providers.find((p) => Object.values(p.query || {}).some((key) => query.has(key))) ||
    providers[0]
  const initial: Row = provider ? formValues(provider.fields) : {}
  Object.entries(provider?.query || {}).forEach(([field, key]) => {
    if (query.has(key)) initial[field] = query.get(key)
  })
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <Brand />
      </div>
      <div className="auth-form">
        <h1>创建账户</h1>
        {loading ? (
          <Spin />
        ) : !provider ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={loadError || '本站暂未开放账户注册'}
          />
        ) : (
          <>
            {providers.length > 1 && (
              <Segmented
                block
                value={provider.key}
                onChange={(key) => {
                  setSelected(String(key))
                  setError('')
                }}
                options={providers.map((p) => ({ value: p.key, label: p.title }))}
                className="page-notice"
              />
            )}
            {error && <Alert type="error" title={error} showIcon className="page-notice" />}
            <Form
              key={provider.key}
              layout="vertical"
              initialValues={initial}
              onFinish={async (values) => {
                setBusy(true)
                setError('')
                try {
                  await api(provider.path, {
                    method: 'POST',
                    body: serialize(provider.fields, values),
                  })
                  message.success('账户已创建，请登录')
                  navigate(loginPath)
                } catch (e) {
                  setError(errorText(e))
                } finally {
                  setBusy(false)
                }
              }}
            >
              <Fields fields={provider.fields} />
              <Button type="primary" htmlType="submit" size="large" block loading={busy}>
                创建账户
              </Button>
            </Form>
          </>
        )}
        <div className="auth-links">
          <Link to={loginPath}>
            <ArrowLeftOutlined /> 返回登录
          </Link>
        </div>
      </div>
    </div>
  )
}
