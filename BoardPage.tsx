import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Filter, GripVertical, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { PriorityBadge } from '@/components/PriorityBadge'
import { Avatar } from '@/components/Avatar'
import { TaskFormModal } from '@/components/TaskFormModal'
import { TaskDetailModal } from '@/components/TaskDetailModal'
import { useTasks } from '@/hooks/useTasks'
import { useProjects } from '@/hooks/useProjects'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useToast } from '@/contexts/ToastContext'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/format'
import { taskStatuses } from '@/lib/constants'
import { getErrorMessage } from '@/lib/errors'
import { hasMinimumRole, type Task, type TaskStatus } from '@/types/models'

export function BoardPage() {
  const [params, setParams] = useSearchParams()
  const projectParam = params.get('project') ?? ''
  const projects = useProjects()
  const [projectId, setProjectId] = useState(projectParam)
  const tasks = useTasks(projectId ? { projectId } : {})
  const { organization, role } = useWorkspace()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [priority, setPriority] = useState('all')
  const [taskFormOpen, setTaskFormOpen] = useState(params.get('create') === '1')
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null)
  const canManage = hasMinimumRole(role, 'team_lead')

  useEffect(() => {
    const taskId = params.get('task')
    if (taskId && tasks.data) setSelectedTask(tasks.data.find((task) => task.id === taskId) ?? null)
  }, [params, tasks.data])

  useEffect(() => {
    if (!projectId && projects.data?.length) setProjectId(projects.data[0].id)
  }, [projectId, projects.data])

  const filtered = useMemo(() => (tasks.data ?? []).filter((task) => {
    const matchesText = `${task.title} ${task.description ?? ''}`.toLowerCase().includes(search.toLowerCase())
    return matchesText && (priority === 'all' || task.priority === priority)
  }), [tasks.data, search, priority])

  const updateStatus = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: TaskStatus }) => {
      const progress = status === 'done' ? 100 : status === 'backlog' || status === 'todo' ? 0 : undefined
      const { error } = await supabase.from('tasks').update({ status, ...(progress === undefined ? {} : { progress }) }).eq('id', taskId)
      if (error) throw error
    },
    onMutate: async ({ taskId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', organization?.id] })
      const previous = queryClient.getQueriesData<Task[]>({ queryKey: ['tasks', organization?.id] })
      queryClient.setQueriesData<Task[]>({ queryKey: ['tasks', organization?.id] }, (current) => current?.map((task) => task.id === taskId ? { ...task, status } : task))
      return { previous }
    },
    onError: (caught, _variables, context) => {
      context?.previous.forEach(([key, value]) => queryClient.setQueryData(key, value))
      showToast(getErrorMessage(caught), 'error')
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['tasks', organization?.id] }),
  })

  const dropInto = (status: TaskStatus) => {
    if (!draggedTaskId || !canManage) return
    const task = filtered.find((item) => item.id === draggedTaskId)
    if (task && task.status !== status) updateStatus.mutate({ taskId: task.id, status })
    setDraggedTaskId(null)
    setDragOverStatus(null)
  }

  const setSelected = (task: Task | null) => {
    setSelectedTask(task)
    const next = new URLSearchParams(params)
    if (task) next.set('task', task.id)
    else next.delete('task')
    next.delete('create')
    setParams(next, { replace: true })
  }

  return (
    <>
      <PageHeader title="Kanban board" description="Move work through a Jira-style delivery workflow with live Supabase updates." actions={canManage ? <button className="primary-button" onClick={() => { setEditingTask(null); setTaskFormOpen(true) }}><Plus size={17} />Create work item</button> : undefined} />
      <div className="board-toolbar">
        <select className="project-filter" value={projectId} onChange={(event) => { setProjectId(event.target.value); const next = new URLSearchParams(params); next.set('project', event.target.value); next.delete('task'); setParams(next) }}><option value="">All projects</option>{(projects.data ?? []).map((project) => <option value={project.id} key={project.id}>{project.code ? `${project.code} · ` : ''}{project.name}</option>)}</select>
        <div className="toolbar-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this board…" /></div>
        <select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="all">All priorities</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select>
        <button className="secondary-button"><Filter size={16} />Filters</button><button className="icon-button"><SlidersHorizontal size={17} /></button>
      </div>

      <div className="kanban-scroll"><div className="kanban-board">{taskStatuses.map((column) => <BoardColumn key={column.id} status={column.id} label={column.label} tasks={filtered.filter((task) => task.status === column.id)} onOpen={setSelected} canDrag={canManage} onCreate={() => { setEditingTask(null); setTaskFormOpen(true) }} isOver={dragOverStatus === column.id} onDragEnter={() => setDragOverStatus(column.id)} onDrop={() => dropInto(column.id)} onDragStart={setDraggedTaskId} onDragEnd={() => { setDraggedTaskId(null); setDragOverStatus(null) }} />)}</div></div>

      <TaskFormModal open={taskFormOpen} onClose={() => { setTaskFormOpen(false); setEditingTask(null); const next = new URLSearchParams(params); next.delete('create'); setParams(next, { replace: true }) }} task={editingTask} defaultProjectId={projectId} />
      <TaskDetailModal task={selectedTask} onClose={() => setSelected(null)} onEdit={(task) => { setSelected(null); setEditingTask(task); setTaskFormOpen(true) }} />
    </>
  )
}

