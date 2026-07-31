import { WorkspaceProvider } from '@/contexts/WorkspaceContext'
import { ProtectedRoute } from './ProtectedRoute'

/** Mounts organization data only after navigation enters the authenticated app. */
export function AuthenticatedAppLayout() {
  return <WorkspaceProvider><ProtectedRoute /></WorkspaceProvider>
}
