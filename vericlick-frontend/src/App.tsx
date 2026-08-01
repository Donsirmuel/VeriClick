import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { queryClient } from './lib/queryClient'
import { ErrorBoundary } from './components/ErrorBoundary'
import { SEOHead } from './components/SEOHead'
import DashboardLayout from './components/layout/DashboardLayout'

const Landing = lazy(() => import('./pages/Landing'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Settings = lazy(() => import('./pages/Settings'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Links = lazy(() => import('./pages/Links'))
const Domains = lazy(() => import('./pages/Domains'))
const IpRules = lazy(() => import('./pages/IpRules'))
const BlockedIPs = lazy(() => import('./pages/BlockedIPs'))

function withSuspense(el: React.ReactNode) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-muted">Loading…</div>}>
      {el}
    </Suspense>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SEOHead />
        <Routes>
          <Route path="/" element={withSuspense(<Landing />)} />
          <Route path="/auth/login" element={withSuspense(<Login />)} />
          <Route path="/auth/register" element={withSuspense(<Register />)} />
          <Route path="/auth/forgot-password" element={withSuspense(<ForgotPassword />)} />
          <Route path="/auth/reset-password" element={withSuspense(<ResetPassword />)} />
          <Route path="/app" element={<DashboardLayout />}>
            <Route index element={<Navigate to="/app/dashboard" replace />} />
            <Route path="dashboard" element={withSuspense(<ErrorBoundary><Dashboard /></ErrorBoundary>)} />
            <Route path="links" element={withSuspense(<ErrorBoundary><Links /></ErrorBoundary>)} />
            <Route path="domains" element={withSuspense(<ErrorBoundary><Domains /></ErrorBoundary>)} />
            <Route path="settings" element={withSuspense(<ErrorBoundary><Settings /></ErrorBoundary>)} />
            <Route path="ip-rules" element={withSuspense(<ErrorBoundary><IpRules /></ErrorBoundary>)} />
            <Route path="blocked-ips" element={withSuspense(<ErrorBoundary><BlockedIPs /></ErrorBoundary>)} />
          </Route>
          <Route path="*" element={withSuspense(<NotFound />)} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" />
    </QueryClientProvider>
  )
}

export default App
