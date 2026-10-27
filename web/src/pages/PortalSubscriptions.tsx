import { useState } from 'react'
import { Alert, App, Button, Empty, Input, Modal, QRCode, Space, Spin, Typography } from 'antd'
import { CopyOutlined, DownloadOutlined, QrcodeOutlined, ReloadOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { absoluteURL, api, errorText, useData } from '../api'
import type { Row } from '../api'
import { useSession } from '../context'
import { date } from './PortalShared'
import { ChallengeNotice, HumanChallenge, useHumanChallenge } from '../components/HumanChallenge'

export function PortalSubscriptions() {
  const { me } = useSession()
  const { message, modal } = App.useApp()
  const links = useData<Row[]>('/extensions/subscriptions/links?mine=1')
  const accounts = useData<Row[]>('/extensions/access/accounts?mine=1', 5)
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState<{ label: string; url: string }>()
  const challenge = useHumanChallenge()
  const ownLinks = (links.data || []).filter((row) => row.userId === me.id)
  const account = accounts.data?.find((row) => row.userId === me.id)
  async function create() {
    setBusy(true)
    try {
      await api('/extensions/subscriptions/links', { method: 'POST', body: {} })
      links.reload()
      message.success('订阅链接已生成')
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  async function rotate(link: Row) {
    try {
      await api(`/extensions/subscriptions/links/${link.id}/rotate`, { method: 'POST', body: {} })
      links.reload()
      message.success('订阅链接已重置')
    } catch (e) {
      message.error(errorText(e))
    }
  }
  async function verify(link: Row) {
    if (!challenge.token) return
    setBusy(true)
    try {
      await api(`/extensions/subscriptions/links/${link.id}/verify`, {
        method: 'POST',
        body: { challengeToken: challenge.token },
      })
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
        <Button icon={<ReloadOutlined />} onClick={links.reload} aria-label="刷新订阅" />
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
      {links.loading || accounts.loading ? (
        <div className="page-loading">
          <Spin />
        </div>
      ) : ownLinks.length ? (
        ownLinks.map((link) => {
          const url = link.shareUrl ? absoluteURL(String(link.shareUrl)) : ''
          return (
            <section className="portal-subscription" key={link.id}>
              <div className="portal-subscription-heading">
                <Typography.Text type="secondary">创建于 {date(link.createdAt)}</Typography.Text>
                <Button
                  danger
                  onClick={() =>
                    modal.confirm({
                      title: '重置订阅链接？',
                      content: '旧链接会立即失效，需要重新添加到客户端。',
                      okText: '重置链接',
                      cancelText: '取消',
                      onOk: () => rotate(link),
                    })
                  }
                >
                  重置链接
                </Button>
              </div>
              {account && !account.effective && (
                <Alert
                  type="warning"
                  title="当前服务不可用，请先检查到期时间、流量或账户状态"
                  className="portal-notice"
                />
              )}
              {link.verificationRequired && !link.verified ? (
                <div className="portal-subscription-format">
                  <h2>验证订阅</h2>
                  <Typography.Paragraph type="secondary">
                    完成验证后，订阅链接可供客户端持续更新。重置链接或重新启用验证后需要再次验证。
                  </Typography.Paragraph>
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
                  <Button
                    type="primary"
                    loading={busy}
                    disabled={!challenge.token || !!challenge.error}
                    onClick={() => void verify(link)}
                  >
                    验证并启用订阅
                  </Button>
                </div>
              ) : url ? (
                <div className="portal-subscription-format">
                  <h2>通用订阅</h2>
                  <Input readOnly value={url} aria-label="通用订阅链接" />
                  <Space wrap>
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
                    <Button
                      icon={<QrcodeOutlined />}
                      onClick={() => setQr({ label: '通用订阅', url })}
                    >
                      二维码
                    </Button>
                    <Button icon={<DownloadOutlined />} href={url} target="_blank" rel="noreferrer">
                      下载配置
                    </Button>
                  </Space>
                </div>
              ) : null}
            </section>
          )
        })
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={account?.effective ? '尚未生成订阅链接' : '开通服务后即可获取订阅'}
        >
          {account?.effective ? (
            <Button type="primary" loading={busy} onClick={() => void create()}>
              生成订阅链接
            </Button>
          ) : me.mode === 'business' ? (
            <Link to="/user/plans">
              <Button type="primary">选购套餐</Button>
            </Link>
          ) : null}
        </Empty>
      )}
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
