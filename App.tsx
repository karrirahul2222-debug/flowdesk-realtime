import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import { LoginPage } from '@/pages/LoginPage'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { LoadingScreen } from '@/components/LoadingScreen'
import { PublicAuthLayout } from '@/components/PublicAuthLayout'
import { AuthenticatedAppLayout } from '@/components/AuthenticatedAppLayout'

const WorkspaceSetupPage = lazy(() => import('@/pages/WorkspaceSetupPage').then(({ WorkspaceSetupPage }) => ({ default: WorkspaceSetupPage })))
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then(({ DashboardPage }) => ({ default: DashboardPage })))
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage').then(({ ProjectsPage }) => ({ default: ProjectsPage })))
const ProjectDetailPage = lazy(() => import('@/pages/ProjectDetailPage').then(({ ProjectDetailPage }) => ({ default: ProjectDetailPage })))
const BoardPage = lazy(() => import('@/pages/BoardPage').then(({ BoardPage }) => ({ default: BoardPage })))
const BacklogPage = lazy(() => import('@/pages/BacklogPage').then(({ BacklogPage }) => ({ default: BacklogPage })))
const MyWorkPage = lazy(() => import('@/pages/MyWorkPage').then(({ MyWorkPage }) => ({ default: MyWorkPage })))
const WorkspaceChatPage = lazy(() => import('@/pages/WorkspaceChatPage').then(({ WorkspaceChatPage }) => ({ default: WorkspaceChatPage })))
const ApprovalsPage = lazy(() => import('@/pages/ApprovalsPage').then(({ ApprovalsPage }) => ({ default: ApprovalsPage })))
const PeoplePage = lazy(() => import('@/pages/PeoplePage').then(({ PeoplePage }) => ({ default: PeoplePage })))
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then(({ ReportsPage }) => ({ default: ReportsPage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then(({ SettingsPage }) => ({ default: SettingsPage })))

function AppPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingScreen message="Loading workspace…" />}>{children}</Suspense>
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicAuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>
      <Route element={<AuthenticatedAppLayout />}>
        <Route path="/workspace-setup" element={<AppPage><WorkspaceSetupPage /></AppPage>} />
        <Route element={<AppLayout />}>
          <Route index element={<AppPage><DashboardPage /></AppPage>} />
          <Route path="projects" element={<AppPage><ProjectsPage /></AppPage>} />
          <Route path="projects/:projectId" element={<AppPage><ProjectDetailPage /></AppPage>} />
          <Route path="board" element={<AppPage><BoardPage /></AppPage>} />
          <Route path="backlog" element={<AppPage><BacklogPage /></AppPage>} />
          <Route path="my-work" element={<AppPage><MyWorkPage /></AppPage>} />
          <Route path="chat" element={<AppPage><WorkspaceChatPage /></AppPage>} />
          <Route path="approvals" element={<AppPage><ApprovalsPage /></AppPage>} />
          <Route path="people" element={<AppPage><PeoplePage /></AppPage>} />
          <Route path="reports" element={<AppPage><ReportsPage /></AppPage>} />
          <Route path="settings" element={<AppPage><SettingsPage /></AppPage>} />
        </Route>
      </Route>
      <Route path="/dashboard" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
