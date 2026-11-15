import { useState, type ReactNode } from 'react'
import type { Field, Resource, Row } from '../api'
import MailTemplateEditor from '../components/MailTemplateEditor'
import MailCampaignEditor from '../components/MailCampaignEditor'

// Official business presentations are selected by the resource declaration.
export function useResourcePresentation(
  resource: Resource,
  data: Row[],
  pluginId: string,
  reload: () => void,
) {
  const [parent, setParent] = useState<Row | null>(null)
  const mailTemplates = resource.renderer === 'mail-templates'
  const campaigns = resource.renderer === 'mail-campaigns'
  return {
    openEditor: (row?: Row) => {
      if (!campaigns && (!mailTemplates || !row)) return false
      setParent(row || {})
      return true
    },
    rows: data,
    searchRows: (row: Row) => [row],
    canDelete: (_row: Row) => true,
    cell: (_field: Field, _row: Row, content: ReactNode) => content,
    exportRows: (rows: Row[]) => ({ rows, columns: resource.columns }),
    overlay:
      campaigns && parent ? (
        <MailCampaignEditor
          campaign={parent}
          pluginId={pluginId}
          endpoint={resource.endpoint}
          onClose={() => setParent(null)}
          onSaved={reload}
        />
      ) : mailTemplates && parent ? (
        <MailTemplateEditor
          template={parent}
          pluginId={pluginId}
          endpoint={resource.endpoint}
          onClose={() => setParent(null)}
          onSaved={reload}
        />
      ) : null,
  }
}
