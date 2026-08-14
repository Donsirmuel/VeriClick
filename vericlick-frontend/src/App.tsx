import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { queryClient } from './lib/queryClient'
import { ErrorBoundary } from './components/ErrorBoundary'
import { SEOHead } from './components/SEOHead'
import ScrollToTop from './components/ScrollToTop'
import { ChatWidget } from './components/chat/ChatWidget'
import PublicOnly from './components/PublicOnly'
import DashboardLayout from './components/layout/DashboardLayout'
import { PageLoader } from './components/ui/PageLoader'

const Landing = lazy(() => import('./pages/Landing'))

const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Pricing = lazy(() => import('./pages/Pricing'))
const Contact = lazy(() => import('./pages/Contact'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
const TermsOfService = lazy(() => import('./pages/TermsOfService'))
const Settings = lazy(() => import('./pages/Settings'))
const Billing = lazy(() => import('./pages/Billing'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Links = lazy(() => import('./pages/Links'))
const Domains = lazy(() => import('./pages/Domains'))
const IpRules = lazy(() => import('./pages/TrafficRules'))
const BlockedIPs = lazy(() => import('./pages/BlockedIPs'))
const Help = lazy(() => import('./pages/Help'))

function withSuspense(el: React.ReactNode) {
  return (
    <Suspense fallback={<PageLoader />}>
      {el}
    </Suspense>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SEOHead />
        <ScrollToTop />
        <Routes>
          {/* Landing is public even for signed-in users (nav adapts to show "Dashboard"). */}
          <Route path="/" element={withSuspense(<Landing />)} />
          <Route path="/pricing" element={withSuspense(<Pricing />)} />
          <Route path="/contact" element={withSuspense(<Contact />)} />
          <Route path="/privacy" element={withSuspense(<PrivacyPolicy />)} />
          <Route path="/terms" element={withSuspense(<TermsOfService />)} />
          <Route path="/auth/login" element={withSuspense(<PublicOnly><Login /></PublicOnly>)} />
          <Route path="/auth/register" element={withSuspense(<PublicOnly><Register /></PublicOnly>)} />
          <Route path="/auth/forgot-password" element={withSuspense(<PublicOnly><ForgotPassword /></PublicOnly>)} />
          <Route path="/auth/reset-password" element={withSuspense(<PublicOnly><ResetPassword /></PublicOnly>)} />
          <Route path="/app" element={<DashboardLayout />}>
            <Route index element={<Navigate to="/app/dashboard" replace />} />
            <Route path="dashboard" element={withSuspense(<ErrorBoundary><Dashboard /></ErrorBoundary>)} />
            <Route path="links" element={withSuspense(<ErrorBoundary><Links /></ErrorBoundary>)} />
            <Route path="domains" element={withSuspense(<ErrorBoundary><Domains /></ErrorBoundary>)} />
            <Route path="settings" element={withSuspense(<ErrorBoundary><Settings /></ErrorBoundary>)} />
            <Route path="billing" element={withSuspense(<ErrorBoundary><Billing /></ErrorBoundary>)} />
            <Route path="traffic-rules" element={withSuspense(<ErrorBoundary><IpRules /></ErrorBoundary>)} />
            <Route path="blocked-ips" element={withSuspense(<ErrorBoundary><BlockedIPs /></ErrorBoundary>)} />
            <Route path="help" element={withSuspense(<ErrorBoundary><Help /></ErrorBoundary>)} />
          </Route>
          <Route path="*" element={withSuspense(<NotFound />)} />
        </Routes>
        <ChatWidget />
      </BrowserRouter>
      <Toaster position="top-right" />
    </QueryClientProvider>
  )
}

export default App
