import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { supabase } from '@/lib/supabase'
import type { Person, Role, TaskStatus } from '@/types/models'

export type MetricsRange = 7 | 30
export type DashboardAudience = 'ceo' | 'manager' | 'employee'

export interface ChartDatum {
  label: string
  value: number
}

export interface DashboardMetrics {
  status: ChartDatum[]
  completionTrend: ChartDatum[]
  workload: ChartDatum[]
  timeTracked: ChartDatum[]
  taskCount: number
  hasTimeEntries: boolean
}

const taskStatuses: Array<{ status: TaskStatus; label: string }> = [
  { status: 'backlog', label: 'Backlog' },
  { status: 'todo', label: 'To do' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'review', label: 'Review' },
  { status: 'done', label: 'Completed' },
]

interface TaskMetricRow {
  id: string
  status: TaskStatus
  updated_at: string
}

interface AssignmentRow {
  task_id: string
  person_id: string
}

interface TimeMetricRow {
  entry_date: string
  minutes: number
  user_id: string
}

function dateKey(daysAgo: number) {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10)
}

function dateSeries(range: MetricsRange) {
  return Array.from({ length: range }, (_, index) => {
    const key = dateKey(range - index - 1)
    return {
      key,
      label: new Date(`${key}T12:00:00`).toLocaleDateString('en-IN', range === 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' }),
      value: 0,
    }
  })
}

function audienceForRole(role: Role | null): DashboardAudience {
  if (role === 'ceo' || role === 'admin') return 'ceo'
  if (role === 'manager' || role === 'team_lead') return 'manager'
  return 'employee'
}

function scopedPeople(people: Person[], currentPerson: Person | undefined, audience: DashboardAudience) {
  if (audience === 'ceo') return people
  if (!currentPerson) return []
  if (audience === 'employee') return [currentPerson]

  return people.filter((person) => (
    person.id === currentPerson.id
    || person.manager_id === currentPerson.id
    || (currentPerson.team_id !== null && person.team_id === currentPerson.team_id)
  ))
}

async function fetchDashboardMetrics(organizationId: string, userId: string, role: Role | null, range: MetricsRange, people: Person[]): Promise<DashboardMetrics> {
  const audience = audienceForRole(role)
  const startDate = dateKey(range - 1)
  const currentPerson = people.find((person) => person.auth_user_id === userId)
  const visiblePeople = scopedPeople(people, currentPerson, audience)
  const visiblePersonIds = new Set(visiblePeople.map((person) => person.id))
  const visibleUserIds = visiblePeople.flatMap((person) => person.auth_user_id ? [person.auth_user_id] : [])

  let assignments: AssignmentRow[] = []
  if (audience === 'ceo' || visiblePersonIds.size > 0) {
    let assignmentsQuery = supabase
      .from('task_assignees')
      .select('task_id,person_id')
      .eq('organization_id', organizationId)
    if (audience !== 'ceo') assignmentsQuery = assignmentsQuery.in('person_id', [...visiblePersonIds])
    const { data, error } = await assignmentsQuery
    if (error) throw error
    assignments = (data ?? []) as AssignmentRow[]
  }

  const taskIds = [...new Set(assignments.map((assignment) => assignment.task_id))]
  let tasks: TaskMetricRow[] = []
  if (audience === 'ceo' || taskIds.length > 0) {
    let tasksQuery = supabase
      .from('tasks')
      .select('id,status,updated_at')
      .eq('organization_id', organizationId)
    if (audience !== 'ceo') tasksQuery = tasksQuery.in('id', taskIds)
    const { data, error } = await tasksQuery
    if (error) throw error
    tasks = (data ?? []) as TaskMetricRow[]
  }

  let timeEntries: TimeMetricRow[] = []
  if (audience === 'ceo' || visibleUserIds.length > 0) {
    let timeQuery = supabase
      .from('task_time_entries')
      .select('entry_date,minutes,user_id')
      .eq('organization_id', organizationId)
      .gte('entry_date', startDate)
    if (audience !== 'ceo') timeQuery = timeQuery.in('user_id', audience === 'employee' ? [userId] : visibleUserIds)
    const { data, error } = await timeQuery
    if (error) throw error
    timeEntries = (data ?? []) as TimeMetricRow[]
  }

  const status = taskStatuses.map(({ status: taskStatus, label }) => ({
    label,
    value: tasks.filter((task) => task.status === taskStatus).length,
  }))
  const completionTrend = dateSeries(range)
  for (const task of tasks) {
    const completedOn = task.updated_at.slice(0, 10)
    const point = completionTrend.find((day) => day.key === completedOn)
    if (task.status === 'done' && point) point.value += 1
  }
  const timeTracked = dateSeries(range)
  for (const entry of timeEntries) {
    const point = timeTracked.find((day) => day.key === entry.entry_date)
    if (point) point.value += Number(entry.minutes) / 60
  }

  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const workloadByPerson = new Map(visiblePeople.map((person) => [person.id, 0]))
  for (const assignment of assignments) {
    if (taskById.get(assignment.task_id)?.status !== 'done') {
      workloadByPerson.set(assignment.person_id, (workloadByPerson.get(assignment.person_id) ?? 0) + 1)
    }
  }

  return {
    status,
    completionTrend: completionTrend.map(({ label, value }) => ({ label, value })),
    workload: visiblePeople
      .map((person) => ({ label: person.full_name, value: workloadByPerson.get(person.id) ?? 0 }))
      .filter((person) => person.value > 0),
    timeTracked: timeTracked.map(({ label, value }) => ({ label, value: Number(value.toFixed(1)) })),
    taskCount: tasks.length,
    hasTimeEntries: timeEntries.length > 0,
  }
}

interface DashboardMetricsOptions {
  enabled?: boolean
  people?: Person[]
}

export function useDashboardMetrics(range: MetricsRange, options: DashboardMetricsOptions = {}) {
  const { organization, role, canLoadWorkspaceData } = useWorkspace()
  const { user } = useAuth()
  const audience = audienceForRole(role)
  const people = options.people ?? []
  const peopleKey = people.map((person) => person.id).join(',')

  return {
    audience,
    ...useQuery({
      queryKey: ['dashboard-metrics', organization?.id, user?.id, role, range, peopleKey],
      queryFn: () => fetchDashboardMetrics(organization!.id, user!.id, role, range, people),
      enabled: canLoadWorkspaceData && Boolean(organization && user && options.people) && options.enabled !== false,
      staleTime: 20_000,
    }),
  }
}
