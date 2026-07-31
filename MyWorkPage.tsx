import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, CheckSquare2, Filter, Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { PriorityBadge } from '@/components/PriorityBadge'
import { StatusBadge } from '@/components/StatusBadge'
import { TaskDetailModal } from '@/components/TaskDetailModal'
import { TaskFormModal } from '@/components/TaskFormModal'
import { useTasks } from '@/hooks/useTasks'
import { usePeople } from '@/hooks/usePeople'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { formatDate } from '@/lib/format'
import { hasMinimumRole, type Task } from '@/types/models'

export function MyWorkPage() {
  const [params] = useSearchParams()
  const { user } = useAuth()
  const { role } = useWorkspace()
  const people = usePeople()
  const tasks = useTasks()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [status, setStatus] = useState('open')
  const [selected, setSelected] = useState<Task | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const ownPerson = people.data?.find((person) => person.auth_user_id === user?.id)
  const canCreate = hasMinimumRole(role, 'team_lead')

  const filtered = useMemo(() => (tasks.data ?? []).filter((task) => {
    const isMine = task.created_by === user?.id || task.assignees?.some((item) => item.person_id === ownPerson?.id)
    const text = `${task.title} ${task.project?.name ?? ''}`.toLowerCase().includes(search.toLowerCase())
    const state = status === 'all' || (status === 'open' ? task.status !== 'done' : task.status === status)
    return isMine && text && state
  }), [tasks.data, user?.id, ownPerson?.id, search, status])

  return <><PageHeader title="My work" description="A focused view of work assigned to you or created by you." actions={canCreate ? <button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={16} />Create task</button> : undefined} /><div className="toolbar"><div className="toolbar-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search my work…" /></div><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="open">Open work</option><option value="all">All work</option><option value="todo">To do</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="review">Review</option><option value="done">Done</option></select><button className="secondary-button"><Filter size={16} />More filters</button></div>
    {filtered.length === 0 ? <EmptyState icon={CheckSquare2} title="No work found" description={ownPerson ? 'There are no work items matching this view.' : 'Your authenticated account is not linked to a people profile yet. Ask an admin to link it.'} /> : <div className="table-card"><table><thead><tr><th>Work item</th><th>Project</th><th>Priority</th><th>Status</th><th>Due</th><th>Progress</th></tr></thead><tbody>{filtered.map((task) => <tr key={task.id} className="clickable-row" onClick={() => setSelected(task)}><td><div className="table-primary"><span className={`issue-icon issue-${task.issue_type ?? 'task'}`}>{(task.issue_type ?? 'task').slice(0, 1).toUpperCase()}</span><span><strong>{task.title}</strong><small>{task.project?.code ?? 'TASK'}-{task.id.slice(0, 5).toUpperCase()}</small></span></div></td><td>{task.project?.name ?? '—'}</td><td><PriorityBadge value={task.priority} /></td><td><StatusBadge value={task.status} /></td><td><span className={task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done' ? 'overdue-date' : ''}><CalendarDays size={14} />{formatDate(task.due_date, '—')}</span></td><td><div className="mini-progress"><span style={{ width: `${task.progress}%` }} /></div>{task.progress}%</td></tr>)}</tbody></table></div>}
    <TaskDetailModal task={selected} onClose={() => setSelected(null)} /><TaskFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
  </>
}
