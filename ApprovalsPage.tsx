import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Clock3, MessageSquare, ShieldCheck, X } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { PriorityBadge } from '@/components/PriorityBadge'
import { EmptyState } from '@/components/EmptyState'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { supabase } from '@/lib/supabase'
import { formatDate, formatRelative } from '@/lib/format'
import { getErrorMessage } from '@/lib/errors'
import { hasMinimumRole, type Approval } from '@/types/models'

export function ApprovalsPage() {
  const { organization, role, canLoadWorkspaceData } = useWorkspace()
  const { user } = useAuth()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'pending' | 'decided' | 'mine'>('pending')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const canReview = hasMinimumRole(role, 'team_lead')

  const query = useQuery({
    queryKey: ['approvals', organization?.id],
    queryFn: async (): Promise<Approval[]> => {
      const { data, error } = await supabase
        .from('task_approvals')
        .select('*,task:tasks!task_approvals_task_id_fkey(id,title,status,priority,project_id)')
        .eq('organization_id', organization!.id)
        .order('requested_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Approval[]
    },
    enabled: canLoadWorkspaceData && Boolean(organization),
    retry: false,
  })

  const filtered = useMemo(() => (query.data ?? []).filter((approval) => {
    if (tab === 'pending') return approval.status === 'pending'
    if (tab === 'decided') return approval.status !== 'pending'
    return approval.requested_by === user?.id
  }), [query.data, tab, user?.id])

  const decide = async (approval: Approval, status: 'approved' | 'rejected') => {
    try {
      const note = notes[approval.id]?.trim() || (status === 'approved' ? 'Approved' : 'Changes requested')
      const { error } = await supabase.from('task_approvals').update({ status, decision_note: note, decided_at: new Date().toISOString() }).eq('id', approval.id)
      if (error) throw error
      const taskUpdate = status === 'approved' ? { status: 'done', progress: 100 } : { status: 'in_progress' }
      const { error: taskError } = await supabase.from('tasks').update(taskUpdate).eq('id', approval.task_id)
      if (taskError) throw taskError
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['approvals', organization?.id] }),
        queryClient.invalidateQueries({ queryKey: ['tasks', organization?.id] }),
      ])
      showToast(`Work ${status}.`, 'success')
    } catch (caught) { showToast(getErrorMessage(caught), 'error') }
  }

  return <><PageHeader title="Approvals" description="Review submitted work, record decisions and keep delivery moving." />
    <div className="tabs"><button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>Pending <span>{(query.data ?? []).filter((item) => item.status === 'pending').length}</span></button><button className={tab === 'decided' ? 'active' : ''} onClick={() => setTab('decided')}>Decision history</button><button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>My submissions</button></div>
    {filtered.length === 0 && !query.isLoading ? <EmptyState icon={ShieldCheck} title="No approvals in this view" description="Submitted work and review decisions will appear here." /> : <div className="approval-grid">{filtered.map((approval) => <article className="approval-card" key={approval.id}><header><div className="approval-icon"><ShieldCheck size={20} /></div><div><span className="issue-key">TASK-{approval.task_id.slice(0, 5).toUpperCase()}</span><h2>{approval.task?.title ?? 'Task review'}</h2></div><StatusBadge value={approval.status} /></header><div className="approval-meta"><PriorityBadge value={approval.task?.priority ?? 'medium'} /><span><Clock3 size={15} />Submitted {formatRelative(approval.requested_at)}</span></div>{approval.request_message && <blockquote><MessageSquare size={16} />{approval.request_message}</blockquote>}{approval.status !== 'pending' && <div className="decision-box"><strong>Decision note</strong><p>{approval.decision_note || 'No note recorded.'}</p><small>{formatDate(approval.decided_at)}</small></div>}{approval.status === 'pending' && canReview && (approval.reviewer_user_id === null || approval.reviewer_user_id === user?.id || hasMinimumRole(role, 'manager')) && <div className="approval-decision"><textarea rows={2} value={notes[approval.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [approval.id]: event.target.value }))} placeholder="Add a decision note…" /><div><button className="reject-button" onClick={() => void decide(approval, 'rejected')}><X size={15} />Request changes</button><button className="approve-button" onClick={() => void decide(approval, 'approved')}><Check size={15} />Approve</button></div></div>}</article>)}</div>}
  </>
}
