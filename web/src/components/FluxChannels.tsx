import { useRef, useState, type ReactNode } from 'react'
import {
  App,
  Button,
  Collapse,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd'
import { DeleteOutlined, KeyOutlined, PlusOutlined } from '@ant-design/icons'
import type { Row } from '../api'

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function randomObfsKey(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes).slice(0, 32)
}

async function generateRealityKeypair(): Promise<{ privateKey: string; publicKey: string }> {
  const pair = (await crypto.subtle.generateKey({ name: 'X25519' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  if (!privateJwk.d || !privateJwk.x) throw new Error('浏览器无法导出 X25519 密钥')
  return { privateKey: privateJwk.d, publicKey: privateJwk.x }
}

function textOf(row: Row, ...keys: string[]): string {
  for (const key of keys) {
    const val = row[key]
    if (val !== undefined && val !== null && String(val) !== '') {
      return String(val)
    }
  }
  return ''
}

function realityTextOf(row: Row, camel: string, snake: string): string {
  const direct = textOf(row, camel, snake)
  if (direct) return direct
  const nested = row.reality
  if (nested && typeof nested === 'object') {
    return textOf(nested as Row, camel, snake)
  }
  return ''
}

function formatHeaders(raw: unknown): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ''
  return Object.entries(raw as Record<string, unknown>)
    .map(([k, v]) => k + ': ' + String(v ?? ''))
    .join('\n')
}

function parseHeaders(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim()
    if (key) result[key] = val
  }
  return result
}

const securityLabels: Record<string, string> = {
  obfs: '加密',
  tls: 'TLS',
  reality: 'REALITY',
}

export function FluxChannels({
  value = [],
  onChange,
}: {
  value?: Row[]
  onChange?: (value: Row[]) => void
}) {
  const { message } = App.useApp()
  const [headerDrafts, setHeaderDrafts] = useState<Record<string, string>>({})
  const rowKeysRef = useRef<WeakMap<object, string>>(new WeakMap())

  const keyFor = (row: Row, index: number): string => {
    let key = rowKeysRef.current.get(row)
    if (!key) {
      key = 'flux-row-' + String(index) + '-' + randomHex(4)
      rowKeysRef.current.set(row, key)
    }
    return key
  }

  const [open, setOpen] = useState<string[]>(() => {
    if (
      value.length > 0 &&
      (value.length === 1 || !textOf(value[0], 'connectHost', 'connect_host', 'server'))
    ) {
      return [keyFor(value[0], 0)]
    }
    return []
  })

  const primaryHost =
    value
      .filter((row) => row.enabled !== false && (textOf(row, 'role') || 'primary') !== 'backup')
      .map((row) => textOf(row, 'connectHost', 'connect_host', 'server'))
      .find(Boolean) ||
    value
      .filter((row) => row.enabled !== false)
      .map((row) => textOf(row, 'connectHost', 'connect_host', 'server'))
      .find(Boolean) ||
    ''

  const patchRow = (index: number, patch: Record<string, unknown>, cleanupKeys: string[] = []) => {
    if (!onChange) return
    const nextRows = value.map((row, i) => {
      if (i !== index) return row
      const prevKey = keyFor(row, index)
      const updated: Row = { ...row }
      for (const obsolete of cleanupKeys) delete updated[obsolete]
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '') delete updated[k]
        else updated[k] = v
      }
      rowKeysRef.current.set(updated, prevKey)
      return updated
    })
    onChange(nextRows)
  }

  const field = (label: string, element: ReactNode) => (
    <label style={{ display: 'grid', gap: 4 }}>
      <span>{label}</span>
      {element}
    </label>
  )

  const grid = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 12,
  } as const

  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      {value.length > 0 && (
        <Collapse
          activeKey={open}
          onChange={(keys) => setOpen((Array.isArray(keys) ? keys : [keys]).map(String))}
          items={value.map((channel, index) => {
            const rowKey = keyFor(channel, index)
            const id = textOf(channel, 'id')
            const enabled = channel.enabled !== false
            const transport = textOf(channel, 'transport') || 'tcp'
            const httpMode = textOf(channel, 'httpMode', 'http_mode') || 'ws'
            const security = textOf(channel, 'security')
            const certMode = textOf(channel, 'certMode', 'cert_mode') || 'inherit'
            const portsSummary =
              textOf(channel, 'connectPorts', 'connect_ports', 'ports') || '未填端口'
            const hostSummary = textOf(channel, 'connectHost', 'connect_host', 'server')
            const displayHost = hostSummary || primaryHost
            const role = textOf(channel, 'role') || 'primary'
            const headersObj = channel.httpHeaders ?? channel.http_headers

            return {
              key: rowKey,
              label: (
                <Space wrap size={6}>
                  <strong>{id || '未命名通道'}</strong>
                  <Tag>{transport.toUpperCase()}</Tag>
                  {security && <Tag>{securityLabels[security] || security}</Tag>}
                  {role === 'backup' && <Tag color="gold">热备</Tag>}
                  {!enabled && <Tag color="default">已停用</Tag>}
                  <Typography.Text type="secondary">
                    {displayHost ? displayHost + ':' + portsSummary : portsSummary}
                  </Typography.Text>
                </Space>
              ),
              extra: (
                <Popconfirm
                  title="删除此通道？"
                  okText="删除"
                  cancelText="取消"
                  onConfirm={() => onChange?.(value.filter((_, i) => i !== index))}
                >
                  <Button
                    type="text"
                    danger
                    aria-label={'删除通道' + id}
                    icon={<DeleteOutlined />}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Popconfirm>
              ),
              children: (
                <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                  <div style={grid}>
                    {field(
                      '启用通道',
                      <div>
                        <Switch
                          checked={enabled}
                          onChange={(checked) => patchRow(index, { enabled: checked })}
                        />
                      </div>,
                    )}
                    {field(
                      '通道标识',
                      <Input
                        placeholder="例如 tcp-v4"
                        value={id}
                        onChange={(e) => patchRow(index, { id: e.target.value })}
                      />,
                    )}
                    {field(
                      '调度角色',
                      <Select
                        value={role}
                        onChange={(v) => patchRow(index, { role: v })}
                        options={[
                          { label: '主用（参与负载均衡）', value: 'primary' },
                          { label: '热备（仅容灾切换）', value: 'backup' },
                        ]}
                      />,
                    )}
                    {field(
                      '权重',
                      <InputNumber
                        min={1}
                        max={100}
                        precision={0}
                        value={typeof channel.weight === 'number' ? channel.weight : 100}
                        onChange={(v) => patchRow(index, { weight: v ?? 100 })}
                        style={{ width: '100%' }}
                      />,
                    )}
                  </div>

                  <div style={grid}>
                    {field(
                      '连接地址',
                      <Input
                        placeholder={
                          index === 0 || !primaryHost
                            ? '填写连接域名或 IP'
                            : '留空沿用 ' + primaryHost
                        }
                        value={hostSummary}
                        onChange={(e) =>
                          patchRow(index, { connectHost: e.target.value }, [
                            'connect_host',
                            'server',
                          ])
                        }
                      />,
                    )}
                    {field(
                      '连接端口 / 端口段',
                      <Input
                        placeholder="如 25566 或 20000-20020"
                        value={textOf(channel, 'connectPorts', 'connect_ports', 'ports')}
                        onChange={(e) =>
                          patchRow(index, { connectPorts: e.target.value }, [
                            'connect_ports',
                            'ports',
                          ])
                        }
                      />,
                    )}
                    {field(
                      '地址栈偏好',
                      <Select
                        value={textOf(channel, 'ipVersion', 'ip_version') || 'auto'}
                        onChange={(v) => patchRow(index, { ipVersion: v }, ['ip_version'])}
                        options={[
                          { label: '双栈自动', value: 'auto' },
                          { label: '仅 IPv4', value: 'ipv4' },
                          { label: '仅 IPv6', value: 'ipv6' },
                        ]}
                      />,
                    )}
                    {field(
                      '本地监听地址',
                      <Input
                        placeholder="留空双栈监听"
                        value={textOf(channel, 'listenIp', 'listen_ip')}
                        onChange={(e) =>
                          patchRow(index, { listenIp: e.target.value }, ['listen_ip'])
                        }
                      />,
                    )}
                    {field(
                      '本地监听端口',
                      <Input
                        placeholder="留空与连接端口一致"
                        value={textOf(channel, 'listenPorts', 'listen_ports')}
                        onChange={(e) =>
                          patchRow(index, { listenPorts: e.target.value }, ['listen_ports'])
                        }
                      />,
                    )}
                  </div>

                  <div style={grid}>
                    {field(
                      '传输方式',
                      <Select
                        value={transport}
                        onChange={(v) => {
                          const nextPatch: Record<string, unknown> = { transport: v }
                          const cleanup = ['http_mode', 'http_host', 'http_path', 'http_headers']
                          if (v !== 'http') {
                            cleanup.push('httpMode', 'httpHost', 'httpPath', 'httpHeaders')
                          } else if (!textOf(channel, 'httpMode', 'http_mode')) {
                            nextPatch.httpMode = 'ws'
                          }
                          if (v === 'udp' && certMode === 'origin_plain') {
                            nextPatch.certMode = 'inherit'
                            cleanup.push('cert_mode')
                          }
                          patchRow(index, nextPatch, cleanup)
                        }}
                        options={[
                          { label: 'TCP', value: 'tcp' },
                          { label: 'UDP (QUIC)', value: 'udp' },
                          { label: 'HTTP / 反代', value: 'http' },
                        ]}
                      />,
                    )}
                    {transport === 'http' &&
                      field(
                        'HTTP 封装模式',
                        <Select
                          value={httpMode}
                          onChange={(v) => patchRow(index, { httpMode: v }, ['http_mode'])}
                          options={[
                            { label: 'WebSocket', value: 'ws' },
                            { label: 'HTTP Upgrade', value: 'httpupgrade' },
                            { label: 'HTTP/2', value: 'h2' },
                          ]}
                        />,
                      )}
                    {transport === 'http' &&
                      field(
                        '请求 Host',
                        <Input
                          placeholder="留空跟随连接地址"
                          value={textOf(channel, 'httpHost', 'http_host')}
                          onChange={(e) =>
                            patchRow(index, { httpHost: e.target.value }, ['http_host'])
                          }
                        />,
                      )}
                    {transport === 'http' &&
                      field(
                        '请求路径',
                        <Input
                          placeholder="/"
                          value={textOf(channel, 'httpPath', 'http_path')}
                          onChange={(e) =>
                            patchRow(index, { httpPath: e.target.value }, ['http_path'])
                          }
                        />,
                      )}
                    {field(
                      '安全方式',
                      <Select
                        value={security || 'inherit'}
                        onChange={(v) => {
                          const mode = v === 'inherit' ? undefined : v
                          const nextPatch: Record<string, unknown> = { security: mode }
                          if (mode === 'tls' && !textOf(channel, 'certMode', 'cert_mode')) {
                            nextPatch.certMode = 'inherit'
                          }
                          if (
                            mode === 'reality' &&
                            !textOf(channel, 'sni') &&
                            !realityTextOf(channel, 'serverName', 'server_name')
                          ) {
                            nextPatch.sni = 'huggingface.co'
                          }
                          patchRow(index, nextPatch)
                        }}
                        options={[
                          { label: '跟随节点默认', value: 'inherit' },
                          { label: '对称加密', value: 'obfs' },
                          { label: 'TLS 证书', value: 'tls' },
                          { label: 'REALITY', value: 'reality' },
                        ]}
                      />,
                    )}
                  </div>

                  {transport === 'http' &&
                    field(
                      '自定义请求头（每行 Header: Value）',
                      <Input.TextArea
                        autoSize={{ minRows: 2, maxRows: 5 }}
                        placeholder="X-Custom-Header: value"
                        value={headerDrafts[rowKey] ?? formatHeaders(headersObj)}
                        onChange={(e) => {
                          const raw = e.target.value
                          setHeaderDrafts((prev) => ({ ...prev, [rowKey]: raw }))
                          const parsed = parseHeaders(raw)
                          patchRow(
                            index,
                            { httpHeaders: Object.keys(parsed).length ? parsed : undefined },
                            ['http_headers'],
                          )
                        }}
                        onBlur={() =>
                          setHeaderDrafts((prev) => {
                            const next = { ...prev }
                            delete next[rowKey]
                            return next
                          })
                        }
                      />,
                    )}

                  {security === 'reality' && (
                    <Space orientation="vertical" size="small" style={{ width: '100%' }}>
                      <div>
                        <Button
                          size="small"
                          icon={<KeyOutlined />}
                          onClick={async () => {
                            try {
                              const pair = await generateRealityKeypair()
                              const existingShortId = realityTextOf(channel, 'shortId', 'short_id')
                              patchRow(
                                index,
                                {
                                  privateKey: pair.privateKey,
                                  publicKey: pair.publicKey,
                                  shortId: existingShortId || randomHex(4),
                                },
                                ['private_key', 'public_key', 'short_id', 'reality'],
                              )
                            } catch (error) {
                              void message.error(
                                error instanceof Error ? error.message : '生成密钥失败',
                              )
                            }
                          }}
                        >
                          生成密钥对
                        </Button>
                      </div>
                      <div style={grid}>
                        {field(
                          '借用域名（SNI）',
                          <Input
                            placeholder="huggingface.co"
                            value={
                              textOf(channel, 'sni') ||
                              realityTextOf(channel, 'serverName', 'server_name')
                            }
                            onChange={(e) =>
                              patchRow(index, { sni: e.target.value }, ['server_name'])
                            }
                          />,
                        )}
                        {field(
                          '回源目标地址',
                          <Input
                            placeholder="留空默认使用借用域名:443"
                            value={realityTextOf(channel, 'dest', 'dest')}
                            onChange={(e) => patchRow(index, { dest: e.target.value })}
                          />,
                        )}
                        {field(
                          'Short ID',
                          <Input
                            placeholder="偶数位十六进制"
                            value={realityTextOf(channel, 'shortId', 'short_id')}
                            onChange={(e) =>
                              patchRow(index, { shortId: e.target.value }, ['short_id'])
                            }
                          />,
                        )}
                        {field(
                          '客户端指纹',
                          <Select
                            value={textOf(channel, 'fingerprint', 'clientFingerprint') || 'inherit'}
                            onChange={(v) =>
                              patchRow(index, { fingerprint: v === 'inherit' ? undefined : v }, [
                                'clientFingerprint',
                                'client_fingerprint',
                              ])
                            }
                            options={[
                              { label: '跟随节点默认', value: 'inherit' },
                              { label: 'Chrome', value: 'chrome' },
                              { label: 'Firefox', value: 'firefox' },
                              { label: 'Safari', value: 'safari' },
                              { label: 'iOS', value: 'ios' },
                              { label: 'Edge', value: 'edge' },
                              { label: '随机', value: 'random' },
                            ]}
                          />,
                        )}
                      </div>
                      <div style={grid}>
                        {field(
                          'REALITY 私钥',
                          <Input.Password
                            autoComplete="new-password"
                            placeholder="留空继承节点或保存时自动生成"
                            value={realityTextOf(channel, 'privateKey', 'private_key')}
                            onChange={(e) =>
                              patchRow(index, { privateKey: e.target.value }, ['private_key'])
                            }
                          />,
                        )}
                        {field(
                          'REALITY 公钥',
                          <Input
                            placeholder="留空保存时自动推导"
                            value={realityTextOf(channel, 'publicKey', 'public_key')}
                            onChange={(e) =>
                              patchRow(index, { publicKey: e.target.value }, ['public_key'])
                            }
                          />,
                        )}
                      </div>
                    </Space>
                  )}

                  {security === 'tls' && (
                    <div style={grid}>
                      {field(
                        '服务端证书方式',
                        <Select
                          value={certMode}
                          onChange={(v) => patchRow(index, { certMode: v }, ['cert_mode'])}
                          options={[
                            { label: '复用节点证书', value: 'inherit' },
                            { label: '独立本地文件', value: 'file' },
                            {
                              label: '前置反代终止 TLS（本地明文）',
                              value: 'origin_plain',
                              disabled: transport === 'udp',
                            },
                          ]}
                        />,
                      )}
                      {field(
                        'TLS 域名（SNI）',
                        <Input
                          placeholder="留空跟随连接地址"
                          value={textOf(channel, 'sni')}
                          onChange={(e) => patchRow(index, { sni: e.target.value })}
                        />,
                      )}
                      {certMode === 'file' &&
                        field(
                          '证书文件路径',
                          <Input
                            placeholder="/etc/ssl/cert.pem"
                            value={textOf(channel, 'certPath', 'cert_path')}
                            onChange={(e) =>
                              patchRow(index, { certPath: e.target.value }, ['cert_path'])
                            }
                          />,
                        )}
                      {certMode === 'file' &&
                        field(
                          '私钥文件路径',
                          <Input
                            placeholder="/etc/ssl/key.pem"
                            value={textOf(channel, 'keyPath', 'key_path')}
                            onChange={(e) =>
                              patchRow(index, { keyPath: e.target.value }, ['key_path'])
                            }
                          />,
                        )}
                      {field(
                        '跳过客户端证书校验',
                        <div>
                          <Switch
                            checked={Boolean(channel.insecure ?? channel.allow_insecure)}
                            onChange={(checked) =>
                              patchRow(index, { insecure: checked || undefined }, [
                                'allow_insecure',
                              ])
                            }
                          />
                        </div>,
                      )}
                    </div>
                  )}

                  {security === 'obfs' &&
                    field(
                      '通道加密密钥',
                      <Space.Compact style={{ width: '100%' }}>
                        <Input
                          placeholder="留空继承节点或保存时自动生成"
                          value={textOf(channel, 'obfsKey', 'obfs_key')}
                          onChange={(e) =>
                            patchRow(index, { obfsKey: e.target.value }, ['obfs_key'])
                          }
                        />
                        <Button
                          onClick={() =>
                            patchRow(index, { obfsKey: randomObfsKey() }, ['obfs_key'])
                          }
                        >
                          随机生成
                        </Button>
                      </Space.Compact>,
                    )}
                </Space>
              ),
            }
          })}
        />
      )}
      <Button
        icon={<PlusOutlined />}
        onClick={() => {
          const row: Row = {
            id: 'ch-' + randomHex(2),
            enabled: true,
            transport: 'tcp',
            ipVersion: 'auto',
            role: 'primary',
            weight: 100,
          }
          const rowKey = keyFor(row, value.length)
          onChange?.([...value, row])
          setOpen((keys) => [...keys, rowKey])
        }}
      >
        添加通道
      </Button>
    </Space>
  )
}
