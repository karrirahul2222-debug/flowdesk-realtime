import { useState } from 'react'
import { Building2, LoaderCircle, Rocket, ShieldCheck } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useToast } from '@/contexts/ToastContext'
import { getErrorMessage } from '@/lib/errors'

export function WorkspaceSetupPage() {
  const workspace = useWorkspace()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!workspace.loading && workspace.memberships.length > 0) return <Navigate to="/" replace />

  const createWorkspace = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('create_workspace', { p_name: name.trim(), p_timezone: timezone })
      if (rpcError) throw rpcError
      await workspace.refetch()
      showToast('Workspace created successfully.', 'success')
      navigate('/', { replace: true })
    } catch (caught) {
      setError(getErrorMessage(caught))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="setup-page">
      <div className="setup-card">
        <div className="setup-icon"><Rocket size={28} /></div>
        <span className="eyebrow">FIRST-TIME SETUP</span>
        <h1>Create your FlowDesk workspace</h1>
        <p>This becomes the secure tenant for your people, projects, tasks, files and automation.</p>
        <form onSubmit={(event) => void createWorkspace(event)}>
          <label className="field"><span>Company or workspace name</span><div className="input-with-icon"><Building2 size={17} /><input autoFocus required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Rahul Automation Network" /></div></label>
          <label className="field"><span>Timezone</span><select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="Asia/Kolkata">Asia/Kolkata (IST)</option><option value="UTC">UTC</option><option value="America/New_York">America/New York</option><option value="Europe/London">Europe/London</option></select></label>
          {error && <div className="form-message error">{error}</div>}
          <button className="primary-button full-width" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={17} /> : <><ShieldCheck size={17} />Create secure workspace</>}</button>
        </form>
        <small>This action uses one atomic database function, preventing the duplicate empty workspaces created by the old onboarding flow.</small>
      </div>
    </div>
  )
}
