import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircleMore, Send } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Avatar } from '@/components/Avatar'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useWorkspaceChat } from '@/hooks/useWorkspaceChat'
import { getErrorMessage } from '@/lib/errors'

function messageTime(value: string) {
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export function WorkspaceChatPage() {
  const { organization } = useWorkspace()
  const chat = useWorkspaceChat()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const listEnd = useRef<HTMLDivElement>(null)
  const typingStop = useRef<number | null>(null)
  const memberByUser = useMemo(() => new Map((chat.data?.members ?? []).flatMap((member) => member.auth_user_id ? [[member.auth_user_id, member]] : [])), [chat.data?.members])

  useEffect(() => { listEnd.current?.scrollIntoView({ block: 'end' }) }, [chat.data?.messages.length])

  const submit = async () => {
    const message = draft.trim()
    if (!message || sending) return
    setSending(true)
    setError('')
    try {
      await chat.sendMessage(message)
      await chat.setTyping(false)
      setDraft('')
    } catch (caught) {
      setError(getErrorMessage(caught))
    } finally {
      setSending(false)
    }
  }

  return <>
    <PageHeader
      eyebrow={organization?.name ?? 'Workspace'}
      title="Workspace chat"
      description="One shared, real-time conversation for every active member of this workspace."
    />
    <section className="workspace-chat panel" aria-label="Workspace chat messages">
      <div className="workspace-chat-heading"><div><MessageCircleMore size={19} /><div><h2>Everyone</h2><p>{chat.onlineUserIds.length} online · managers, employees and active members.</p></div></div><span>{chat.data?.members.length ?? 0} members</span></div>
      {chat.isLoading ? <div className="workspace-chat-loading" aria-busy="true"><i /><i /><i /></div> : chat.isError ? <div className="workspace-chat-state"><strong>Chat could not be loaded</strong><p>{getErrorMessage(chat.error)}</p><button className="secondary-button" onClick={() => void chat.refetch()}>Retry</button></div> : <div className="workspace-chat-messages" aria-live="polite">
        {(chat.data?.messages ?? []).length === 0 ? <div className="workspace-chat-state"><MessageCircleMore size={26} /><strong>Start the conversation</strong><p>Your message will be visible to every active workspace member.</p></div> : (chat.data?.messages ?? []).map((message) => {
          const member = memberByUser.get(message.author_user_id)
          const ownMessage = message.author_user_id === chat.currentUserId
          const name = ownMessage ? 'You' : member?.full_name ?? 'Workspace member'
          return <article className={`workspace-message ${ownMessage ? 'workspace-message-own' : ''}`} key={message.id}>
            {!ownMessage && <Avatar name={name} src={member?.avatar_url} size="sm" />}
            <div><div className="workspace-message-meta"><strong>{name}</strong><time dateTime={message.created_at}>{messageTime(message.created_at)}</time></div><p>{message.body}</p></div>
          </article>
        })}
        <div ref={listEnd} />
      </div>}
      {chat.typingUserIds.length > 0 && <p className="muted-block" aria-live="polite">Someone is typing…</p>}
      <form className="workspace-chat-compose" onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <label className="sr-only" htmlFor="workspace-chat-message">Message everyone</label>
        <textarea id="workspace-chat-message" value={draft} maxLength={4000} onChange={(event) => { const value = event.target.value; setDraft(value); void chat.setTyping(Boolean(value.trim())); if (typingStop.current) window.clearTimeout(typingStop.current); typingStop.current = window.setTimeout(() => void chat.setTyping(false), 1200) }} onBlur={() => void chat.setTyping(false)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void submit() }} placeholder="Message everyone in this workspace…" rows={2} disabled={sending || chat.isLoading || chat.isError} />
        <button className="primary-button" type="submit" disabled={!draft.trim() || sending || chat.isLoading || chat.isError}><Send size={16} />{sending ? 'Sending…' : 'Send'}</button>
      </form>
      {error && <p className="workspace-chat-error" role="alert">{error}</p>}
    </section>
  </>
}
