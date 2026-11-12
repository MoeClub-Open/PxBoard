import { useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  QRCode,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
} from 'antd'
import {
  CopyOutlined,
  DownloadOutlined,
  PlusOutlined,
  QrcodeOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { absoluteURL, errorText, rpc, useRpc } from '../api'
import type { Row } from '../api'
import { useSession } from '../context'
import { date } from './PortalShared'
import { ChallengeNotice, HumanChallenge, useHumanChallenge } from '../components/HumanChallenge'

export function PortalSubscriptions() {
  const { me, plugins } = useSession()
  const { message, modal } = App.useApp()
  const links = useRpc<Row[]>('subscriptions/links.list', { mine: true })
  const accounts = useRpc<Row[]>('access/accounts.list', { mine: true }, 5)
  const settings = useRpc<Row>('subscriptions/settings.public')
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [verifying, setVerifying] = useState<Row>()
  const [qr, setQr] = useState<{ label: string; url: string }>()
  const [form] = Form.useForm()
  const challenge = useHumanChallenge()
  const ownLinks = (links.data || []).filter((row) => row.userId === me.id)
  const account = accounts.data?.find((row) => row.userId === me.id)
  const redeem = plugins.some(
    (p) =>
      p.id === 'redeem' &&
      p.enabled &&
      p.pages.some(
        (page) => page.id === 'redeem' && page.roles.includes('member') && page.surface !== 'admin',
      ),
  )
  const business = me.mode === 'business' && plugins.some((p) => p.id === 'commerce' && p.enabled)

  async function create() {
    let values: Row
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setBusy(true)
    try {
      await rpc('subscriptions/links.create', values)
      setCreating(false)
      form.resetFields()
      links.reload()
      message.success('订阅链接已创建')
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  async function action(link: Row, kind: 'rotate' | 'delete') {
    try {
      await rpc(kind === 'rotate' ? 'subscriptions/links.rotate' : 'subscriptions/links.delete', {
        id: link.id,
      })
      links.reload()
      message.success(kind === 'rotate' ? '订阅链接已重置' : '订阅链接已删除')
    } catch (e) {
      message.error(errorText(e))
    }
  }
  async function verify() {
    if (!verifying || !challenge.token) return
    setBusy(true)
    try {
      await rpc('subscriptions/links.verify', {
        id: verifying.id,
        challengeToken: challenge.token,
      })
      setVerifying(undefined)
      links.reload()
      message.success('验证成功，订阅链接已启用')
    } catch (e) {
      message.error(errorText(e))
    } finally {
      challenge.reset()
      setBusy(false)
    }
  }
  return (
    <>
      <div className="page-heading">
        <h1>我的订阅</h1>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={links.reload}>
            刷新
          </Button>
          {account?.effective && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              创建订阅
            </Button>
          )}
        </Space>
      </div>
      {(links.error || accounts.error) && (
        <Alert
          type="error"
          title={links.error || accounts.error}
          action={
            <Button
              onClick={() => {
                links.reload()
                accounts.reload()
              }}
            >
              重试
            </Button>
          }
          className="portal-notice"
        />
      )}
      {account && !account.effective && (
        <Alert
          type="warning"
          title="当前服务不可用，请先检查到期时间、流量或账户状态"
          className="portal-notice"
        />
      )}
      {links.loading || accounts.loading ? (
        <div className="page-loading">
          <Spin />
        </div>
      ) : links.error || accounts.error ? null : ownLinks.length ? (
        ownLinks.map((link) => {
          const url = link.shareUrl ? absoluteURL(String(link.shareUrl)) : ''
          const name = String(link.name || '订阅链接')
          const pending = link.verificationRequired && !link.verified
          return (
            <Card
              size="small"
              key={link.id}
              className="section-card"
              title={
                <Space wrap size={8}>
                  <span>{name}</span>
                  <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>
                    {date(link.createdAt)}
                  </Typography.Text>
                  {link.bindUserAgent && (
                    <Tag style={{ marginInlineEnd: 0 }}>
                      {link.boundClient
                        ? `已绑定 ${link.boundClient}${link.boundMajor ? ` ${link.boundMajor}` : ''}`
                        : '等待客户端绑定'}
                    </Tag>
                  )}
                </Space>
              }
              extra={
                <Space size={4}>
                  <Button
                    size="small"
                    type="link"
                    onClick={() =>
                      modal.confirm({
                        title: '重置订阅链接？',
                        content: '旧链接会立即失效，并解除客户端绑定。',
                        okText: '重置',
                        cancelText: '取消',
                        onOk: () => action(link, 'rotate'),
                      })
                    }
                  >
                    重置
                  </Button>
                  <Button
                    size="small"
                    type="link"
                    danger
                    onClick={() =>
                      modal.confirm({
                        title: '删除订阅链接？',
                        content: '该链接会立即失效，已导入的客户端需要改用其他链接。',
                        okText: '删除',
                        cancelText: '取消',
                        onOk: () => action(link, 'delete'),
                      })
                    }
                  >
                    删除
                  </Button>
                </Space>
              }
            >
              {pending ? (
                <Flex justify="space-between" align="center" gap={8} wrap>
                  <span>完成验证后获取链接</span>
                  <Button
                    type="primary"
                    size="small"
                    onClick={() => {
                      challenge.reset()
                      setVerifying(link)
                    }}
                  >
                    验证
                  </Button>
                </Flex>
              ) : url ? (
                <Flex gap={8} wrap align="center">
                  <Space.Compact style={{ flex: '1 1 280px' }}>
                    <Input readOnly value={url} aria-label={`${name}地址`} />
                    <Button
                      icon={<CopyOutlined />}
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(url)
                          .then(() => message.success('订阅链接已复制'))
                          .catch(() => message.error('复制失败，请选中链接手动复制'))
                      }
                    >
                      复制链接
                    </Button>
                  </Space.Compact>
                  <Button icon={<QrcodeOutlined />} onClick={() => setQr({ label: name, url })}>
                    二维码
                  </Button>
                  {!link.bindUserAgent && settings.data && !settings.data.hideFromBrowsers && (
                    <Button icon={<DownloadOutlined />} href={url} target="_blank" rel="noreferrer">
                      下载配置
                    </Button>
                  )}
                </Flex>
              ) : null}
            </Card>
          )
        })
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={account?.effective ? '尚未创建订阅链接' : '开通服务后即可获取订阅'}
        >
          {!account?.effective && account?.status !== 'suspended' && business && (
            <Link to="/user/plans">
              <Button type="primary">选购套餐</Button>
            </Link>
          )}
          {!account?.effective && account?.status !== 'suspended' && !business && redeem && (
            <Link to="/user/redeem">
              <Button type="primary">兑换码</Button>
            </Link>
          )}
        </Empty>
      )}
      <Modal
        open={creating}
        title="创建订阅"
        onCancel={() => setCreating(false)}
        onOk={() => void create()}
        confirmLoading={busy}
        okText="创建"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ name: '', bindUserAgent: false }}>
          <Form.Item name="name" label="名称">
            <Input placeholder="例如：手机或电脑" />
          </Form.Item>
          <Form.Item name="bindUserAgent" label="绑定首次使用的客户端" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={!!verifying}
        title="验证订阅"
        onCancel={() => {
          setVerifying(undefined)
          challenge.reset()
        }}
        onOk={() => void verify()}
        confirmLoading={busy}
        okButtonProps={{ disabled: !challenge.token || !!challenge.error }}
        okText="验证并启用"
        cancelText="取消"
        destroyOnHidden
      >
        <ChallengeNotice loading={challenge.loading} error={challenge.error} />
        {!challenge.loading && !challenge.error && !challenge.policy?.enabled && (
          <Alert type="error" title="人机验证暂不可用，请联系管理员" showIcon />
        )}
        {challenge.policy?.enabled && (
          <HumanChallenge
            policy={challenge.policy}
            generation={challenge.generation}
            onToken={challenge.setToken}
            onError={challenge.setError}
          />
        )}
      </Modal>
      <Modal open={!!qr} title={qr?.label} footer={null} onCancel={() => setQr(undefined)}>
        <div className="portal-qr">
          {qr && (
            <>
              <QRCode value={qr.url} size={232} />
              <Typography.Paragraph copyable className="portal-break">
                {qr.url}
              </Typography.Paragraph>
            </>
          )}
        </div>
      </Modal>
    </>
  )
}
