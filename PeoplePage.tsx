import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Mail, Plus, Search, UserRoundPlus, UsersRound } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Modal } from '@/components/Modal'
import { Avatar } from '@/components/Avatar'
import { StatusBadge } from '@/components/StatusBadge'
import { EmptyState } from '@/components/EmptyState'
import { usePeople, useDepartments, useTeams } from '@/hooks/usePeople'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useToast } from '@/contexts/ToastContext'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/errors'
import { hasMinimumRole, type Role } from '@/types/models'

export function PeoplePage() {
  const people = usePeople()
  const departments = useDepartments()
  const teams = useTeams()
  const { organization, role } = useWorkspace()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', email: '', job_title: '', role: 'employee' as Role, department_id: '', team_id: '', manager_email: '', weekly_capacity_hours: '40' })
  const canManage = hasMinimumRole(role, 'admin')

  const filtered = useMemo(() => (people.data ?? []).filter((person) => {
    const text = `${person.full_name} ${person.email ?? ''} ${person.job_title ?? ''}`.toLowerCase().includes(search.toLowerCase())
    return text && (department === 'all' || person.department_id === department)
  }), [people.data, search, department])

  const addPerson = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('add_employee_profile', {
        p_department_id: form.department_id || null,
        p_email: form.email.trim() || null,
        p_job_title: form.job_title.trim() || null,
        p_manager_email: form.manager_email.trim() || null,
        p_name: form.name.trim(),
        p_role: form.role,
        p_team_id: form.team_id || null,
        p_weekly_capacity_hours: Number(form.weekly_capacity_hours),
      })
      if (rpcError) throw rpcError
      await queryClient.invalidateQueries({ queryKey: ['people', organization?.id] })
      setModalOpen(false)
      setForm({ name: '', email: '', job_title: '', role: 'employee', department_id: '', team_id: '', manager_email: '', weekly_capacity_hours: '40' })
      showToast('Employee profile created.', 'success')
    } catch (caught) { setError(getErrorMessage(caught)) } finally { setSubmitting(false) }
  }

  const departmentMap = new Map((departments.data ?? []).map((item) => [item.id, item.name]))
  const teamMap = new Map((teams.data ?? []).map((item) => [item.id, item.name]))

  return <><PageHeader title="People" description="Manage employee profiles, access roles, teams, managers and capacity." actions={canManage ? <button className="primary-button" onClick={() => { setError(''); setModalOpen(true) }}><UserRoundPlus size={16} />Add employee</button> : undefined} />
    <section className="mini-stat-grid"><div><span>People</span><strong>{people.data?.length ?? 0}</strong></div><div><span>Departments</span><strong>{departments.data?.length ?? 0}</strong></div><div><span>Teams</span><strong>{teams.data?.length ?? 0}</strong></div><div><span>Weekly capacity</span><strong>{(people.data ?? []).reduce((sum, person) => sum + Number(person.weekly_capacity_hours), 0)}h</strong></div></section>
    <div className="toolbar"><div className="toolbar-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people…" /></div><select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="all">All departments</option>{(departments.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
    {filtered.length === 0 && !people.isLoading ? <EmptyState icon={UsersRound} title="No people found" description="Create employee profiles or adjust the current filters." /> : <div className="table-card"><table><thead><tr><th>Person</th><th>Role</th><th>Department</th><th>Team</th><th>Capacity</th><th>Status</th></tr></thead><tbody>{filtered.map((person) => <tr key={person.id}><td><div className="person-cell"><Avatar name={person.full_name} src={person.avatar_url} /><span><strong>{person.full_name}</strong><small>{person.job_title ?? 'No job title'} · {person.email ?? 'No email'}</small></span></div></td><td><span className="role-pill">{person.access_role.replace('_', ' ')}</span></td><td>{person.department_id ? departmentMap.get(person.department_id) ?? '—' : '—'}</td><td>{person.team_id ? teamMap.get(person.team_id) ?? '—' : '—'}</td><td>{person.weekly_capacity_hours}h/week</td><td><StatusBadge value={person.status} /></td></tr>)}</tbody></table></div>}
    <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add employee profile" size="lg"><form className="form-grid" onSubmit={(event) => void addPerson(event)}><label className="field field-span-2"><span>Full name</span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Employee name" /></label><label className="field"><span>Email</span><div className="input-with-icon"><Mail size={16} /><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="employee@company.com" /></div></label><label className="field"><span>Job title</span><input value={form.job_title} onChange={(event) => setForm({ ...form, job_title: event.target.value })} placeholder="Marketing Executive" /></label><label className="field"><span>Access role</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}><option value="employee">Employee</option><option value="team_lead">Team lead</option><option value="manager">Manager</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select></label><label className="field"><span>Weekly capacity</span><input type="number" min="1" max="168" value={form.weekly_capacity_hours} onChange={(event) => setForm({ ...form, weekly_capacity_hours: event.target.value })} /></label><label className="field"><span>Department</span><select value={form.department_id} onChange={(event) => setForm({ ...form, department_id: event.target.value, team_id: '' })}><option value="">No department</option>{(departments.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field"><span>Team</span><select value={form.team_id} onChange={(event) => setForm({ ...form, team_id: event.target.value })}><option value="">No team</option>{(teams.data ?? []).filter((item) => !form.department_id || item.department_id === form.department_id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field field-span-2"><span>Manager email</span><input type="email" value={form.manager_email} onChange={(event) => setForm({ ...form, manager_email: event.target.value })} placeholder="manager@company.com (optional)" /></label>{error && <div className="form-message error field-span-2">{error}</div>}<div className="form-actions field-span-2"><button type="button" className="secondary-button" onClick={() => setModalOpen(false)}>Cancel</button><button className="primary-button" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}Add employee</button></div></form></Modal>
  </>
}
