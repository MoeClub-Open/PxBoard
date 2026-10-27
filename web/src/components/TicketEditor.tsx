import { useRef, useState } from 'react'
import type { ClipboardEvent } from 'react'
import { App, Button, Input, Modal, Space, Upload } from 'antd'
import { FileImageOutlined, LinkOutlined, VideoCameraOutlined } from '@ant-design/icons'
import type { TextAreaRef } from 'antd/es/input/TextArea'
import { api, errorText } from '../api'
import { TicketMarkdown } from './TicketMarkdown'

type Props = {
  value?: string
  onChange?: (value: string) => void
  onUploadingChange?: (busy: boolean) => void
}
export function TicketEditor({ value = '', onChange, onUploadingChange }: Props) {
  const { message } = App.useApp()
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(false)
  const [linkType, setLinkType] = useState<'image' | 'video'>()
  const [url, setUrl] = useState('')
  const area = useRef<TextAreaRef>(null)
  const current = useRef(value)
  current.current = value
  function insert(text: string) {
    const node = area.current?.resizableTextArea?.textArea
    const start = node?.selectionStart ?? current.current.length
    const end = node?.selectionEnd ?? start
    const before = current.current.slice(0, start)
    const after = current.current.slice(end)
    const prefix = before && !before.endsWith('\n') ? '\n' : ''
    const suffix = after && !after.startsWith('\n') ? '\n' : ''
    const next = before + prefix + text + suffix + after
    current.current = next
    onChange?.(next)
    requestAnimationFrame(() => {
      node?.focus()
      node?.setSelectionRange(
        start + prefix.length + text.length,
        start + prefix.length + text.length,
      )
    })
  }
  async function upload(file: File) {
    if (uploading) return
    if (file.size > 2 * 1024 * 1024) {
      message.error('图片大小不能超过 2 MB')
      return
    }
    setUploading(true)
    onUploadingChange?.(true)
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
        reader.onerror = () => reject(new Error('图片读取失败'))
        reader.readAsDataURL(file)
      })
      const result = await api<{ url: string }>('/extensions/support/attachments', {
        method: 'POST',
        body: { data },
      })
      setPreview(false)
      insert(`![图片](${result.url})`)
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setUploading(false)
      onUploadingChange?.(false)
    }
  }
  function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const file = Array.from(event.clipboardData.files).find((item) =>
      item.type.startsWith('image/'),
    )
    if (file) {
      event.preventDefault()
      void upload(file)
    }
  }
  function addLink() {
    try {
      const parsed = new URL(url.trim())
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error()
      insert(`${linkType === 'image' ? '![图片]' : '[视频]'}(<${parsed.href}>)`)
      setLinkType(undefined)
      setUrl('')
      setPreview(false)
    } catch {
      message.error('请输入有效的 HTTP 或 HTTPS 链接')
    }
  }
  return (
    <div className="ticket-editor">
      <div className="ticket-editor-toolbar">
        <Space wrap size={4}>
          <Upload
            accept="image/png,image/jpeg,image/gif,image/webp"
            showUploadList={false}
            beforeUpload={(file) => {
              void upload(file)
              return Upload.LIST_IGNORE
            }}
            disabled={uploading}
          >
            <Button type="text" icon={<FileImageOutlined />} loading={uploading}>
              上传图片
            </Button>
          </Upload>
          <Button type="text" icon={<LinkOutlined />} onClick={() => setLinkType('image')}>
            图片链接
          </Button>
          <Button type="text" icon={<VideoCameraOutlined />} onClick={() => setLinkType('video')}>
            视频链接
          </Button>
        </Space>
        <Button type="text" onClick={() => setPreview((v) => !v)}>
          {preview ? '编辑' : '预览'}
        </Button>
      </div>
      {preview ? (
        <div className="ticket-preview">
          <TicketMarkdown value={value || '暂无内容'} />
        </div>
      ) : (
        <Input.TextArea
          ref={area}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onPaste={paste}
          autoSize={{ minRows: 5, maxRows: 16 }}
        />
      )}
      <Modal
        open={!!linkType}
        title={linkType === 'image' ? '图片链接' : '视频链接'}
        onOk={addLink}
        onCancel={() => {
          setLinkType(undefined)
          setUrl('')
        }}
        okText="插入"
        cancelText="取消"
        destroyOnHidden
      >
        <Input
          aria-label="链接地址"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          onPressEnter={addLink}
        />
      </Modal>
    </div>
  )
}
