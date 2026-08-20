import { Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchWorkspace } from '@/api/workspace'
import { ProductTour, hasCompletedTour } from '@/components/ProductTour'

const SWIPE_THRESHOLD = 80

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tourDone, setTourDone] = useState(() => hasCompletedTour())
  const token = localStorage.getItem('token')
  const touchStart = useRef<{ x: number; y: number; at: number } | null>(null)
  const location = useLocation()
  const navigate = useNavigate()

  const { data: workspace } = useQuery({
    queryKey: ['workspace'],
    queryFn: fetchWorkspace,
    enabled: !!token,
  })

  if (!token) {
    return <Navigate to="/auth/login" replace />
  }

  if (workspace && !workspace.onboardingComplete && !tourDone && location.pathname !== '/app/onboarding') {
    return (
      <ProductTour onComplete={() => {
        setTourDone(true)
        navigate('/app/onboarding')
      }} />
    )
  }

  if (workspace && !workspace.onboardingComplete && location.pathname !== '/app/onboarding') {
    return <Navigate to="/app/onboarding" replace />
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY, at: Date.now() }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy) * 1.2) return
    if (dx > 0 && !sidebarOpen) {
      setSidebarOpen(true)
    } else if (dx < 0 && sidebarOpen) {
      setSidebarOpen(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={`
        fixed lg:static inset-y-0 left-0 z-50
        transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 transition-transform duration-200 ease-in-out
      `}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <TopBar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
