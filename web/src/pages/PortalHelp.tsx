import { useState } from 'react'
import { Alert, Button, Collapse, Empty, Input, Modal, Spin } from 'antd'
import { useRpc } from '../api'
import type { Row } from '../api'

export function PortalHelp() {
  const articles = useRpc<Row[]>('support/articles.list')
  const [search, setSearch] = useState('')
  const rows = (articles.data || []).filter(
    (row) =>
      row.published && `${row.title} ${row.content}`.toLowerCase().includes(search.toLowerCase()),
  )
  return (
    <>
      <div className="page-heading">
        <h1>使用帮助</h1>
        <Input.Search
          allowClear
          placeholder="搜索文档"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 240 }}
        />
      </div>
      {articles.error && (
        <Alert
          type="error"
          title={articles.error}
          action={<Button onClick={articles.reload}>重试</Button>}
        />
      )}
      {articles.loading ? (
        <div className="page-loading">
          <Spin />
        </div>
      ) : rows.length ? (
        <Collapse
          items={rows.map((row) => ({
            key: row.id,
            label: row.title,
            children: <div className="portal-article">{row.content}</div>,
          }))}
        />
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={search ? '没有找到相关文档' : '暂无使用文档'}
        />
      )}
    </>
  )
}

export function PortalAnnouncements() {
  const articles = useRpc<Row[]>('support/announcements.list')
  const [selected, setSelected] = useState<Row>()
  const rows = (articles.data || []).filter((row) => row.published).slice(0, 5)
  return (
    <section className="portal-announcements">
      <h2>公告</h2>
      {articles.error ? (
        <Alert
          type="warning"
          title={articles.error}
          action={<Button onClick={articles.reload}>重试</Button>}
        />
      ) : articles.loading ? (
        <Spin />
      ) : rows.length ? (
        <div className="data-list">
          {rows.map((row) => (
            <div className="data-row" key={row.id}>
              <Button type="link" className="portal-inline-button" onClick={() => setSelected(row)}>
                {row.title}
              </Button>
              <span className="muted date-cell">
                {row.createdAt ? new Date(row.createdAt).toLocaleDateString('zh-CN') : ''}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无公告" />
      )}
      <Modal
        open={!!selected}
        title={selected?.title}
        footer={null}
        onCancel={() => setSelected(undefined)}
      >
        <div className="portal-article">{selected?.content}</div>
      </Modal>
    </section>
  )
}
