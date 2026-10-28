import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Dropdown,
  Form,
  Input,
  Modal,
  Space,
  Spin,
  Tabs,
  Typography,
} from 'antd'
import { api, errorText, type Row, useData } from '../api'

export default function MailTemplateEditor({
  template,
  endpoint,
  onClose,
  onSaved,
}: {
  template: Row
  endpoint: string
  onClose: () => void
  onSaved: () => void
}) {
  const { message } = App.useApp()
  const path = `${endpoint}/${encodeURIComponent(template.id)}`
  const { data, loading, error } = useData<Row>(path)
  const [form] = Form.useForm()
  const [tab, setTab] = useState('text')
  const [preview, setPreview] = useState<Row>()
  const [busy, setBusy] = useState<'save' | 'preview'>()
  const [activeField, setActiveField] = useState('text')
  const selection = useRef({ key: 'text', start: 0, end: 0 })
  useEffect(() => {
    if (data) {
      form.setFieldsValue({ subject: data.subject, text: data.text, html: data.html })
      selection.current = { key: 'text', start: data.text.length, end: data.text.length }
    }
  }, [data, form])
  function remember(key: string, field: HTMLInputElement | HTMLTextAreaElement) {
    setActiveField(key)
    selection.current = { key, start: field.selectionStart || 0, end: field.selectionEnd || 0 }
  }
  function insert(token: string) {
    const { key, start, end } = selection.current
    const value = String(form.getFieldValue(key) || '')
    form.setFieldValue(key, value.slice(0, start) + token + value.slice(end))
    selection.current = { key, start: start + token.length, end: start + token.length }
    setPreview(undefined)
    setTab(key === 'html' ? 'html' : 'text')
    requestAnimationFrame(() => {
      const field = document.getElementById(`mail-template-${key}`) as
        HTMLInputElement | HTMLTextAreaElement | null
      field?.focus()
      field?.setSelectionRange(start + token.length, start + token.length)
    })
  }
  async function submit(mode: 'save' | 'preview') {
    let values: Row
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setBusy(mode)
    try {
      const result = await api(mode === 'preview' ? `${path}/preview` : path, {
        method: mode === 'preview' ? 'POST' : 'PATCH',
        body: values,
      })
      if (mode === 'preview') {
        setPreview(result)
        setTab('preview')
      } else {
        message.success('模板已保存')
        onSaved()
        onClose()
      }
    } catch (error) {
      message.error(errorText(error))
    } finally {
      setBusy(undefined)
    }
  }
  return (
    <Modal
      open
      forceRender
      title={template.name}
      width={880}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button
            disabled={loading || !!error || !!busy}
            loading={busy === 'preview'}
            onClick={() => void submit('preview')}
          >
            预览
          </Button>
          <Button
            type="primary"
            disabled={loading || !!error || busy === 'preview'}
            loading={busy === 'save'}
            onClick={() => void submit('save')}
          >
            保存
          </Button>
        </Space>
      }
    >
      {error && <Alert type="error" title={error} />}
      <Spin spinning={loading}>
        <Form form={form} layout="vertical" onValuesChange={() => setPreview(undefined)}>
          <Form.Item
            name="subject"
            label="主题"
            rules={[{ required: true, message: '请填写邮件主题' }]}
          >
            <Input
              id="mail-template-subject"
              onFocus={(e) => remember('subject', e.currentTarget)}
              onSelect={(e) => remember('subject', e.currentTarget)}
            />
          </Form.Item>
          <Dropdown
            menu={{
              items: (data?.variables || [])
                .filter((item: Row) => item.scope !== 'html' || activeField === 'html')
                .map((item: Row) => ({
                  key: item.token,
                  label: `${item.label} ${item.token}`,
                })),
              onClick: ({ key }) => insert(key),
            }}
          >
            <Button disabled={loading}>插入变量</Button>
          </Dropdown>
          <Tabs
            activeKey={tab}
            onChange={setTab}
            items={[
              {
                key: 'text',
                label: '正文',
                forceRender: true,
                children: (
                  <Form.Item name="text" rules={[{ required: true, message: '请填写邮件正文' }]}>
                    <Input.TextArea
                      id="mail-template-text"
                      autoSize={{ minRows: 10, maxRows: 18 }}
                      onFocus={(e) => remember('text', e.currentTarget)}
                      onSelect={(e) => remember('text', e.currentTarget)}
                    />
                  </Form.Item>
                ),
              },
              {
                key: 'html',
                label: 'HTML 外观',
                forceRender: true,
                children: (
                  <Form.Item name="html">
                    <Input.TextArea
                      id="mail-template-html"
                      autoSize={{ minRows: 12, maxRows: 22 }}
                      spellCheck={false}
                      style={{ fontFamily: 'monospace', fontSize: 13 }}
                      onFocus={(e) => remember('html', e.currentTarget)}
                      onSelect={(e) => remember('html', e.currentTarget)}
                    />
                  </Form.Item>
                ),
              },
              {
                key: 'preview',
                label: '预览',
                disabled: !preview,
                children: preview && (
                  <>
                    <Typography.Paragraph strong>{preview.subject}</Typography.Paragraph>
                    {preview.html ? (
                      <iframe
                        title="邮件预览"
                        sandbox=""
                        referrerPolicy="no-referrer"
                        srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https: http:;">${preview.html}`}
                        style={{
                          width: '100%',
                          height: 390,
                          border: '1px solid #e5e7eb',
                          borderRadius: 6,
                        }}
                      />
                    ) : (
                      <div style={{ whiteSpace: 'pre-wrap' }}>{preview.text}</div>
                    )}
                  </>
                ),
              },
            ]}
          />
        </Form>
      </Spin>
    </Modal>
  )
}
