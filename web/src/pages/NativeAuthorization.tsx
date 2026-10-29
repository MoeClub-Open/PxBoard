import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Spin } from 'antd'
import { Link, useNavigate } from 'react-router-dom'
import { api, errorText, useData } from '../api'
import type { User } from '../api'
import { Brand } from '../components/Brand'

export function NativeAuthorization({ user }: { user: User }) {
  const id = new URLSearchParams(window.location.search).get('request') || ''
  const { data, error, loading } = useData<{ name: string; approved: boolean }>(`/auth/native/${encodeURIComponent(id)}`)
  const [busy, setBusy] = useState(false)
  const [approved, setApproved] = useState(false)
  const [failure, setFailure] = useState('')
  async function approve() {
    setBusy(true)
    try {
      await api(`/auth/native/${encodeURIComponent(id)}/approve`, { method: 'POST', body: {} })
      setApproved(true)
    } catch (e) { setFailure(errorText(e)) }
    finally { setBusy(false) }
  }
  return <div className="auth-page"><div className="auth-brand"><Brand /></div><main className="auth-form">
    {loading ? <Spin /> : error || failure ? <Alert type="error" title={error || failure} /> : approved || data?.approved
      ? <Alert type="success" title="授权完成，请返回客户端" />
      : <><h1>登录 {data?.name}</h1><p>{user.email}</p><Button type="primary" block loading={busy} onClick={approve}>允许客户端登录</Button></>}
    <div className="auth-links"><Link to="/user">返回用户中心</Link></div>
  </main></div>
}

export function BrowserAuthorization({ onLogin }: { onLogin: () => Promise<void> }) {
  const navigate = useNavigate()
  const started = useRef(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (started.current) return
    started.current = true
    const token = window.location.hash.slice(1)
    window.history.replaceState(null, '', window.location.pathname)
    void api<{ redirectPath: string }>('/auth/browser-link/complete', { method: 'POST', body: { token } })
      .then(async result => { await onLogin(); navigate(result.redirectPath, { replace: true }) })
      .catch(e => setError(errorText(e)))
  }, [navigate, onLogin])
  return <div className="full-loading">{error ? <Alert type="error" title={error} action={<Link to="/login">重新登录</Link>} /> : <Spin />}</div>
}
