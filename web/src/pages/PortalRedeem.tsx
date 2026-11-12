import { useCurrency } from '../currency'
import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Flex,
  Form,
  Input,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { errorText, rpc, useRpc } from '../api'
import { useSession } from '../context'
import { date } from './PortalShared'

type Claim = {
  id: string
  name: string
  kind: string
  summary: string
  status: 'pending' | 'redeemed'
  lastError?: string
  createdAt: string
  redeemedAt?: string
}
type Result = { id: string; status: 'pending' | 'redeemed'; message: string }

export default function PortalRedeem() {
  const { currencyName } = useCurrency()
  const { plugins } = useSession()
  const { message } = App.useApp()
  const enabled = plugins.some((plugin) => plugin.id === 'redeem' && plugin.enabled)
  const [polling, setPolling] = useState(false)
  const claims = useRpc<Claim[]>(
    enabled ? 'redeem/claims.list' : null,
    { mine: true },
    polling ? 5 : 0,
  )
  const [form] = Form.useForm<{ code: string }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Result>()
  const request = useRef({ code: '', id: crypto.randomUUID() })
  const sending = useRef(false)

  useEffect(() => {
    if (claims.data) {
      setPolling(claims.data.some((claim) => claim.status === 'pending'))
      if (
        pending &&
        claims.data.some((claim) => claim.id === pending.id && claim.status === 'redeemed')
      ) {
        message.success('兑换成功')
        form.resetFields()
        request.current = { code: '', id: crypto.randomUUID() }
        setError('')
        setPending(undefined)
      }
    }
  }, [claims.data, pending])

  function changeCode(code: string) {
    const value = code.trim()
    if (value !== request.current.code) {
      request.current = { code: value, id: crypto.randomUUID() }
      setError('')
      setPending(undefined)
    }
  }

  async function redeem(values: { code: string }) {
    if (sending.current) return
    const code = values.code.trim()
    if (code !== request.current.code) request.current = { code, id: crypto.randomUUID() }
    sending.current = true
    setBusy(true)
    setError('')
    try {
      const result = await rpc<Result>('redeem/redeem.create', {
        code,
        requestId: request.current.id,
      })
      if (result.status === 'redeemed') {
        message.success(result.message || '兑换成功')
        form.resetFields()
        request.current = { code: '', id: crypto.randomUUID() }
        setPending(undefined)
      } else {
        setPending(result)
        setPolling(true)
      }
      claims.reload()
    } catch (e) {
      setError(errorText(e))
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  if (!enabled)
    return (
      <div className="surface-empty">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="兑换码暂不可用" />
      </div>
    )
  return (
    <>
      <div className="page-heading">
        <h1>兑换码</h1>
        <Button icon={<ReloadOutlined />} onClick={claims.reload}>
          刷新
        </Button>
      </div>
      {error && <Alert type="error" title={error} showIcon className="portal-notice" />}
      {pending && (
        <Alert
          type="info"
          title={pending.message || '兑换已登记，正在处理'}
          showIcon
          className="portal-notice"
        />
      )}
      <Card size="small" className="section-card">
        <Form
          form={form}
          disabled={busy}
          onFinish={redeem}
          onValuesChange={({ code }) => changeCode(code || '')}
        >
          <Flex gap={8} align="flex-start">
            <Form.Item
              name="code"
              style={{ flex: 1, maxWidth: 380, marginBottom: 0 }}
              rules={[{ required: true, whitespace: true, message: '请输入兑换码' }]}
            >
              <Input
                aria-label="兑换码"
                placeholder="输入兑换码"
                autoComplete="off"
                spellCheck={false}
              />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={busy}>
              兑换
            </Button>
          </Flex>
        </Form>
      </Card>
      {claims.error && (
        <Alert
          type="error"
          title={claims.error}
          action={<Button onClick={claims.reload}>重试</Button>}
          className="portal-notice"
        />
      )}
      <Table<Claim>
        rowKey="id"
        size="small"
        dataSource={claims.data || []}
        loading={claims.loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 620 }}
        locale={{
          emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有兑换记录" />,
        }}
        columns={[
          { title: '名称', dataIndex: 'name' },
          {
            title: '兑换内容',
            dataIndex: 'summary',
            render: (value, row) => (row.kind === 'balance' ? `${value} ${currencyName}` : value),
          },
          {
            title: '状态',
            render: (_, claim) => (
              <Space orientation="vertical" size={4}>
                <Tag
                  color={
                    claim.status === 'redeemed'
                      ? 'success'
                      : claim.lastError
                        ? 'warning'
                        : 'processing'
                  }
                >
                  {claim.status === 'redeemed' ? '已兑换' : claim.lastError ? '等待重试' : '处理中'}
                </Tag>
                {claim.lastError && (
                  <Typography.Text type="secondary">{claim.lastError}</Typography.Text>
                )}
              </Space>
            ),
          },
          { title: '时间', render: (_, claim) => date(claim.redeemedAt || claim.createdAt) },
        ]}
      />
    </>
  )
}
