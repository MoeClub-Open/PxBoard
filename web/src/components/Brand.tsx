import { theme } from 'antd'
import { useBrand } from '../branding'

export function Brand({ compact = false }: { compact?: boolean }) {
  const { name, logoUrl } = useBrand()
  const { token } = theme.useToken()
  return (
    <div className="brand" style={{ color: token.colorText }}>
      {logoUrl ? (
        <img className="brand-logo" src={logoUrl} alt="" />
      ) : (
        <span className="brand-mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
      {!compact && <span>{name}</span>}
    </div>
  )
}
