import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertOctagon, CheckCircle2, Clock3, Download, FileUp, LoaderCircle, MessageSquareText, Send, ShieldCheck } from 'lucide-react'
import { Modal } from './Modal'
import { PriorityBadge } from './PriorityBadge'
import { StatusBadge } from './StatusBadge'
import { Avatar } from './Avatar'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useToast } from '@/contexts/ToastContext'
import { usePeople } from '@/hooks/usePeople'
import { supabase } from '@/lib/supabase'
import { formatDate, formatRelative, minutesToHours } from '@/lib/format'
import { getErrorMessage } from '@/lib/errors'
import { createTaskEvidencePath, storageErrorMessage, TASK_EVIDENCE_BUCKET, taskEvidenceAccept, validateTaskEvidence } from '@/lib/storage'
import type { Approval, Blocker, Person, Task, TaskComment, TaskEvidence, TimeEntry } from '@/types/models'

interface TaskDetailModalProps {
  task: Task | null
  onClose: () => void
  onEdit?: (task: Task) => void
}

export function TaskDetailModal({ task, onClose, onEdit }: TaskDetailModalProps) {
  const { user } = useAuth()
  const { organization, role } = useWorkspace()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const people = usePeople()
  const [comment, setComment] = useState('')
  const [timeMinutes, setTimeMinutes] = useState('')
  const [timeNote, setTimeNote] = useState('')
  const [blockerReason, setBlockerReason] = useState('')
  const [approvalMessage, setApprovalMessage] = useState('')
  const [reviewerUserId, setReviewerUserId] = useState('')
  const [fileNote, setFileNote] = useState('')
  const [actionError, setActionError] = useState('')
  const [evidenceUpload, setEvidenceUpload] = useState<{ progress: number; label: string } | null>(null)
  const [retryEvidence, setRetryEvidence] = useState<File | null>(null)
  const evidenceInput = useRef<HTMLInputElement>(null)
  const evidenceUploadInFlight = useRef(false)

  useEffect(() => {
    if (!task) return
    setComment('')
    setTimeMinutes('')
    setTimeNote('')
    setBlockerReason('')
    setApprovalMessage('')
    setReviewerUserId('')
    setFileNote('')
    setActionError('')
    setEvidenceUpload(null)
    setRetryEvidence(null)
  }, [task])

  const activity = useQuery({
    queryKey: ['task-detail', task?.id],
    queryFn: async () => {
      const [comments, time, blockers, approvals, evidence] = await Promise.all([
        supabase.from('task_comments').select('*').eq('task_id', task!.id).order('created_at'),
        supabase.from('task_time_entries').select('*').eq('task_id', task!.id).order('entry_date', { ascending: false }),
        supabase.from('task_blockers').select('*').eq('task_id', task!.id).order('created_at', { ascending: false }),
        supabase.from('task_approvals').select('*').eq('task_id', task!.id).order('requested_at', { ascending: false }),
        supabase.from('task_evidence').select('*').eq('task_id', task!.id).order('created_at', { ascending: false }),
      ])
      const failed = [comments.error, time.error, blockers.error, approvals.error, evidence.error].find(Boolean)
      if (failed) throw failed
      return {
        comments: (comments.data ?? []) as TaskComment[],
        time: (time.data ?? []) as TimeEntry[],
        blockers: (blockers.data ?? []) as Blocker[],
        approvals: (approvals.data ?? []) as Approval[],
        evidence: (evidence.data ?? []) as TaskEvidence[],
      }
    },
    enabled: Boolean(task),
  })

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['task-detail', task?.id] }),
      queryClient.invalidateQueries({ queryKey: ['tasks', organization?.id] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard', organization?.id] }),
    ])
  }

  const actionMutation = useMutation({
    mutationFn: async (action: 'comment' | 'time' | 'blocker' | 'approval') => {
      if (!task || !organization || !user) throw new Error('Task session is unavailable.')
      if (action === 'comment') {
        const { error } = await supabase.from('task_comments').insert({ organization_id: organization.id, task_id: task.id, author_user_id: user.id, body: comment.trim() })
        if (error) throw error
      }
      if (action === 'time') {
        const minutes = Number(timeMinutes)
        if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) throw new Error('Enter minutes between 1 and 1440.')
        const { error } = await supabase.from('task_time_entries').insert({ organization_id: organization.id, task_id: task.id, user_id: user.id, minutes, note: timeNote.trim() || null })
        if (error) throw error
      }
      if (action === 'blocker') {
        const { error } = await supabase.rpc('report_task_blocker', { p_reason: blockerReason.trim(), p_task_id: task.id })
        if (error) throw error
      }
      if (action === 'approval') {
        const { error } = await supabase.from('task_approvals').insert({
          organization_id: organization.id,
          task_id: task.id,
          requested_by: user.id,
          reviewer_user_id: reviewerUserId || null,
          request_message: approvalMessage.trim() || null,
        })
        if (error) throw error
        const { error: statusError } = await supabase.from('tasks').update({ status: 'review' }).eq('id', task.id)
        if (statusError) throw statusError
      }
    },
    onSuccess: async (_data, action) => {
      await invalidate()
      if (action === 'comment') setComment('')
      if (action === 'time') { setTimeMinutes(''); setTimeNote('') }
      if (action === 'blocker') setBlockerReason('')
      if (action === 'approval') { setApprovalMessage(''); setReviewerUserId('') }
      showToast('Task activity updated.', 'success')
    },
    onError: (caught) => setActionError(getErrorMessage(caught)),
  })

  const totalMinutes = useMemo(() => (activity.data?.time ?? []).reduce((sum, item) => sum + item.minutes, 0), [activity.data?.time])
  const peopleByAuth = useMemo(() => new Map<string, Person>((people.data ?? []).filter((person) => person.auth_user_id).map((person) => [person.auth_user_id!, person] as const)), [people.data])

  const uploadEvidence = async (file: File | undefined) => {
    if (!file || !task || !organization || !user || evidenceUploadInFlight.current) return
    evidenceUploadInFlight.current = true
    setActionError('')
    setRetryEvidence(null)
    let uploadStarted = false
    try {
      setEvidenceUpload({ progress: 10, label: 'Validating file…' })
      const { mimeType, safeName } = validateTaskEvidence(file)
      const path = createTaskEvidencePath(organization.id, task.project_id, task.id, safeName)
      setEvidenceUpload({ progress: 35, label: 'Uploading private file…' })
      uploadStarted = true
      const { error: uploadError } = await supabase.storage.from(TASK_EVIDENCE_BUCKET).upload(path, file, { contentType: mimeType, upsert: false })
      if (uploadError) throw uploadError
      setEvidenceUpload({ progress: 80, label: 'Saving file metadata…' })
      const { error: rowError } = await supabase.from('task_evidence').insert({
        organization_id: organization.id, task_id: task.id, uploaded_by: user.id, file_name: file.name,
        storage_path: path, mime_type: mimeType, file_size: file.size, note: fileNote.trim() || null,
      })
      if (rowError) {
        const { error: cleanupError } = await supabase.storage.from(TASK_EVIDENCE_BUCKET).remove([path])
        if (cleanupError) throw new Error(`${rowError.message} The uploaded object could not be cleaned up: ${cleanupError.message}`)
        throw rowError
      }
      setEvidenceUpload({ progress: 100, label: 'Upload complete.' })
      setFileNote('')
      if (evidenceInput.current) evidenceInput.current.value = ''
      await invalidate()
      showToast('Evidence uploaded securely.', 'success')
    } catch (caught) {
      setActionError(storageErrorMessage(caught))
      if (uploadStarted) setRetryEvidence(file)
    } finally {
      setEvidenceUpload(null)
      evidenceUploadInFlight.current = false
    }
  }

  const downloadEvidence = async (item: TaskEvidence) => {
    const { data, error } = await supabase.storage.from(TASK_EVIDENCE_BUCKET).createSignedUrl(item.storage_path, 60)
    if (error) { setActionError(storageErrorMessage(error)); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const decideApproval = async (approval: Approval, status: 'approved' | 'rejected') => {
    setActionError('')
    try {
      const { error } = await supabase.from('task_approvals').update({ status, decided_at: new Date().toISOString(), decision_note: status === 'approved' ? 'Approved in FlowDesk' : 'Changes requested in FlowDesk' }).eq('id', approval.id)
      if (error) throw error
      if (status === 'approved') {
        const { error: taskError } = await supabase.from('tasks').update({ status: 'done', progress: 100 }).eq('id', task!.id)
        if (taskError) throw taskError
      }
      await invalidate()
      showToast(`Work ${status}.`, 'success')
    } catch (caught) { setActionError(getErrorMessage(caught)) }
  }

  if (!task) return null
  const canManage = ['ceo', 'admin', 'manager', 'team_lead'].includes(role ?? '')

  return (
    <Modal open={Boolean(task)} onClose={onClose} title={task.title} size="xl">
      <div className="task-detail-heading">
        <div className="task-meta-line"><span className="issue-key">{task.project?.code ?? 'TASK'}-{task.id.slice(0, 5).toUpperCase()}</span><StatusBadge value={task.status} /><PriorityBadge value={task.priority} />{task.issue_type && <span className="issue-type">{task.issue_type}</span>}</div>
        <div className="task-detail-actions">{onEdit && canManage && <button className="secondary-button" onClick={() => onEdit(task)}>Edit task</button>}</div>
      </div>

      <div className="task-detail-grid">
        <section className="task-main">
          <div className="detail-section"><h3>Description</h3><p className={task.description ? '' : 'muted'}>{task.description || 'No description has been added.'}</p></div>
          {task.acceptance_criteria && <div className="detail-section"><h3>Acceptance criteria</h3><p className="preserve-lines">{task.acceptance_criteria}</p></div>}

          <div className="detail-section">
            <h3><MessageSquareText size={17} />Comments</h3>
            <div className="comment-list">
              {(activity.data?.comments ?? []).map((item) => {
                const author = peopleByAuth.get(item.author_user_id)
                return <div className="comment-item" key={item.id}><Avatar name={author?.full_name ?? 'User'} src={author?.avatar_url} size="sm" /><div><div className="comment-head"><strong>{author?.full_name ?? 'Workspace member'}</strong><span>{formatRelative(item.created_at)}</span></div><p>{item.body}</p></div></div>
              })}
              {!activity.isLoading && (activity.data?.comments ?? []).length === 0 && <p className="muted-block">No comments yet.</p>}
            </div>
            <form className="inline-composer" onSubmit={(event) => { event.preventDefault(); actionMutation.mutate('comment') }}><textarea required maxLength={5000} rows={2} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add context, feedback or a decision…" /><button className="primary-button" disabled={actionMutation.isPending || !comment.trim()}><Send size={16} />Comment</button></form>
          </div>

          <div className="detail-section">
            <h3><FileUp size={17} />Evidence</h3>
            <div className="evidence-upload"><input value={fileNote} disabled={Boolean(evidenceUpload)} onChange={(event) => setFileNote(event.target.value)} placeholder="Optional evidence note" /><label className="secondary-button file-button"><FileUp size={16} />{evidenceUpload ? 'Uploading…' : 'Upload file'}<input ref={evidenceInput} type="file" accept={taskEvidenceAccept} disabled={Boolean(evidenceUpload)} onChange={(event) => void uploadEvidence(event.target.files?.[0])} /></label></div>
            <p className="muted-block">Up to 10 MB: PDF, PNG, JPG, WEBP, TXT, CSV, Word, or Excel. Video files are not accepted.</p>
            {evidenceUpload && <div className="upload-progress" role="status" aria-live="polite"><progress value={evidenceUpload.progress} max="100" aria-label="Evidence upload progress" /> <span>{evidenceUpload.label}</span></div>}
            {retryEvidence && !evidenceUpload && <button className="text-button" onClick={() => void uploadEvidence(retryEvidence)}>Retry upload</button>}
            <div className="evidence-list">{(activity.data?.evidence ?? []).map((item) => <div key={item.id} className="evidence-item"><div><strong>{item.file_name}</strong><span>{item.note || formatRelative(item.created_at)}</span></div><button className="icon-button" onClick={() => void downloadEvidence(item)} aria-label={`Download ${item.file_name}`}><Download size={17} /></button></div>)}{(activity.data?.evidence ?? []).length === 0 && <p className="muted-block">No evidence uploaded.</p>}</div>
          </div>
        </section>

        <aside className="task-side">
          <div className="side-card">
            <h3>Work item</h3>
            <dl className="detail-list"><div><dt>Project</dt><dd>{task.project?.name ?? 'Project'}</dd></div><div><dt>Progress</dt><dd>{task.progress}%</dd></div><div><dt>Story points</dt><dd>{task.story_points ?? '—'}</dd></div><div><dt>Estimate</dt><dd>{task.estimated_hours ? `${task.estimated_hours}h` : '—'}</dd></div><div><dt>Time logged</dt><dd>{minutesToHours(totalMinutes)}</dd></div><div><dt>Start</dt><dd>{formatDate(task.start_date, '—')}</dd></div><div><dt>Due</dt><dd>{formatDate(task.due_date, '—')}</dd></div></dl>
            <div className="assignee-stack"><span>Assignees</span><div>{(task.assignees ?? []).map((item) => <Avatar key={item.person_id} name={item.person?.full_name ?? 'User'} src={item.person?.avatar_url} size="sm" />)}{(task.assignees ?? []).length === 0 && <small>Unassigned</small>}</div></div>
          </div>

          <div className="side-card"><h3><Clock3 size={17} />Log time</h3><form className="stack-form" onSubmit={(event) => { event.preventDefault(); actionMutation.mutate('time') }}><input type="number" required min="1" max="1440" value={timeMinutes} onChange={(event) => setTimeMinutes(event.target.value)} placeholder="Minutes" /><input value={timeNote} onChange={(event) => setTimeNote(event.target.value)} placeholder="What did you work on?" /><button className="secondary-button" disabled={actionMutation.isPending}>Add time entry</button></form></div>

          <div className="side-card"><h3><AlertOctagon size={17} />Blocker</h3><form className="stack-form" onSubmit={(event) => { event.preventDefault(); actionMutation.mutate('blocker') }}><textarea required minLength={2} rows={2} value={blockerReason} onChange={(event) => setBlockerReason(event.target.value)} placeholder="Describe what is blocking progress…" /><button className="danger-outline-button" disabled={actionMutation.isPending}>Report blocker</button></form>{(activity.data?.blockers ?? []).filter((item) => item.status === 'open').map((item) => <div className="blocker-alert" key={item.id}><strong>Open blocker</strong><p>{item.reason}</p></div>)}</div>

          <div className="side-card"><h3><ShieldCheck size={17} />Review & approval</h3><form className="stack-form" onSubmit={(event) => { event.preventDefault(); actionMutation.mutate('approval') }}><select value={reviewerUserId} onChange={(event) => setReviewerUserId(event.target.value)}><option value="">Any authorized reviewer</option>{(people.data ?? []).filter((person) => person.auth_user_id).map((person) => <option key={person.id} value={person.auth_user_id!}>{person.full_name}</option>)}</select><textarea rows={2} value={approvalMessage} onChange={(event) => setApprovalMessage(event.target.value)} placeholder="Message for reviewer…" /><button className="secondary-button" disabled={actionMutation.isPending}>Submit for review</button></form>{(activity.data?.approvals ?? []).map((approval) => <div className="approval-row" key={approval.id}><div><StatusBadge value={approval.status} /><small>{formatRelative(approval.requested_at)}</small></div>{approval.status === 'pending' && canManage && <div><button className="approve-button" onClick={() => void decideApproval(approval, 'approved')}><CheckCircle2 size={14} />Approve</button><button className="reject-button" onClick={() => void decideApproval(approval, 'rejected')}>Reject</button></div>}</div>)}</div>

          {actionError && <div className="form-message error">{actionError}</div>}
          {activity.isLoading && <div className="inline-loading"><LoaderCircle className="spin" size={18} />Loading activity…</div>}
        </aside>
      </div>
    </Modal>
  )
}
