import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarRange, CheckCircle2, ChevronDown, ChevronRight, Flag, Layers3, LoaderCircle, Play, Plus } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Modal } from '@/components/Modal'
import { PriorityBadge } from '@/components/PriorityBadge'
import { StatusBadge } from '@/components/StatusBadge'
import { TaskFormModal } from '@/components/TaskFormModal'
import { TaskDetailModal } from '@/components/TaskDetailModal'
import { useProjects } from '@/hooks/useProjects'
import { useTasks } from '@/hooks/useTasks'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/format'
import { getErrorMessage } from '@/lib/errors'
import { hasMinimumRole, type Epic, type Sprint, type Task } from '@/types/models'

export function BacklogPage() {
  const projects = useProjects()
  const { organization, role } = useWorkspace()
  const { user } = useAuth()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [projectId, setProjectId] = useState('')
  const selectedProjectId = projectId || projects.data?.[0]?.id || ''
  const tasks = useTasks(selectedProjectId ? { projectId: selectedProjectId } : {})
  const [sprintModal, setSprintModal] = useState(false)
  const [epicModal, setEpicModal] = useState(false)
  const [taskModal, setTaskModal] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [expandedSprints, setExpandedSprints] = useState<Set<string>>(new Set())
  const [sprintForm, setSprintForm] = useState({ name: '', goal: '', start_date: '', end_date: '' })
  const [epicForm, setEpicForm] = useState({ name: '', description: '' })
  const [error, setError] = useState('')
  const canManage = hasMinimumRole(role, 'team_lead')

  const jira = useQuery({
    queryKey: ['backlog-jira', selectedProjectId],
    queryFn: async (): Promise<{ sprints: Sprint[]; epics: Epic[] }> => {
      const [sprints, epics] = await Promise.all([
        supabase.from('sprints').select('*').eq('project_id', selectedProjectId).order('created_at', { ascending: false }),
        supabase.from('epics').select('*').eq('project_id', selectedProjectId).order('created_at', { ascending: false }),
      ])
      if (sprints.error) throw sprints.error
      if (epics.error) throw epics.error
      return { sprints: (sprints.data ?? []) as Sprint[], epics: (epics.data ?? []) as Epic[] }
    },
    enabled: Boolean(selectedProjectId),
    retry: false,
  })

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['backlog-jira', selectedProjectId] }),
      queryClient.invalidateQueries({ queryKey: ['tasks', organization?.id] }),
    ])
  }

  const createSprint = useMutation({
    mutationFn: async () => {
      if (!organization || !user || !selectedProjectId) throw new Error('Select a project first.')
      const { error: insertError } = await supabase.from('sprints').insert({
        organization_id: organization.id, project_id: selectedProjectId, name: sprintForm.name.trim(), goal: sprintForm.goal.trim() || null,
        start_date: sprintForm.start_date || null, end_date: sprintForm.end_date || null, created_by: user.id,
      })
      if (insertError) throw insertError
    },
    onSuccess: async () => { await refresh(); setSprintModal(false); setSprintForm({ name: '', goal: '', start_date: '', end_date: '' }); showToast('Sprint created.', 'success') },
    onError: (caught) => setError(getErrorMessage(caught)),
  })

  const createEpic = useMutation({
    mutationFn: async () => {
      if (!organization || !user || !selectedProjectId) throw new Error('Select a project first.')
      const { error: insertError } = await supabase.from('epics').insert({ organization_id: organization.id, project_id: selectedProjectId, name: epicForm.name.trim(), description: epicForm.description.trim() || null, created_by: user.id })
      if (insertError) throw insertError
    },
    onSuccess: async () => { await refresh(); setEpicModal(false); setEpicForm({ name: '', description: '' }); showToast('Epic created.', 'success') },
    onError: (caught) => setError(getErrorMessage(caught)),
  })

  const updateSprintStatus = async (sprint: Sprint, status: Sprint['status']) => {
    try {
      if (status === 'active') {
        const { error: closeError } = await supabase.from('sprints').update({ status: 'planned' }).eq('project_id', sprint.project_id).eq('status', 'active').neq('id', sprint.id)
        if (closeError) throw closeError
      }
      const { error: updateError } = await supabase.from('sprints').update({ status }).eq('id', sprint.id)
      if (updateError) throw updateError
      await refresh()
      showToast(`Sprint marked ${status}.`, 'success')
    } catch (caught) { showToast(getErrorMessage(caught), 'error') }
  }

  const assignSprint = async (taskId: string, sprintId: string) => {
    try {
      const { error: updateError } = await supabase.from('tasks').update({ sprint_id: sprintId || null }).eq('id', taskId)
      if (updateError) throw updateError
      await refresh()
    } catch (caught) { showToast(getErrorMessage(caught), 'error') }
  }

  const backlog = useMemo(() => (tasks.data ?? []).filter((task) => !task.sprint_id), [tasks.data])
  const activeSprint = jira.data?.sprints.find((sprint) => sprint.status === 'active')

  return (
    <>
      <PageHeader title="Backlog & sprints" description="Prioritize work, estimate stories, group epics and execute focused sprints." actions={canManage ? <div className="button-group"><button className="secondary-button" onClick={() => { setError(''); setEpicModal(true) }}><Layers3 size={16} />New epic</button><button className="secondary-button" onClick={() => { setError(''); setSprintModal(true) }}><CalendarRange size={16} />New sprint</button><button className="primary-button" onClick={() => setTaskModal(true)}><Plus size={16} />Add work</button></div> : undefined} />
      <div className="toolbar"><select className="project-filter" value={selectedProjectId} onChange={(event) => setProjectId(event.target.value)}>{(projects.data ?? []).map((project) => <option key={project.id} value={project.id}>{project.code ? `${project.code} · ` : ''}{project.name}</option>)}</select><span className="toolbar-note">{tasks.data?.length ?? 0} work items · {jira.data?.sprints.length ?? 0} sprints · {jira.data?.epics.length ?? 0} epics</span></div>

      {jira.isError && <div className="migration-banner"><Flag size={20} /><div><strong>Jira extension migration is not applied</strong><p>Apply the included Supabase migration before using sprints, epics, story points and compatibility RPCs.</p></div></div>}

      {activeSprint && <section className="sprint-highlight"><div><span className="eyebrow">ACTIVE SPRINT</span><h2>{activeSprint.name}</h2><p>{activeSprint.goal || 'No sprint goal defined.'}</p></div><div><span>{formatDate(activeSprint.start_date)} → {formatDate(activeSprint.end_date)}</span><strong>{(tasks.data ?? []).filter((task) => task.sprint_id === activeSprint.id && task.status === 'done').length}/{(tasks.data ?? []).filter((task) => task.sprint_id === activeSprint.id).length} done</strong></div></section>}

      <section className="backlog-layout">
        <div className="backlog-main">
          {(jira.data?.sprints ?? []).map((sprint) => {
            const sprintTasks = (tasks.data ?? []).filter((task) => task.sprint_id === sprint.id)
            const expanded = expandedSprints.has(sprint.id) || sprint.status === 'active'
            return <article className="sprint-section" key={sprint.id}><header><button className="sprint-expand" onClick={() => setExpandedSprints((current) => { const next = new Set(current); next.has(sprint.id) ? next.delete(sprint.id) : next.add(sprint.id); return next })}>{expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}<div><strong>{sprint.name}</strong><span>{sprintTasks.length} items · {sprint.status}</span></div></button><div className="sprint-actions">{sprint.status === 'planned' && canManage && <button className="small-action" onClick={() => void updateSprintStatus(sprint, 'active')}><Play size={14} />Start</button>}{sprint.status === 'active' && canManage && <button className="small-action" onClick={() => void updateSprintStatus(sprint, 'completed')}><CheckCircle2 size={14} />Complete</button>}</div></header>{expanded && <div className="backlog-rows">{sprintTasks.map((task) => <BacklogRow key={task.id} task={task} sprints={jira.data?.sprints ?? []} onOpen={(task) => setSelectedTask(task)} onAssign={assignSprint} canManage={canManage} />)}{sprintTasks.length === 0 && <div className="muted-block">No work assigned to this sprint.</div>}</div>}</article>
          })}

          <article className="sprint-section backlog-section"><header><div className="sprint-expand static"><Flag size={18} /><div><strong>Product backlog</strong><span>{backlog.length} unplanned items</span></div></div></header><div className="backlog-rows">{backlog.map((task) => <BacklogRow key={task.id} task={task} sprints={jira.data?.sprints ?? []} onOpen={(task) => setSelectedTask(task)} onAssign={assignSprint} canManage={canManage} />)}{backlog.length === 0 && <div className="muted-block">The backlog is empty.</div>}</div></article>
        </div>

        <aside className="epic-panel"><h2>Epics</h2><p>Group related delivery outcomes.</p><div>{(jira.data?.epics ?? []).map((epic) => { const count = (tasks.data ?? []).filter((task) => task.epic_id === epic.id).length; return <div className="epic-card" key={epic.id}><span className="epic-color" style={{ background: epic.color ?? undefined }} /><div><strong>{epic.name}</strong><small>{count} work items · {epic.status}</small></div></div> })}{(jira.data?.epics ?? []).length === 0 && <p className="muted-block">No epics created.</p>}</div></aside>
      </section>

      <Modal open={sprintModal} onClose={() => setSprintModal(false)} title="Create sprint"><form className="stack-form" onSubmit={(event) => { event.preventDefault(); createSprint.mutate() }}><label className="field"><span>Sprint name</span><input required value={sprintForm.name} onChange={(event) => setSprintForm({ ...sprintForm, name: event.target.value })} placeholder="Sprint 1" /></label><label className="field"><span>Goal</span><textarea rows={3} value={sprintForm.goal} onChange={(event) => setSprintForm({ ...sprintForm, goal: event.target.value })} /></label><div className="form-grid"><label className="field"><span>Start</span><input type="date" value={sprintForm.start_date} onChange={(event) => setSprintForm({ ...sprintForm, start_date: event.target.value })} /></label><label className="field"><span>End</span><input type="date" value={sprintForm.end_date} onChange={(event) => setSprintForm({ ...sprintForm, end_date: event.target.value })} /></label></div>{error && <div className="form-message error">{error}</div>}<div className="form-actions"><button type="button" className="secondary-button" onClick={() => setSprintModal(false)}>Cancel</button><button className="primary-button" disabled={createSprint.isPending}>{createSprint.isPending && <LoaderCircle className="spin" size={16} />}Create sprint</button></div></form></Modal>
      <Modal open={epicModal} onClose={() => setEpicModal(false)} title="Create epic"><form className="stack-form" onSubmit={(event) => { event.preventDefault(); createEpic.mutate() }}><label className="field"><span>Epic name</span><input required value={epicForm.name} onChange={(event) => setEpicForm({ ...epicForm, name: event.target.value })} placeholder="Employee operations" /></label><label className="field"><span>Description</span><textarea rows={4} value={epicForm.description} onChange={(event) => setEpicForm({ ...epicForm, description: event.target.value })} /></label>{error && <div className="form-message error">{error}</div>}<div className="form-actions"><button type="button" className="secondary-button" onClick={() => setEpicModal(false)}>Cancel</button><button className="primary-button" disabled={createEpic.isPending}>Create epic</button></div></form></Modal>
      <TaskFormModal open={taskModal} onClose={() => setTaskModal(false)} defaultProjectId={selectedProjectId} defaultStatus="backlog" />
      <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} />
    </>
  )
}

function BacklogRow({ task, sprints, onOpen, onAssign, canManage }: { task: Task; sprints: Sprint[]; onOpen: (task: Task) => void; onAssign: (taskId: string, sprintId: string) => void; canManage: boolean }) {
  return <div className="backlog-row"><button className="backlog-title" onClick={() => onOpen(task)}><span className={`issue-icon issue-${task.issue_type ?? 'task'}`}>{(task.issue_type ?? 'task').slice(0, 1).toUpperCase()}</span><span><strong>{task.title}</strong><small>{task.project?.code ?? 'TASK'}-{task.id.slice(0, 5).toUpperCase()}</small></span></button><PriorityBadge value={task.priority} /><StatusBadge value={task.status} /><span className="points-cell">{task.story_points ?? '—'} pts</span><select aria-label={`Sprint for ${task.title}`} disabled={!canManage} value={task.sprint_id ?? ''} onChange={(event) => void onAssign(task.id, event.target.value)}><option value="">Backlog</option>{sprints.filter((sprint) => sprint.status !== 'completed').map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}</select></div>
}
