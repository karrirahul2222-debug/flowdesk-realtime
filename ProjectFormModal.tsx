import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { Modal } from './Modal'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { usePeople } from '@/hooks/usePeople'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/errors'
import type { Priority, Project, ProjectStatus } from '@/types/models'

interface ProjectFormModalProps {
  open: boolean
  onClose: () => void
  project?: Project | null
}

export function ProjectFormModal({ open, onClose, project }: ProjectFormModalProps) {
  const { organization } = useWorkspace()
  const { user } = useAuth()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const people = usePeople()
  const [form, setForm] = useState({
    name: '', code: '', description: '', status: 'planning' as ProjectStatus, priority: 'medium' as Priority,
    owner_person_id: '', start_date: '', due_date: '',
  })
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setForm(project ? {
      name: project.name,
      code: project.code ?? '',
      description: project.description ?? '',
      status: project.status,
      priority: project.priority,
      owner_person_id: project.owner_person_id ?? '',
      start_date: project.start_date ?? '',
      due_date: project.due_date ?? '',
    } : { name: '', code: '', description: '', status: 'planning', priority: 'medium', owner_person_id: '', start_date: '', due_date: '' })
  }, [open, project])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!organization || !user) throw new Error('Workspace session is unavailable.')
      const payload = {
        organization_id: organization.id,
        name: form.name.trim(),
        code: form.code.trim().toUpperCase() || null,
        description: form.description.trim() || null,
        status: form.status,
        priority: form.priority,
        owner_person_id: form.owner_person_id || null,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
      }
      if (project) {
        const { error: updateError } = await supabase.from('projects').update(payload).eq('id', project.id)
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase.from('projects').insert({ ...payload, created_by: user.id })
        if (insertError) throw insertError
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects', organization?.id] })
      showToast(project ? 'Project updated.' : 'Project created.', 'success')
      onClose()
    },
    onError: (caught) => setError(getErrorMessage(caught)),
  })

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }))

  return (
    <Modal open={open} onClose={onClose} title={project ? 'Edit project' : 'Create project'} size="lg">
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); setError(''); mutation.mutate() }}>
        <label className="field field-span-2"><span>Project name</span><input required minLength={2} maxLength={120} value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="Customer onboarding platform" /></label>
        <label className="field"><span>Project key</span><input maxLength={12} value={form.code} onChange={(event) => set('code', event.target.value)} placeholder="ONB" /></label>
        <label className="field"><span>Owner</span><select value={form.owner_person_id} onChange={(event) => set('owner_person_id', event.target.value)}><option value="">No owner</option>{(people.data ?? []).map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label>
        <label className="field"><span>Status</span><select value={form.status} onChange={(event) => set('status', event.target.value as ProjectStatus)}><option value="planning">Planning</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
        <label className="field"><span>Priority</span><select value={form.priority} onChange={(event) => set('priority', event.target.value as Priority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
        <label className="field"><span>Start date</span><input type="date" value={form.start_date} onChange={(event) => set('start_date', event.target.value)} /></label>
        <label className="field"><span>Due date</span><input type="date" min={form.start_date || undefined} value={form.due_date} onChange={(event) => set('due_date', event.target.value)} /></label>
        <label className="field field-span-2"><span>Description</span><textarea rows={4} value={form.description} onChange={(event) => set('description', event.target.value)} placeholder="Business goal, scope and expected outcome…" /></label>
        {error && <div className="form-message error field-span-2">{error}</div>}
        <div className="form-actions field-span-2"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={mutation.isPending}>{mutation.isPending && <LoaderCircle className="spin" size={16} />}{project ? 'Save changes' : 'Create project'}</button></div>
      </form>
    </Modal>
  )
}
