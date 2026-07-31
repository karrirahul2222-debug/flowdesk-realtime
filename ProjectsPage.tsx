import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, FolderKanban, LayoutGrid, List, MoreHorizontal, Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { ProjectFormModal } from '@/components/ProjectFormModal'
import { StatusBadge } from '@/components/StatusBadge'
import { PriorityBadge } from '@/components/PriorityBadge'
import { Avatar } from '@/components/Avatar'
import { EmptyState } from '@/components/EmptyState'
import { useProjects } from '@/hooks/useProjects'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { formatDate } from '@/lib/format'
import { hasMinimumRole, type Project } from '@/types/models'

export function ProjectsPage() {
  const query = useProjects()
  const { role } = useWorkspace()
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)

  const filtered = useMemo(() => (query.data ?? []).filter((project) => {
    const matchesSearch = `${project.name} ${project.code ?? ''}`.toLowerCase().includes(search.toLowerCase())
    return matchesSearch && (status === 'all' || project.status === status)
  }), [query.data, search, status])

  const canCreate = hasMinimumRole(role, 'team_lead')

  return (
    <>
      <PageHeader title="Projects" description="Manage outcomes, owners, delivery dates and portfolio progress." actions={canCreate ? <button className="primary-button" onClick={() => { setEditing(null); setFormOpen(true) }}><Plus size={17} />New project</button> : undefined} />
      <div className="toolbar">
        <div className="toolbar-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects…" /></div>
        <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="planning">Planning</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option></select>
        <div className="segmented-control"><button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} aria-label="Grid view"><LayoutGrid size={16} /></button><button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} aria-label="List view"><List size={16} /></button></div>
      </div>

      {filtered.length === 0 && !query.isLoading ? <EmptyState icon={FolderKanban} title="No matching projects" description="Create a project or adjust the current filters." action={canCreate ? <button className="primary-button" onClick={() => setFormOpen(true)}><Plus size={16} />Create project</button> : undefined} /> : view === 'grid' ? (
        <div className="project-grid">{filtered.map((project) => <article className="project-card" key={project.id}><div className="project-card-top"><span className="project-symbol">{project.code?.slice(0, 2) ?? project.name.slice(0, 2).toUpperCase()}</span><div><StatusBadge value={project.status} /><button className="icon-button" onClick={() => { setEditing(project); setFormOpen(true) }} aria-label={`Edit ${project.name}`} disabled={!canCreate}><MoreHorizontal size={18} /></button></div></div><Link to={`/projects/${project.id}`}><h2>{project.name}</h2><p>{project.description || 'No project description.'}</p></Link><div className="progress-block"><div><span>Progress</span><strong>{project.progress}%</strong></div><div className="progress-track"><span style={{ width: `${project.progress}%` }} /></div></div><div className="project-card-meta"><span><CalendarDays size={15} />{formatDate(project.due_date)}</span><PriorityBadge value={project.priority} /></div><footer>{project.owner ? <div className="owner-chip"><Avatar name={project.owner.full_name} src={project.owner.avatar_url} size="sm" />{project.owner.full_name}</div> : <span className="muted">No owner</span>}<Link to={`/board?project=${project.id}`}>Open board →</Link></footer></article>)}</div>
      ) : (
        <div className="table-card"><table><thead><tr><th>Project</th><th>Status</th><th>Owner</th><th>Priority</th><th>Progress</th><th>Due date</th></tr></thead><tbody>{filtered.map((project) => <tr key={project.id}><td><Link className="table-primary" to={`/projects/${project.id}`}>{project.code && <span className="issue-key">{project.code}</span>}<strong>{project.name}</strong></Link></td><td><StatusBadge value={project.status} /></td><td>{project.owner?.full_name ?? 'Unassigned'}</td><td><PriorityBadge value={project.priority} /></td><td><div className="mini-progress"><span style={{ width: `${project.progress}%` }} /></div>{project.progress}%</td><td>{formatDate(project.due_date)}</td></tr>)}</tbody></table></div>
      )}
      <ProjectFormModal open={formOpen} onClose={() => setFormOpen(false)} project={editing} />
    </>
  )
}
