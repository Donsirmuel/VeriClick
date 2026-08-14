import { Outlet, Navigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useRef, useState } from 'react'

const SWIPE_THRESHOLD = 80

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const token = localStorage.getItem('token')
  const touchStart = useRef<{ x: number; y: number; at: number } | null>(null)

  if (!token) {
    return <Navigate to="/auth/login" replace />
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
    // A deliberate horizontal swipe, not a scroll or a tap.
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy) * 1.2) return
    if (dx > 0 && !sidebarOpen) {
      // Swiping right on open space opens the drawer.
      setSidebarOpen(true)
    } else if (dx < 0 && sidebarOpen) {
      // Swiping left closes it.
      setSidebarOpen(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-50
        transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 transition-transform duration-200 ease-in-out
      `}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
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