function BoardColumn({ status, label, tasks, onOpen, canDrag, onCreate, isOver, onDragEnter, onDrop, onDragStart, onDragEnd }: { status: TaskStatus; label: string; tasks: Task[]; onOpen: (task: Task) => void; canDrag: boolean; onCreate: () => void; isOver: boolean; onDragEnter: () => void; onDrop: () => void; onDragStart: (taskId: string) => void; onDragEnd: () => void }) {
  return <section className={`kanban-column ${isOver ? 'column-over' : ''}`} onDragOver={(event) => { event.preventDefault(); onDragEnter() }} onDrop={(event) => { event.preventDefault(); onDrop() }}><header><div><span className={`column-dot dot-${status.replace('_', '-')}`} /><strong>{label}</strong><em>{tasks.length}</em></div><button className="icon-button" onClick={onCreate} aria-label={`Add to ${label}`}><Plus size={16} /></button></header><div className="kanban-cards">{tasks.map((task) => <BoardCard key={task.id} task={task} onOpen={onOpen} disabled={!canDrag} onDragStart={onDragStart} onDragEnd={onDragEnd} />)}{tasks.length === 0 && <div className="column-empty">Drop work here</div>}</div></section>
}

function BoardCard({ task, onOpen, disabled, onDragStart, onDragEnd }: { task: Task; onOpen: (task: Task) => void; disabled: boolean; onDragStart: (taskId: string) => void; onDragEnd: () => void }) {
  return <article draggable={!disabled} className="kanban-card" onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', task.id); onDragStart(task.id) }} onDragEnd={onDragEnd} onClick={() => onOpen(task)}><div className="card-drag-row"><span className="issue-key">{task.project?.code ?? 'TASK'}-{task.id.slice(0, 5).toUpperCase()}</span><button className="drag-handle" onClick={(event) => event.stopPropagation()} aria-label="Drag task"><GripVertical size={15} /></button></div><h3>{task.title}</h3>{task.description && <p>{task.description}</p>}<div className="card-tags">{task.issue_type && <span className={`issue-type issue-${task.issue_type}`}>{task.issue_type}</span>}{task.story_points !== null && task.story_points !== undefined && <span className="story-points">{task.story_points} pts</span>}</div><div className="kanban-card-meta"><PriorityBadge value={task.priority} /><span className={task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done' ? 'overdue-date' : ''}><CalendarDays size={14} />{formatDate(task.due_date, 'No date')}</span></div><footer><div className="avatar-group">{(task.assignees ?? []).slice(0, 3).map((item) => <Avatar key={item.person_id} name={item.person?.full_name ?? 'User'} src={item.person?.avatar_url} size="sm" />)}</div><span>{task.progress}%</span></footer></article>
}
