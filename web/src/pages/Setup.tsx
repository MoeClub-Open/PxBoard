import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Form, Input, Radio } from 'antd'
import { api, errorText } from '../api'
import { Brand } from '../components/Brand'
import { useBrandTitle } from '../branding'

export default function Setup({ onCreated }: { onCreated: () => Promise<void> }) {
  useBrandTitle('创建站点')
  const [form] = Form.useForm()
  const mode = Form.useWatch('mode', form)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  async function submit(values: Record<string, string>) {
    setBusy(true)
    setError('')
    try {
      if (!created) {
        await api('/setup', {
          method: 'POST',
          body: { ...values, publicUrl: window.location.origin },
        })
        setCreated(true)
      }
      await api('/auth/login', {
        method: 'POST',
        body: { email: values.email, password: values.password },
      })
      await onCreated()
      navigate('/setup', { replace: true })
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <Brand />
      </div>
      <main className="auth-form">
        <h1>{created ? '继续配置站点' : '创建站点'}</h1>
        {error && <Alert type="error" title={error} showIcon className="page-notice" />}
        <Form
          form={form}
          layout="vertical"
          initialValues={{ mode: 'personal', siteName: 'PxBoard', name: '管理员' }}
          requiredMark={false}
          onFinish={submit}
        >
          <Form.Item name="mode" label="使用方式">
            <Radio.Group
              disabled={created}
              options={[
                { value: 'personal', label: '自用' },
                { value: 'business', label: '商业运营' },
              ]}
              optionType="button"
            />
          </Form.Item>
          <p className="muted">
            {mode === 'business'
              ? '提供公开首页、套餐购买、支付与用户服务。'
              : '管理自己的节点、访问账户与订阅，可按需开放分享功能。'}
          </p>
          <Form.Item
            name="siteName"
            label="站点名称"
            rules={[{ required: true, message: '请输入站点名称' }]}
          >
            <Input autoComplete="organization" disabled={created} />
          </Form.Item>
          <Form.Item name="name" label="管理员名称">
            <Input autoComplete="name" disabled={created} />
          </Form.Item>
          <Form.Item
            name="email"
            label="管理员邮箱"
            rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}
          >
            <Input autoComplete="email" />
          </Form.Item>
          <Form.Item
            name="password"
            label="管理员密码"
            rules={[{ required: true, min: 10, message: '密码至少 10 位' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          {!created && (
            <Form.Item
              name="confirmPassword"
              label="确认密码"
              dependencies={['password']}
              rules={[
                { required: true, message: '请再次输入密码' },
                ({ getFieldValue }) => ({
                  validator: (_, value) =>
                    value === getFieldValue('password')
                      ? Promise.resolve()
                      : Promise.reject(new Error('两次密码不一致')),
                }),
              ]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          )}
          <Button type="primary" htmlType="submit" loading={busy} block>
            {created ? '登录并继续' : '创建并继续'}
          </Button>
        </Form>
      </main>
    </div>
  )
}
