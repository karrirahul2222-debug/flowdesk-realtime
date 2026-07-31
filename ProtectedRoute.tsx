import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { LoadingScreen } from './LoadingScreen'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const workspace = useWorkspace()
  const location = useLocation()

  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (workspace.loading) return <LoadingScreen message="Loading your workspace…" />
  if (workspace.memberships.length === 0 && location.pathname !== '/workspace-setup') {
    return <Navigate to="/workspace-setup" replace />
  }
  return <Outlet />
}
