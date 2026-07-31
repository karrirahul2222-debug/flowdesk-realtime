import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { Modal } from './Modal'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { usePeople } from '@/hooks/usePeople'
import { useProjects } from '@/hooks/useProjects'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/errors'
import { issueTypes, priorities, taskStatuses } from '@/lib/constants'
import type { Epic, IssueType, Priority, Sprint, Task, TaskStatus } from '@/types/models'

interface TaskFormModalProps {
  open: boolean
  onClose: () => void
  task?: Task | null
  defaultProjectId?: string
  defaultStatus?: TaskStatus
}

export function TaskFormModal({ open, onClose, task, defaultProjectId, defaultStatus = 'todo' }: TaskFormModalProps) {
  const { organization } = useWorkspace()
  const { user } = useAuth()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const people = usePeople()
  const projects = useProjects()
  const [form, setForm] = useState({
    project_id: '', title: '', description: '', status: defaultStatus, priority: 'medium' as Priority,
    issue_type: 'task' as IssueType, story_points: '', estimated_hours: '', start_date: '', due_date: '',
    sprint_id: '', epic_id: '', reviewer_person_id: '', acceptance_criteria: '', assignee_ids: [] as string[],
  })
  const [error, setError] = useState('')

  const projectId = form.project_id
  const jiraQuery = useQuery({
    queryKey: ['jira-options', projectId],
    queryFn: async (): Promise<{ sprints: Sprint[]; epics: Epic[] }> => {
      const [sprints, epics] = await Promise.all([
        supabase.from('sprints').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.from('epics').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      ])
      if (sprints.error) throw sprints.error
      if (epics.error) throw epics.error
      return { sprints: (sprints.data ?? []) as Sprint[], epics: (epics.data ?? []) as Epic[] }
    },
    enabled: open && Boolean(projectId),
    retry: false,
  })

  useEffect(() => {
    if (!open) return
    setError('')
    const currentAssignees = task?.assignees?.map((item) => item.person_id) ?? []
    setForm(task ? {
      project_id: task.project_id,
      title: task.title,
      description: task.description ?? '',
      status: task.status,
      priority: task.priority,
      issue_type: task.issue_type ?? 'task',
      story_points: task.story_points?.toString() ?? '',
      estimated_hours: task.estimated_hours?.toString() ?? '',
      start_date: task.start_date ?? '',
      due_date: task.due_date ?? '',
      sprint_id: task.sprint_id ?? '',
      epic_id: task.epic_id ?? '',
      reviewer_person_id: task.reviewer_person_id ?? '',
      acceptance_criteria: task.acceptance_criteria ?? '',
      assignee_ids: currentAssignees,
    } : {
      project_id: defaultProjectId ?? projects.data?.[0]?.id ?? '', title: '', description: '', status: defaultStatus,
      priority: 'medium', issue_type: 'task', story_points: '', estimated_hours: '', start_date: '', due_date: '',
      sprint_id: '', epic_id: '', reviewer_person_id: '', acceptance_criteria: '', assignee_ids: [],
    })
  }, [open, task, defaultProjectId, defaultStatus, projects.data])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!organization || !user) throw new Error('Workspace session is unavailable.')
      if (!form.project_id) throw new Error('Select a project.')
      const payload = {
        organization_id: organization.id,
        project_id: form.project_id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        status: form.status,
        priority: form.priority,
        issue_type: form.issue_type,
        story_points: form.story_points ? Number(form.story_points) : null,
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        sprint_id: form.sprint_id || null,
        epic_id: form.epic_id || null,
        reviewer_person_id: form.reviewer_person_id || null,
        acceptance_criteria: form.acceptance_criteria.trim() || null,
      }

      let taskId = task?.id
      if (task) {
        const { error: updateError } = await supabase.from('tasks').update(payload).eq('id', task.id)
        if (updateError) throw updateError
        const { error: deleteError } = await supabase.from('task_assignees').delete().eq('task_id', task.id)
        if (deleteError) throw deleteError
      } else {
        const { data, error: insertError } = await supabase.from('tasks').insert({ ...payload, created_by: user.id }).select('id').single()
        if (insertError) throw insertError
        taskId = data.id as string
      }

      if (form.assignee_ids.length > 0 && taskId) {
        const { error: assignError } = await supabase.from('task_assignees').insert(
          form.assignee_ids.map((personId) => ({ task_id: taskId, person_id: personId, organization_id: organization.id, assigned_by: user.id })),
        )
        if (assignError) throw assignError
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks', organization?.id] })
      showToast(task ? 'Task updated.' : 'Task created.', 'success')
      onClose()
    },
    onError: (caught) => setError(getErrorMessage(caught)),
  })

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }))
  const toggleAssignee = (personId: string) => set('assignee_ids', form.assignee_ids.includes(personId) ? form.assignee_ids.filter((id) => id !== personId) : [...form.assignee_ids, personId])

  return (
    <Modal open={open} onClose={onClose} title={task ? 'Edit work item' : 'Create work item'} size="xl">
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); setError(''); mutation.mutate() }}>
        <label className="field"><span>Project</span><select required value={form.project_id} onChange={(event) => { set('project_id', event.target.value); set('sprint_id', ''); set('epic_id', '') }}><option value="">Select project</option>{(projects.data ?? []).map((project) => <option key={project.id} value={project.id}>{project.code ? `${project.code} · ` : ''}{project.name}</option>)}</select></label>
        <label className="field"><span>Issue type</span><select value={form.issue_type} onChange={(event) => set('issue_type', event.target.value as IssueType)}>{issueTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <label className="field field-span-2"><span>Title</span><input autoFocus required minLength={2} maxLength={180} value={form.title} onChange={(event) => set('title', event.target.value)} placeholder="Implement employee approval workflow" /></label>
        <label className="field field-span-2"><span>Description</span><textarea rows={4} value={form.description} onChange={(event) => set('description', event.target.value)} placeholder="Context, requirements and definition of done…" /></label>
        <label className="field"><span>Status</span><select value={form.status} onChange={(event) => set('status', event.target.value as TaskStatus)}>{taskStatuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
        <label className="field"><span>Priority</span><select value={form.priority} onChange={(event) => set('priority', event.target.value as Priority)}>{priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label>
        <label className="field"><span>Story points</span><input type="number" min="0" max="100" step="1" value={form.story_points} onChange={(event) => set('story_points', event.target.value)} placeholder="5" /></label>
        <label className="field"><span>Estimate (hours)</span><input type="number" min="0" max="10000" step="0.5" value={form.estimated_hours} onChange={(event) => set('estimated_hours', event.target.value)} placeholder="8" /></label>
        <label className="field"><span>Sprint</span><select value={form.sprint_id} onChange={(event) => set('sprint_id', event.target.value)}><option value="">Backlog / no sprint</option>{(jiraQuery.data?.sprints ?? []).map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name} · {sprint.status}</option>)}</select></label>
        <label className="field"><span>Epic</span><select value={form.epic_id} onChange={(event) => set('epic_id', event.target.value)}><option value="">No epic</option>{(jiraQuery.data?.epics ?? []).map((epic) => <option key={epic.id} value={epic.id}>{epic.name}</option>)}</select></label>
        <label className="field"><span>Start date</span><input type="date" value={form.start_date} onChange={(event) => set('start_date', event.target.value)} /></label>
        <label className="field"><span>Due date</span><input type="date" min={form.start_date || undefined} value={form.due_date} onChange={(event) => set('due_date', event.target.value)} /></label>
        <label className="field"><span>Reviewer</span><select value={form.reviewer_person_id} onChange={(event) => set('reviewer_person_id', event.target.value)}><option value="">No reviewer</option>{(people.data ?? []).map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label>
        <fieldset className="field assignee-picker"><legend>Assignees</legend><div>{(people.data ?? []).map((person) => <label key={person.id} className="check-option"><input type="checkbox" checked={form.assignee_ids.includes(person.id)} onChange={() => toggleAssignee(person.id)} /><span>{person.full_name}</span></label>)}</div></fieldset>
        <label className="field field-span-2"><span>Acceptance criteria</span><textarea rows={3} value={form.acceptance_criteria} onChange={(event) => set('acceptance_criteria', event.target.value)} placeholder="Clear conditions required before this item is considered done…" /></label>
        {jiraQuery.isError && <div className="form-message warning field-span-2">Jira extension tables are not available yet. Apply the included Supabase migration.</div>}
        {error && <div className="form-message error field-span-2">{error}</div>}
        <div className="form-actions field-span-2"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={mutation.isPending}>{mutation.isPending && <LoaderCircle className="spin" size={16} />}{task ? 'Save changes' : 'Create work item'}</button></div>
      </form>
    </Modal>
  )
}
