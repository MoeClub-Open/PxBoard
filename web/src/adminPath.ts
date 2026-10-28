import type { User } from './api'

export const adminRoot = (user?: User | null) =>
  user?.role === 'admin' ? user.adminPath || '/admin' : '/admin'

export function adminURL(path: string, user?: User | null) {
  return adminRoot(user) + path.slice('/admin'.length)
}

export function loginDestination(path: string, user: User) {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return '/user'
  const pathname = path.split(/[?#]/, 1)[0]
  const root = adminRoot(user)
  if (pathname === '/user' || pathname.startsWith('/user/')) return path
  if (user.role === 'admin' && (pathname === root || pathname.startsWith(root + '/'))) return path
  return '/user'
}
