import { useState, type ReactNode } from 'react'
import { Button } from 'antd'
import type { Field, Resource, Row } from '../api'
import NodeAddresses from '../components/NodeAddresses'

// Official business presentations are selected by the resource declaration.
export function useResourcePresentation(
  resource: Resource,
  data: Row[],
  endpoint: string,
  reload: () => void,
  edit: (row: Row) => void,
) {
  const [parent, setParent] = useState<Row | null>(null)
  const addresses = resource.renderer === 'node-connections'
  const grouped = addresses || resource.renderer === 'node-status'
  const ids = new Set(data.map((row) => row.id))
  return {
    rows: data.filter(
      (row) => !grouped || !row.parentId || !ids.has(row.parentId) || (addresses && row.enabled),
    ),
    searchRows: (row: Row) =>
      grouped
        ? [
            row,
            ...data.filter((child) => child.parentId === row.id && (!addresses || !child.enabled)),
          ]
        : [row],
    canDelete: (row: Row) => !addresses || !data.some((child) => child.parentId === row.id),
    cell: (field: Field, row: Row, content: ReactNode) =>
      addresses && field.key === 'name' ? (
        <div>
          {content}
          <div>
            <Button
              type="link"
              size="small"
              style={{ padding: 0, height: 'auto' }}
              onClick={() => setParent(row)}
            >
              {1 + data.filter((child) => child.parentId === row.id && !child.enabled).length}{' '}
              个地址
            </Button>
          </div>
        </div>
      ) : (
        content
      ),
    exportRows: (rows: Row[]) => {
      if (!addresses) return { rows, columns: resource.columns }
      const selected = new Set(rows.map((row) => row.id))
      return {
        rows: data
          .filter((row) => selected.has(row.id) || (!row.enabled && selected.has(row.parentId)))
          .map((row) => ({
            ...row,
            parentName: selected.has(row.parentId)
              ? data.find((parent) => parent.id === row.parentId)?.name
              : '',
          })),
        columns: [...resource.columns, { key: 'parentName', label: '所属主节点' }],
      }
    },
    overlay:
      addresses && parent ? (
        <NodeAddresses
          parent={parent}
          nodes={data}
          resource={resource}
          endpoint={endpoint}
          onClose={() => setParent(null)}
          onChange={reload}
          onEditParent={() => {
            setParent(null)
            edit(parent)
          }}
        />
      ) : null,
  }
}
