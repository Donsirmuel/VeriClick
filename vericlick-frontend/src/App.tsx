import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { queryClient } from './lib/queryClient'

import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'
import DashboardLayout from './components/layout/DashboardLayout'
import Dashboard from './pages/Dashboard'
import Links from './pages/Links'
import Domains from './pages/Domains'

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth/login" element={<Login />} />
          <Route path="/auth/register" element={<Register />} />
          <Route path="/app" element={<DashboardLayout />}>
            <Route index element={<Navigate to="/app/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="links" element={<Links />} />
            <Route path="domains" element={<Domains />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  )
}

export default App
