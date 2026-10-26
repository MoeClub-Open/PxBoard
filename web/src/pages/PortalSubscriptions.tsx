import { useState } from 'react'
import { Alert, App, Button, Empty, Input, Modal, QRCode, Space, Spin, Typography } from 'antd'
import { CopyOutlined, DownloadOutlined, QrcodeOutlined, ReloadOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { absoluteURL, api, errorText, useData } from '../api'
import type { Row } from '../api'
import { useSession } from '../context'
import { date } from './PortalShared'

export function PortalSubscriptions() {
  const { me } = useSession()
  const { message, modal } = App.useApp()
  const links = useData<Row[]>('/extensions/subscriptions/links')
  const accounts = useData<Row[]>('/extensions/access/accounts', 5)
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState<{ label: string; url: string }>()
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
        ownLinks.map((link) => (
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
            {[
              { key: 'clashUrl', label: 'Clash / Mihomo' },
              { key: 'singboxUrl', label: 'sing-box' },
              { key: 'shareUrl', label: '通用订阅' },
            ].map((item) => {
              if (!link[item.key]) return null
              const url = absoluteURL(String(link[item.key]))
              return (
                <div className="portal-subscription-format" key={item.key}>
                  <h2>{item.label}</h2>
                  <Input readOnly value={url} aria-label={`${item.label}订阅链接`} />
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
                      onClick={() => setQr({ label: item.label, url })}
                    >
                      二维码
                    </Button>
                    <Button icon={<DownloadOutlined />} href={url} target="_blank" rel="noreferrer">
                      下载配置
                    </Button>
                  </Space>
                </div>
              )
            })}
          </section>
        ))
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
