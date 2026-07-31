import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, BriefcaseBusiness, CheckCircle2, ListTodo, Plus, ShieldCheck, UsersRound } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { DashboardMetricsCharts } from '@/components/DashboardMetricsCharts'
import { StatusBadge } from '@/components/StatusBadge'
import { PriorityBadge } from '@/components/PriorityBadge'
import { Avatar } from '@/components/Avatar'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useAuth } from '@/contexts/AuthContext'
import { useProjects } from '@/hooks/useProjects'
import { usePeople } from '@/hooks/usePeople'
import { useTasks } from '@/hooks/useTasks'
import { useDashboardMetrics, type MetricsRange } from '@/hooks/useDashboardMetrics'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/format'
import type { Approval, Blocker } from '@/types/models'
import { useEffect, useRef, useState } from 'react'
import { AttendancePanel } from '@/components/AttendancePanel'
import { logPerformance } from '@/lib/performance'

export function DashboardPage() {
  const { organization, role, canLoadWorkspaceData } = useWorkspace()
  const { user } = useAuth()
  const projects = useProjects()
  const tasks = useTasks()
  const criticalStartedAt = useRef(performance.now())
  const criticalTimingLogged = useRef(false)
  const criticalReady = projects.isSuccess && tasks.isSuccess
  const people = usePeople({ enabled: criticalReady })
  const [metricsRange, setMetricsRange] = useState<MetricsRange>(7)
  const metricsEnabled = criticalReady && people.isSuccess
  const metrics = useDashboardMetrics(metricsRange, { enabled: metricsEnabled, people: people.data })

  useEffect(() => {
    if (!criticalReady || criticalTimingLogged.current) return
    criticalTimingLogged.current = true
    logPerformance('dashboard critical data', criticalStartedAt.current)
  }, [criticalReady])

  const ops = useQuery({
    queryKey: ['dashboard-ops', organization?.id],
    queryFn: async () => {
      const [approvals, blockers] = await Promise.all([
        supabase.from('task_approvals').select('*').eq('organization_id', organization!.id).eq('status', 'pending'),
        supabase.from('task_blockers').select('*').eq('organization_id', organization!.id).eq('status', 'open'),
      ])
      const failed = [approvals.error, blockers.error].find(Boolean)
      if (failed) throw failed
      return { approvals: (approvals.data ?? []) as Approval[], blockers: (blockers.data ?? []) as Blocker[] }
    },
    enabled: canLoadWorkspaceData && Boolean(organization) && criticalReady,
  })

  const allTasks = tasks.data ?? []
  const activeProjects = (projects.data ?? []).filter((project) => ['planning', 'active'].includes(project.status))
  const overdue = allTasks.filter((task) => task.due_date && task.status !== 'done' && new Date(task.due_date) < new Date())
  const completed = allTasks.filter((task) => task.status === 'done').length
  const completionRate = allTasks.length ? Math.round((completed / allTasks.length) * 100) : 0
  const firstName = (user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? 'there').split(' ')[0]

  return (
    <>
      <PageHeader
        eyebrow={`${organization?.name ?? 'Workspace'} · ${role?.replace('_', ' ')}`}
        title={`Good afternoon, ${firstName} 👋`}
        description="Here is the operational picture across projects, delivery and approvals."
        actions={<Link className="primary-button" to="/board?create=1"><Plus size={17} />Create task</Link>}
      />

      <section className="metric-grid">
        <MetricCard icon={BriefcaseBusiness} label="Active projects" value={projects.isLoading ? '—' : activeProjects.length} hint={`${projects.data?.length ?? 0} total projects`} />
        <MetricCard icon={ListTodo} label="Open work items" value={tasks.isLoading ? '—' : allTasks.length - completed} hint={`${completionRate}% completion rate`} />
        <MetricCard icon={ShieldCheck} label="Pending approvals" value={!criticalReady || ops.isLoading ? '—' : ops.data?.approvals.length ?? 0} hint="Waiting for a decision" tone="warning" />
        <MetricCard icon={AlertTriangle} label="Delivery risks" value={!criticalReady || ops.isLoading ? '—' : (ops.data?.blockers.length ?? 0) + overdue.length} hint={`${overdue.length} overdue items`} tone="danger" />
      </section>

      <DashboardMetricsCharts
        audience={metrics.audience}
        metrics={metrics.data}
        range={metricsRange}
        onRangeChange={setMetricsRange}
        loading={!metricsEnabled || metrics.isLoading}
        error={metrics.isError}
        onRetry={() => void metrics.refetch()}
      />
      <AttendancePanel />

      <section className="dashboard-grid">
        <article className="panel span-2">
          <div className="panel-heading"><div><h2>Priority work</h2><p>Urgent, overdue and review items that need attention.</p></div><Link to="/my-work">View all <ArrowRight size={15} /></Link></div>
          <div className="data-list">
            {allTasks.filter((task) => task.priority === 'urgent' || task.status === 'blocked' || task.status === 'review' || overdue.some((item) => item.id === task.id)).slice(0, 6).map((task) => (
              <Link to={`/board?task=${task.id}`} className="task-list-row" key={task.id}>
                <div className="task-list-main"><span className="issue-key">{task.project?.code ?? 'TASK'}-{task.id.slice(0, 5).toUpperCase()}</span><strong>{task.title}</strong><small>{task.project?.name}</small></div>
                <PriorityBadge value={task.priority} /><StatusBadge value={task.status} /><span className="due-cell">{formatDate(task.due_date, 'No due date')}</span>
              </Link>
            ))}
            {allTasks.length === 0 && <div className="muted-block">No work items yet. Create the first project and task to populate this dashboard.</div>}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading"><div><h2>Team capacity</h2><p>Active workspace members.</p></div><Link to="/people"><UsersRound size={17} /></Link></div>
          <div className="people-preview">{(people.data ?? []).filter((person) => person.status === 'active').slice(0, 6).map((person) => <div key={person.id}><Avatar name={person.full_name} src={person.avatar_url} /><span><strong>{person.full_name}</strong><small>{person.access_role.replace('_', ' ')}</small></span><em>{person.weekly_capacity_hours}h</em></div>)}{!criticalReady || people.isLoading ? <p className="muted-block">Loading team capacity…</p> : (people.data ?? []).filter((person) => person.status === 'active').length === 0 && <p className="muted-block">No active employee profiles have been created.</p>}</div>
        </article>
      </section>
    </>
  )
}

function MetricCard({ icon: Icon, label, value, hint, tone = 'default' }: { icon: typeof BriefcaseBusiness; label: string; value: number | string; hint: string; tone?: 'default' | 'warning' | 'danger' }) {
  return <article className={`metric-card metric-${tone}`}><div className="metric-icon"><Icon size={20} /></div><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>{tone === 'default' && typeof value === 'number' && value > 0 && <CheckCircle2 className="metric-check" size={16} />}</article>
}
