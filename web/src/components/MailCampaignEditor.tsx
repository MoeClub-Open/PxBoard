import { useEffect, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Typography,
} from 'antd'
import { errorText, pluginResourceTarget, rpc } from '../api'
import type { Row } from '../api'

export default function MailCampaignEditor({
  campaign,
  pluginId,
  endpoint,
  onClose,
  onSaved,
}: {
  campaign: Row
  pluginId: string
  endpoint: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form] = Form.useForm()
  const { message, modal } = App.useApp()
  const [row, setRow] = useState<Row>(campaign)
  const [preview, setPreview] = useState<Row>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const audience = Form.useWatch('audience', form)
  const editable = !row.id || ['draft', 'ready'].includes(String(row.status))
  useEffect(() => {
    form.setFieldsValue({ audience: 'all', ...campaign })
    if (!campaign.id) return
    setBusy(true)
    const getCall = pluginResourceTarget(pluginId, endpoint, 'get', { id: campaign.id })
    rpc<Row>(getCall.target, getCall.input)
      .then((data) => {
        setRow(data)
        form.setFieldsValue(data)
      })
      .catch((e) => setError(errorText(e)))
      .finally(() => setBusy(false))
  }, [campaign, endpoint, form, pluginId])
  async function save(andPreview: boolean) {
    let values: Row
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setBusy(true)
    setError('')
    try {
      const saveCall = pluginResourceTarget(
        pluginId,
        endpoint,
        row.id ? 'update' : 'create',
        row.id ? { ...values, id: row.id } : values,
      )
      const saved = await rpc<Row>(saveCall.target, saveCall.input)
      setRow(saved)
      onSaved()
      if (andPreview) {
        const previewCall = pluginResourceTarget(pluginId, endpoint, 'preview', { id: saved.id })
        const result = await rpc<Row>(previewCall.target, previewCall.input)
        setPreview(result)
        setRow({ ...saved, status: 'ready', total: result.total })
        onSaved()
      } else {
        message.success('草稿已保存')
      }
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  function start() {
    if (!preview) return
    modal.confirm({
      title: `向 ${preview.total} 位用户发送邮件？`,
      content: '邮件按发送上限分批投递。已发送的邮件无法撤回。',
      okText: '开始发送',
      cancelText: '取消',
      onOk: async () => {
        const startCall = pluginResourceTarget(pluginId, endpoint, 'start', {
          id: row.id,
          total: preview.total,
        })
        await rpc(startCall.target, startCall.input)
        message.success('任务已开始，可在列表查看进度或暂停')
        onSaved()
        onClose()
      },
    })
  }
  return (
    <Modal
      open
      width={820}
      title={row.id ? '批量邮件通知' : '新建邮件通知'}
      onCancel={busy ? undefined : onClose}
      footer={
        editable ? (
          <Space>
            <Button disabled={busy} onClick={() => void save(false)}>
              保存草稿
            </Button>
            <Button loading={busy} onClick={() => void save(true)}>
              预览收件人与邮件
            </Button>
            <Button type="primary" disabled={busy || !preview} onClick={start}>
              开始发送
            </Button>
          </Space>
        ) : (
          <Button onClick={onClose}>关闭</Button>
        )
      }
    >
      {error && <Alert type="error" showIcon title={error} />}
      <Spin spinning={busy}>
        <Form
          form={form}
          layout="vertical"
          disabled={!editable || busy}
          onValuesChange={() => setPreview(undefined)}
        >
          <Form.Item
            name="subject"
            label="邮件主题"
            rules={[{ required: true, message: '请输入主题' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="body" label="正文" rules={[{ required: true, message: '请输入正文' }]}>
            <Input.TextArea rows={7} />
          </Form.Item>
          <Form.Item name="audience" label="收件范围">
            <Select
              options={[
                { value: 'all', label: '所有正常用户（不含管理员）' },
                { value: 'selected', label: '指定用户邮箱' },
              ]}
            />
          </Form.Item>
          {audience === 'selected' ? (
            <Form.Item
              name="emails"
              label="用户邮箱"
              rules={[{ required: true, message: '请输入已注册用户的邮箱' }]}
            >
              <Input.TextArea rows={3} placeholder="每行一个邮箱，也可用逗号分隔" />
            </Form.Item>
          ) : (
            <Form.Item name="search" label="筛选邮箱或名称（可选）">
              <Input allowClear />
            </Form.Item>
          )}
        </Form>
        {!editable && (
          <Descriptions
            size="small"
            column={3}
            items={[
              { key: 'total', label: '收件人', children: row.total },
              { key: 'sent', label: '已发送', children: row.sentCount },
              { key: 'failed', label: '失败', children: row.failedCount },
            ]}
          />
        )}
        {preview && (
          <>
            <Alert
              type="info"
              showIcon
              title={`共 ${preview.total} 位收件人`}
              description={
                <Typography.Text>
                  {(preview.sampleEmails as string[]).join('、')}
                  {preview.total > 20 ? ' …' : ''}
                </Typography.Text>
              }
            />
            <Typography.Title level={5}>{preview.subject}</Typography.Title>
            {preview.html ? (
              <iframe
                title="群发邮件预览"
                sandbox=""
                srcDoc={preview.html}
                style={{ width: '100%', height: 320, border: '1px solid var(--px-border)' }}
              />
            ) : (
              <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>
                {preview.text}
              </Typography.Paragraph>
            )}
          </>
        )}
      </Spin>
    </Modal>
  )
}
