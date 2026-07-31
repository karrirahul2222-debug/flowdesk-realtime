import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Edit3, Plus } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { ProjectFormModal } from '@/components/ProjectFormModal'
import { TaskFormModal } from '@/components/TaskFormModal'
import { StatusBadge } from '@/components/StatusBadge'
import { PriorityBadge } from '@/components/PriorityBadge'
import { useProjects } from '@/hooks/useProjects'
import { useTasks } from '@/hooks/useTasks'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { formatDate } from '@/lib/format'
import { hasMinimumRole } from '@/types/models'

export function ProjectDetailPage() {
  const { projectId = '' } = useParams()
  const projects = useProjects()
  const tasks = useTasks({ projectId })
  const { role } = useWorkspace()
  const [editOpen, setEditOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const project = projects.data?.find((item) => item.id === projectId)
  const canManage = hasMinimumRole(role, 'team_lead')
  const stats = useMemo(() => ({
    total: tasks.data?.length ?? 0,
    done: tasks.data?.filter((task) => task.status === 'done').length ?? 0,
    blocked: tasks.data?.filter((task) => task.status === 'blocked').length ?? 0,
    review: tasks.data?.filter((task) => task.status === 'review').length ?? 0,
  }), [tasks.data])

  if (!project && !projects.isLoading) return <div className="empty-state"><h2>Project not found</h2><Link to="/projects">Return to projects</Link></div>
  if (!project) return null

  return <><Link className="back-link" to="/projects"><ArrowLeft size={16} />All projects</Link><PageHeader eyebrow={project.code ?? 'PROJECT'} title={project.name} description={project.description ?? 'No description'} actions={<>{canManage && <button className="secondary-button" onClick={() => setEditOpen(true)}><Edit3 size={16} />Edit</button>}{canManage && <button className="primary-button" onClick={() => setTaskOpen(true)}><Plus size={16} />Add task</button>}</>} />
    <section className="project-summary"><div><StatusBadge value={project.status} /><PriorityBadge value={project.priority} /></div><div><CalendarDays size={17} /><span>{formatDate(project.start_date)} → {formatDate(project.due_date)}</span></div><div className="project-progress-large"><div><span>Project progress</span><strong>{project.progress}%</strong></div><div className="progress-track"><span style={{ width: `${project.progress}%` }} /></div></div></section>
    <section className="mini-stat-grid"><div><span>Total work items</span><strong>{stats.total}</strong></div><div><span>Completed</span><strong>{stats.done}</strong></div><div><span>In review</span><strong>{stats.review}</strong></div><div><span>Blocked</span><strong>{stats.blocked}</strong></div></section>
    <div className="panel"><div className="panel-heading"><div><h2>Project work</h2><p>All tasks linked to this project.</p></div><Link to={`/board?project=${project.id}`}>Open Kanban board →</Link></div><div className="data-list">{(tasks.data ?? []).slice(0, 10).map((task) => <Link to={`/board?project=${project.id}&task=${task.id}`} className="task-list-row" key={task.id}><div className="task-list-main"><span className="issue-key">{project.code ?? 'TASK'}-{task.id.slice(0, 5).toUpperCase()}</span><strong>{task.title}</strong></div><PriorityBadge value={task.priority} /><StatusBadge value={task.status} /><span className="due-cell">{formatDate(task.due_date)}</span></Link>)}</div></div>
    <ProjectFormModal open={editOpen} onClose={() => setEditOpen(false)} project={project} /><TaskFormModal open={taskOpen} onClose={() => setTaskOpen(false)} defaultProjectId={project.id} />
  </>
}
