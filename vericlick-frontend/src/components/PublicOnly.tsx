import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

export default function PublicOnly({ children }: { children: ReactNode }) {
  if (localStorage.getItem('token')) {
    return <Navigate to="/app/dashboard" replace />
  }
  return <>{children}</>
}
