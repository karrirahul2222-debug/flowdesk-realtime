import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Database, KeyRound, LoaderCircle, Plus, Save, ShieldCheck, Trash2, UsersRound } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useDepartments, useTeams } from '@/hooks/usePeople'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/errors'

export function SettingsPage() {
  const workspace = useWorkspace()
  const { user } = useAuth()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const departments = useDepartments()
  const teams = useTeams()
  const [active, setActive] = useState<'workspace' | 'structure' | 'security'>('workspace')
  const [workspaceForm, setWorkspaceForm] = useState({ name: '', timezone: 'Asia/Kolkata' })
  const [departmentName, setDepartmentName] = useState('')
  const [teamForm, setTeamForm] = useState({ name: '', department_id: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    if (workspace.organization) setWorkspaceForm({ name: workspace.organization.name, timezone: workspace.organization.timezone })
  }, [workspace.organization])

  const saveWorkspace = useMutation({
    mutationFn: async () => {
      const { error: updateError } = await supabase.from('organizations').update({ name: workspaceForm.name.trim(), timezone: workspaceForm.timezone }).eq('id', workspace.organization!.id)
      if (updateError) throw updateError
    },
    onSuccess: async () => { await workspace.refetch(); showToast('Workspace settings saved.', 'success') },
    onError: (caught) => setError(getErrorMessage(caught)),
  })

  const addDepartment = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      const { error: insertError } = await supabase.from('departments').insert({ organization_id: workspace.organization!.id, name: departmentName.trim(), created_by: user!.id })
      if (insertError) throw insertError
      setDepartmentName('')
      await queryClient.invalidateQueries({ queryKey: ['departments', workspace.organization?.id] })
      showToast('Department created.', 'success')
    } catch (caught) { setError(getErrorMessage(caught)) }
  }

  const addTeam = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      const { error: insertError } = await supabase.from('teams').insert({ organization_id: workspace.organization!.id, name: teamForm.name.trim(), department_id: teamForm.department_id || null, created_by: user!.id })
      if (insertError) throw insertError
      setTeamForm({ name: '', department_id: '' })
      await queryClient.invalidateQueries({ queryKey: ['teams', workspace.organization?.id] })
      showToast('Team created.', 'success')
    } catch (caught) { setError(getErrorMessage(caught)) }
  }

  const removeStructure = async (table: 'departments' | 'teams', id: string) => {
    try {
      const { error: deleteError } = await supabase.from(table).delete().eq('id', id)
      if (deleteError) throw deleteError
      await queryClient.invalidateQueries({ queryKey: [table, workspace.organization?.id] })
      showToast(`${table === 'teams' ? 'Team' : 'Department'} deleted.`, 'success')
    } catch (caught) { showToast(getErrorMessage(caught), 'error') }
  }

  return <><PageHeader title="Settings" description="Configure the workspace, organization structure and security posture." />
    <div className="settings-layout"><aside className="settings-nav"><button className={active === 'workspace' ? 'active' : ''} onClick={() => setActive('workspace')}><Building2 size={17} />Workspace</button><button className={active === 'structure' ? 'active' : ''} onClick={() => setActive('structure')}><UsersRound size={17} />Departments & teams</button><button className={active === 'security' ? 'active' : ''} onClick={() => setActive('security')}><ShieldCheck size={17} />Security</button></aside>
      <section className="settings-panel">
        {active === 'workspace' && <><div className="settings-heading"><h2>Workspace details</h2><p>These values are shown throughout FlowDesk.</p></div><form className="settings-form" onSubmit={(event) => { event.preventDefault(); setError(''); saveWorkspace.mutate() }}><label className="field"><span>Workspace name</span><input required value={workspaceForm.name} onChange={(event) => setWorkspaceForm({ ...workspaceForm, name: event.target.value })} /></label><label className="field"><span>Timezone</span><select value={workspaceForm.timezone} onChange={(event) => setWorkspaceForm({ ...workspaceForm, timezone: event.target.value })}><option value="Asia/Kolkata">Asia/Kolkata</option><option value="UTC">UTC</option><option value="America/New_York">America/New York</option><option value="Europe/London">Europe/London</option></select></label>{error && <div className="form-message error">{error}</div>}<button className="primary-button" disabled={saveWorkspace.isPending}>{saveWorkspace.isPending ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}Save changes</button></form></>}
        {active === 'structure' && <><div className="settings-heading"><h2>Organization structure</h2><p>Create departments first, then map teams to them.</p></div><div className="structure-grid"><div className="structure-card"><h3>Departments</h3><form className="inline-add" onSubmit={(event) => void addDepartment(event)}><input required value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} placeholder="Department name" /><button className="primary-button"><Plus size={16} /></button></form><div className="structure-list">{(departments.data ?? []).map((item) => <div key={item.id}><span><Building2 size={16} />{item.name}</span><button className="icon-button" onClick={() => void removeStructure('departments', item.id)}><Trash2 size={15} /></button></div>)}</div></div><div className="structure-card"><h3>Teams</h3><form className="stack-form" onSubmit={(event) => void addTeam(event)}><input required value={teamForm.name} onChange={(event) => setTeamForm({ ...teamForm, name: event.target.value })} placeholder="Team name" /><select value={teamForm.department_id} onChange={(event) => setTeamForm({ ...teamForm, department_id: event.target.value })}><option value="">No department</option>{(departments.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="secondary-button"><Plus size={16} />Add team</button></form><div className="structure-list">{(teams.data ?? []).map((item) => <div key={item.id}><span><UsersRound size={16} />{item.name}</span><button className="icon-button" onClick={() => void removeStructure('teams', item.id)}><Trash2 size={15} /></button></div>)}</div></div></div>{error && <div className="form-message error">{error}</div>}</>}
        {active === 'security' && <><div className="settings-heading"><h2>Security checklist</h2><p>FlowDesk relies on Supabase Auth, RLS and a private evidence bucket.</p></div><div className="security-list"><SecurityItem icon={ShieldCheck} title="Row Level Security" description="Enabled on the operational public tables. Keep authorization in database policies, not only hidden UI controls." status="Configured" /><SecurityItem icon={KeyRound} title="Client credentials" description="Use only VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the browser. Never expose a service-role key." status="Required" /><SecurityItem icon={Database} title="Leaked password protection" description="The Supabase advisor currently reports this protection as disabled. Enable it before selling the application." status="Action needed" warning /></div></>}
      </section>
    </div>
  </>
}

function SecurityItem({ icon: Icon, title, description, status, warning = false }: { icon: typeof ShieldCheck; title: string; description: string; status: string; warning?: boolean }) {
  return <div className={`security-item ${warning ? 'warning' : ''}`}><div className="security-item-icon"><Icon size={20} /></div><div><strong>{title}</strong><p>{description}</p></div><span>{status}</span></div>
}
