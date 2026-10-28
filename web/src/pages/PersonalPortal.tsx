import { lazy, Suspense } from 'react'
import { Route } from 'react-router-dom'
import { Spin } from 'antd'
import { DashboardOutlined, ShareAltOutlined } from '@ant-design/icons'
import PortalLayout, {
  serviceNavigation,
  serviceRoutes,
  subscriptionNavigation,
  unavailable,
  usePortalFeatures,
  type PortalProps,
} from './Portal'
import PortalOverview from './PortalOverview'

const PortalReferrals = lazy(() => import('./PortalReferrals'))

export default function PersonalPortal(props: PortalProps) {
  const features = usePortalFeatures()
  const navigation = [
    { key: '/user', label: '我的服务', icon: <DashboardOutlined /> },
    ...subscriptionNavigation(features),
    ...(features.affiliate
      ? [{ key: '/user/referrals', label: '推广返佣', icon: <ShareAltOutlined /> }]
      : []),
    ...serviceNavigation(features),
  ]
  return (
    <PortalLayout {...props} navigation={navigation}>
      <Route index element={<PortalOverview business={false} />} />
      <Route path="plans" element={unavailable} />
      <Route path="orders" element={unavailable} />
      <Route path="wallet" element={unavailable} />
      <Route
        path="referrals"
        element={
          features.affiliate ? (
            <Suspense fallback={<Spin />}>
              <PortalReferrals />
            </Suspense>
          ) : (
            unavailable
          )
        }
      />
      {serviceRoutes(features)}
    </PortalLayout>
  )
}
