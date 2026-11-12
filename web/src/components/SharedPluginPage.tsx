import { useState } from 'react'
import { Empty, Select, Space } from 'antd'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useSession } from '../context'
import ResourcePage, { type ResourceTabsProps } from './ResourcePage'
import { settingsDestinations } from '../settingsDestinations'
import { adminURL } from '../adminPath'

export function PluginPageRoute() {
  const { pluginId, pageId } = useParams()
  const { me, plugins } = useSession()
  const [statusTab, setStatusTab] = useState('status')
  const page = plugins
    .find((plugin) => plugin.enabled && plugin.id === pluginId)
    ?.pages.find(
      (item) => item.id === pageId && item.roles.includes(me.role) && item.surface !== 'portal',
    )
  const destination = settingsDestinations[`${pluginId}/${pageId}`]
  if (page && destination) return <Navigate to={adminURL(destination, me)} replace />
  if (page && pluginId === 'nodes' && pageId === 'status') {
    const settings = plugins
      .find((plugin) => plugin.id === 'nodes' && plugin.enabled)
      ?.pages.some(
        (item) =>
          item.id === 'settings' && item.roles.includes(me.role) && item.surface !== 'portal',
      )
    if (!settings) return <ResourcePage />
    const tabs: ResourceTabsProps = {
      activeKey: statusTab,
      onChange: setStatusTab,
      items: [
        { key: 'status', label: '监控状态' },
        { key: 'settings', label: '前台展示' },
      ],
    }
    return statusTab === 'status' ? (
      <ResourcePage tabs={tabs} />
    ) : (
      <>
        <div className="page-heading">
          <h1>服务器监控</h1>
        </div>
        <ResourcePage pluginId="nodes" pageId="settings" hideHeading tabs={tabs} />
      </>
    )
  }
  if (page?.shared) {
    return (
      <Navigate
        to={adminURL(
          `/admin/shared/${encodeURIComponent(page.shared.id)}?page=${encodeURIComponent(`${pluginId}/${pageId}`)}`,
          me,
        )}
        replace
      />
    )
  }
  return <ResourcePage />
}

export default function SharedPluginPage() {
  const { sharedId } = useParams()
  const [query, setQuery] = useSearchParams()
  const { me, plugins } = useSession()
  const choices = plugins
    .filter((plugin) => plugin.enabled)
    .flatMap((plugin) =>
      plugin.pages
        .filter(
          (page) =>
            page.shared?.id === sharedId &&
            page.roles.includes(me.role) &&
            page.surface !== 'portal',
        )
        .map((page) => ({ plugin, page })),
    )
  const selected =
    choices.find(({ plugin, page }) => `${plugin.id}/${page.id}` === query.get('page')) ||
    choices[0]
  if (!selected)
    return (
      <div className="surface-empty">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="此功能暂未开放" />
      </div>
    )
  return (
    <>
      <div className="page-heading">
        <h1>{selected.page.shared?.title}</h1>
        <Space>
          <span>{selected.page.shared?.selectorLabel || '选择类型'}</span>
          <Select
            aria-label={selected.page.shared?.selectorLabel || '选择类型'}
            value={`${selected.plugin.id}/${selected.page.id}`}
            style={{ minWidth: 170 }}
            options={choices.map(({ plugin, page }) => ({
              value: `${plugin.id}/${page.id}`,
              label: page.title,
            }))}
            onChange={(value) => setQuery({ page: value }, { replace: true })}
          />
        </Space>
      </div>
      <ResourcePage
        key={`${selected.plugin.id}/${selected.page.id}`}
        pluginId={selected.plugin.id}
        pageId={selected.page.id}
        hideHeading
      />
    </>
  )
}
