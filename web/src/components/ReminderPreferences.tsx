import { Alert, App, Form, Switch } from 'antd'
import { errorText, rpc, useRpc } from '../api'
import type { Row } from '../api'

export default function ReminderPreferences() {
  const { data, error, loading, reload } = useRpc<Row>('access/preferences.get')
  const { message } = App.useApp()
  if (error) return <Alert type="error" title={error} />
  async function update(key: string, value: boolean) {
    try {
      await rpc('access/preferences.update', { [key]: value })
      reload()
    } catch (e) {
      message.error(errorText(e))
    }
  }
  return (
    <Form layout="horizontal" className="settings-form">
      <Form.Item
        label="套餐到期提醒"
        extra={!data?.expireEnabled ? '本站暂未开启到期邮件提醒' : undefined}
      >
        <Switch
          checked={data?.expireReminder !== false}
          loading={loading}
          onChange={(value) => void update('expireReminder', value)}
        />
      </Form.Item>
      <Form.Item
        label="流量耗尽提醒"
        extra={!data?.trafficEnabled ? '本站暂未开启流量邮件提醒' : undefined}
      >
        <Switch
          checked={data?.trafficReminder !== false}
          loading={loading}
          onChange={(value) => void update('trafficReminder', value)}
        />
      </Form.Item>
    </Form>
  )
}
