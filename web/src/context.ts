import { createContext, useContext } from 'react'
import type { Plugin, User } from './api'
export const SessionContext = createContext<{
  me: User
  plugins: Plugin[]
  refresh: () => Promise<void>
}>(null!)
export const useSession = () => useContext(SessionContext)
