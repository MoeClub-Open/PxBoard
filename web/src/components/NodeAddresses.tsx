import { useState } from 'react'
import { App, Button, Form, Modal, Space, Table, Tag } from 'antd'
import type { Field, Resource, Row } from '../api'
import { api, configurationChanged, errorText } from '../api'
import { Fields, formValues, serialize } from './Fields'

const inheritedKeys = [
  'machineId',
  'passwordMode',
  'minimumAccessLevel',
  'allowedAccountIds',
  'engine',
  'protocol',
  'serverPort',
  'tls',
  'tlsMode',
  'serverName',
  'tlsSettings',
  'realitySettings',
  'certConfig',
  'transport',
  'transportSettings',
  'protocolOptions',
]

export default function NodeAddresses({
  parent,
  nodes,
  resource,
  endpoint,
  onClose,
  onChange,
  onEditParent,
}: {
  parent: Row
  nodes: Row[]
  resource: Resource
  endpoint: string
  onClose: () => void
  onChange: () => void
  onEditParent: () => void
}) {
  const { message, modal } = App.useApp()
  const [editor, setEditor] = useState<Row | null>(null)
  const [busy, setBusy] = useState(false)
  const [form] = Form.useForm()
  const fields: Field[] = (resource.fields || []).filter((field) =>
    ['name', 'host', 'port', 'groups', 'trafficRate', 'visible'].includes(field.key),
  )
  const children = nodes.filter((node) => node.parentId === parent.id && !node.enabled)
  function openEditor(row?: Row) {
    form.resetFields()
    form.setFieldsValue(
      formValues(
        fields,
        row || {
          port: parent.port,
          groups: parent.groups,
          trafficRate: parent.trafficRate,
          visible: true,
        },
      ),
    )
    setEditor(row || {})
  }
  async function save() {
    let values: Row
    try {
      values = serialize(fields, await form.validateFields())
    } catch {
      return
    }
    const creating = !editor?.id
    const inherited = Object.fromEntries(
      inheritedKeys.filter((key) => parent[key] !== undefined).map((key) => [key, parent[key]]),
    )
    setBusy(true)
    try {
      await api(creating ? endpoint : `${endpoint}/${encodeURIComponent(String(editor!.id))}`, {
        method: creating ? 'POST' : 'PATCH',
        body: creating ? { ...inherited, ...values, parentId: parent.id, enabled: false } : values,
      })
      configurationChanged()
      message.success('已保存')
      setEditor(null)
      onChange()
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  function remove(row: Row) {
    modal.confirm({
      title: '删除连接地址？',
      content: '该地址将从订阅中移除，已有客户端需要更新订阅。',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api(`${endpoint}/${encodeURIComponent(String(row.id))}`, { method: 'DELETE' })
          configurationChanged()
          message.success('已删除')
          onChange()
        } catch (e) {
          message.error(errorText(e))
        }
      },
    })
  }
  return (
    <>
      <Modal
        open
        title={`${parent.name} · 连接地址`}
        onCancel={onClose}
        footer={<Button onClick={onClose}>关闭</Button>}
        width={780}
      >
        <div className="table-toolbar">
          <span>共 {children.length + 1} 个地址</span>
          <Button type="primary" onClick={() => openEditor()}>
            添加地址
          </Button>
        </div>
        <Table<Row>
          rowKey="id"
          size="middle"
          pagination={false}
          scroll={{ x: 'max-content' }}
          dataSource={[parent, ...children]}
          columns={[
            {
              title: '名称',
              dataIndex: 'name',
              render: (value: string, row: Row) => (
                <Space>
                  {value}
                  {row.id === parent.id && <Tag>主地址</Tag>}
                </Space>
              ),
            },
            { title: '连接地址', dataIndex: 'host' },
            { title: '端口', dataIndex: 'port' },
            {
              title: '订阅显示',
              dataIndex: 'visible',
              render: (value: boolean) => (value !== false ? '是' : '否'),
            },
            {
              title: '操作',
              render: (_: unknown, row: Row) =>
                row.id === parent.id ? (
                  <Button type="link" onClick={onEditParent}>
                    编辑
                  </Button>
                ) : (
                  <Space>
                    <Button type="link" onClick={() => openEditor(row)}>
                      编辑
                    </Button>
                    <Button type="link" danger onClick={() => remove(row)}>
                      删除
                    </Button>
                  </Space>
                ),
            },
          ]}
        />
      </Modal>
      <Modal
        open={editor !== null}
        title={editor?.id ? '编辑连接地址' : '添加连接地址'}
        onCancel={() => setEditor(null)}
        onOk={save}
        confirmLoading={busy}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false} className="editor-form">
          <Fields fields={fields} row={editor || undefined} />
        </Form>
      </Modal>
    </>
  )
}
