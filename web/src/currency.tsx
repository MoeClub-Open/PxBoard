import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from './api'
import { initialPublicSite } from './publicSite'

type Currency = { currencyName: string; currencySymbol: string }
const defaults: Currency = { currencyName: '单位', currencySymbol: '' }
const CurrencyContext = createContext<Currency>(defaults)

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<Currency>(
    () => initialPublicSite()?.site.data?.currency || defaults,
  )
  const reload = useCallback(async () => {
    try {
      setCurrency(await api<Currency>('/extensions/commerce/public/currency'))
    } catch {}
  }, [])
  useEffect(() => {
    void reload()
    const refresh = () => void reload()
    window.addEventListener('px:configuration-changed', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('px:configuration-changed', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [reload])
  return <CurrencyContext.Provider value={currency}>{children}</CurrencyContext.Provider>
}

export function useCurrency() {
  const currency = useContext(CurrencyContext)
  const money = (amount: number) =>
    `${currency.currencySymbol} ${(Number(amount || 0) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return { ...currency, money }
}
