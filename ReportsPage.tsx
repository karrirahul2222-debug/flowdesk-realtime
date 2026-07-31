import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, BarChart3, CheckCircle2, Clock3, Download, TrendingUp } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PageHeader } from '@/components/PageHeader'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useProjects } from '@/hooks/useProjects'
import { useTasks } from '@/hooks/useTasks'
import { usePeople } from '@/hooks/usePeople'
import { supabase } from '@/lib/supabase'
import { minutesToHours } from '@/lib/format'

export function ReportsPage() {
  const { organization } = useWorkspace()
  const projects = useProjects()
  const tasks = useTasks()
  const people = usePeople()

  const timeQuery = useQuery({
    queryKey: ['reports-time', organization?.id],
    queryFn: async () => {
      const start = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)
      const { data, error } = await supabase.from('task_time_entries').select('minutes,entry_date,user_id,task_id').eq('organization_id', organization!.id).gte('entry_date', start)
      if (error) throw error
      return data ?? []
    },
    enabled: Boolean(organization),
  })

  const allTasks = tasks.data ?? []
  const totalMinutes = (timeQuery.data ?? []).reduce((sum, item) => sum + Number(item.minutes), 0)
  const completed = allTasks.filter((task) => task.status === 'done').length
  const blocked = allTasks.filter((task) => task.status === 'blocked').length
  const overdue = allTasks.filter((task) => task.due_date && task.status !== 'done' && new Date(task.due_date) < new Date()).length

  const projectPerformance = useMemo(() => (projects.data ?? []).map((project) => {
    const projectTasks = allTasks.filter((task) => task.project_id === project.id)
    return {
      name: project.code ?? project.name.slice(0, 10),
      completion: projectTasks.length ? Math.round(projectTasks.filter((task) => task.status === 'done').length / projectTasks.length * 100) : 0,
      blocked: projectTasks.filter((task) => task.status === 'blocked').length,
      total: projectTasks.length,
    }
  }).slice(0, 10), [projects.data, allTasks])

  const deliveryTrend = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const end = new Date(Date.now() - (5 - index) * 7 * 86400000)
    const start = new Date(end.getTime() - 6 * 86400000)
    return {
      week: `W${index + 1}`,
      created: allTasks.filter((task) => new Date(task.created_at) >= start && new Date(task.created_at) <= end).length,
      completed: allTasks.filter((task) => task.status === 'done' && new Date(task.updated_at) >= start && new Date(task.updated_at) <= end).length,
    }
  }), [allTasks])

  const workload = useMemo(() => (people.data ?? []).map((person) => ({
    name: person.full_name.split(' ')[0],
    assigned: allTasks.filter((task) => task.assignees?.some((item) => item.person_id === person.id) && task.status !== 'done').length,
    capacity: person.weekly_capacity_hours,
  })).slice(0, 12), [people.data, allTasks])

  const exportCsv = () => {
    const rows = [['Task', 'Project', 'Status', 'Priority', 'Progress', 'Due Date'], ...allTasks.map((task) => [task.title, task.project?.name ?? '', task.status, task.priority, String(task.progress), task.due_date ?? ''])]
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `flowdesk-report-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return <><PageHeader title="Reports" description="Measure delivery velocity, workload, time and operational risk." actions={<button className="secondary-button" onClick={exportCsv}><Download size={16} />Export CSV</button>} />
    <section className="metric-grid"><ReportMetric icon={CheckCircle2} label="Completed work" value={completed} hint={`${allTasks.length ? Math.round(completed / allTasks.length * 100) : 0}% completion`} /><ReportMetric icon={Clock3} label="Time logged" value={minutesToHours(totalMinutes)} hint="Last 30 days" /><ReportMetric icon={AlertTriangle} label="Blocked items" value={blocked} hint={`${overdue} overdue`} /><ReportMetric icon={TrendingUp} label="Active projects" value={(projects.data ?? []).filter((project) => project.status === 'active').length} hint={`${projects.data?.length ?? 0} total`} /></section>
    <section className="dashboard-grid">
      <article className="panel chart-panel span-2"><div className="panel-heading"><div><h2>Delivery trend</h2><p>Created versus completed work by week.</p></div><TrendingUp size={19} /></div><div className="chart-container"><ResponsiveContainer width="100%" height="100%"><AreaChart data={deliveryTrend}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="week" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} /><Tooltip /><Legend /><Area type="monotone" dataKey="created" fillOpacity={0.2} /><Area type="monotone" dataKey="completed" fillOpacity={0.2} /></AreaChart></ResponsiveContainer></div></article>
      <article className="panel chart-panel"><div className="panel-heading"><div><h2>Project health</h2><p>Completion by project.</p></div><BarChart3 size={19} /></div><div className="chart-container"><ResponsiveContainer width="100%" height="100%"><BarChart data={projectPerformance} layout="vertical"><CartesianGrid horizontal={false} strokeDasharray="3 3" /><XAxis type="number" domain={[0, 100]} axisLine={false} tickLine={false} /><YAxis dataKey="name" type="category" width={58} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="completion" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></div></article>
      <article className="panel chart-panel span-3"><div className="panel-heading"><div><h2>Team workload</h2><p>Open assigned items compared across active people.</p></div></div><div className="chart-container"><ResponsiveContainer width="100%" height="100%"><LineChart data={workload}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="name" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} /><Tooltip /><Legend /><Line type="monotone" dataKey="assigned" strokeWidth={3} /><Line type="monotone" dataKey="capacity" strokeWidth={2} /></LineChart></ResponsiveContainer></div></article>
    </section>
  </>
}

function ReportMetric({ icon: Icon, label, value, hint }: { icon: typeof CheckCircle2; label: string; value: string | number; hint: string }) {
  return <article className="metric-card"><div className="metric-icon"><Icon size={20} /></div><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></article>
}
