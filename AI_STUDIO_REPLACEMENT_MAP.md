# AI Studio replacement map

| Old AI Studio area | FlowDesk replacement |
|---|---|
| Supabase client using `NEXT_PUBLIC_*` | `src/lib/env.ts` and `src/lib/supabase.ts` using `VITE_*` |
| OAuth callback race | `src/pages/AuthCallbackPage.tsx` |
| Login and Google OAuth | `src/pages/LoginPage.tsx` |
| Membership/session access | `src/contexts/AuthContext.tsx` and `src/contexts/WorkspaceContext.tsx` |
| Role dashboards | `src/pages/DashboardPage.tsx` plus role-filtered navigation |
| Projects | `src/pages/ProjectsPage.tsx` and `ProjectDetailPage.tsx` |
| Jira board | `src/pages/BoardPage.tsx` |
| Backlog, sprints and epics | `src/pages/BacklogPage.tsx` |
| Employee tasks | `src/pages/MyWorkPage.tsx` |
| Evidence, comments, time, blockers | `src/components/TaskDetailModal.tsx` |
| Approvals | `src/pages/ApprovalsPage.tsx` |
| Employees and capacity | `src/pages/PeoplePage.tsx` |
| Reports | `src/pages/ReportsPage.tsx` |
| Departments/teams/security settings | `src/pages/SettingsPage.tsx` |
| Missing RPCs and Jira schema | Supabase migration in `supabase/migrations` |
| Realtime updates | `src/components/RealtimeSync.tsx` |
