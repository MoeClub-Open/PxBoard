import { Route } from 'react-router-dom'
import {
  DashboardOutlined,
  FileTextOutlined,
  ShareAltOutlined,
  ShopOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import PortalLayout, {
  serviceNavigation,
  serviceRoutes,
  subscriptionNavigation,
  unavailable,
  usePortalFeatures,
  type PortalProps,
} from './Portal'
import PortalOverview from './PortalOverview'
import { PortalOrders, PortalPlans, PortalWallet } from './PortalCommerce'
import PortalReferrals from './PortalReferrals'

export default function BusinessPortal(props: PortalProps) {
  const features = usePortalFeatures()
  const navigation = [
    { key: '/user', label: '我的服务', icon: <DashboardOutlined /> },
    ...(features.commerce
      ? [{ key: '/user/plans', label: '选购套餐', icon: <ShopOutlined /> }]
      : []),
    ...subscriptionNavigation(features),
    ...(features.commerce
      ? [
          { key: '/user/orders', label: '我的订单', icon: <FileTextOutlined /> },
          { key: '/user/wallet', label: '账户余额', icon: <WalletOutlined /> },
        ]
      : []),
    ...(features.affiliate
      ? [{ key: '/user/referrals', label: '推广返佣', icon: <ShareAltOutlined /> }]
      : []),
    ...serviceNavigation(features),
  ]
  return (
    <PortalLayout {...props} navigation={navigation}>
      <Route index element={<PortalOverview business={features.commerce} />} />
      <Route path="plans" element={features.commerce ? <PortalPlans /> : unavailable} />
      <Route path="orders" element={features.commerce ? <PortalOrders /> : unavailable} />
      <Route path="wallet" element={features.commerce ? <PortalWallet /> : unavailable} />
      <Route path="referrals" element={features.affiliate ? <PortalReferrals /> : unavailable} />
      {serviceRoutes(features)}
    </PortalLayout>
  )
}
