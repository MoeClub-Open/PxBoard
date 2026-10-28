import { App, Button, Form, Modal, Spin } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { api, errorText, type Resource } from '../api'
import { Fields, formValues, serialize } from './Fields'

export function ResourceSettings({
  settings,
  base,
  onSaved,
}: {
  settings: NonNullable<Resource['settings']>
  base: string
  onSaved: () => void
}) {
  const { message } = App.useApp()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()
  const endpoint = settings.endpoint.startsWith('/api/')
    ? settings.endpoint
    : base + settings.endpoint
  async function show() {
    setOpen(true)
    setLoading(true)
    form.resetFields()
    try {
      form.setFieldsValue(formValues(settings.fields, await api(endpoint)))
    } catch (error) {
      message.error(errorText(error))
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }
  async function save() {
    let values
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setSaving(true)
    try {
      await api(endpoint, { method: 'PATCH', body: serialize(settings.fields, values) })
      message.success('已保存')
      setOpen(false)
      onSaved()
    } catch (error) {
      message.error(errorText(error))
    } finally {
      setSaving(false)
    }
  }
  return (
    <>
      <Button icon={<SettingOutlined />} onClick={() => void show()}>
        {settings.title}
      </Button>
      <Modal
        title={settings.title}
        open={open}
        forceRender
        width={520}
        okText="保存"
        cancelText="取消"
        onCancel={() => setOpen(false)}
        onOk={() => void save()}
        confirmLoading={saving}
        okButtonProps={{ disabled: loading }}
      >
        <Spin spinning={loading}>
          <Form form={form} layout="vertical">
            <Fields fields={settings.fields} />
          </Form>
        </Spin>
      </Modal>
    </>
  )
}
