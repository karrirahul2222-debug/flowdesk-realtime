import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { supabase } from '@/lib/supabase'
import type { WorkspaceMessage } from '@/types/models'

export interface ChatMember {
  auth_user_id: string | null
  full_name: string
  avatar_url: string | null
}

export interface WorkspaceChatData {
  messages: WorkspaceMessage[]
  members: ChatMember[]
}

async function fetchWorkspaceChat(organizationId: string): Promise<WorkspaceChatData> {
  const [messagesResult, membersResult] = await Promise.all([
    supabase
      .from('workspace_messages')
      .select('id,organization_id,author_user_id,body,created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true })
      .limit(200),
    supabase
      .from('people')
      .select('auth_user_id,full_name,avatar_url')
      .eq('organization_id', organizationId)
      .order('full_name'),
  ])
  if (messagesResult.error) throw messagesResult.error
  if (membersResult.error) throw membersResult.error

  return {
    messages: (messagesResult.data ?? []) as WorkspaceMessage[],
    members: (membersResult.data ?? []) as ChatMember[],
  }
}

export function useWorkspaceChat() {
  const { organization, canLoadWorkspaceData } = useWorkspace()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const organizationId = organization?.id
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([])
  const [typingUserIds, setTypingUserIds] = useState<string[]>([])
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lifecycleRef = useRef<Promise<void>>(Promise.resolve())

  const query = useQuery({
    queryKey: ['workspace-chat', organizationId],
    queryFn: () => fetchWorkspaceChat(organizationId!),
    enabled: canLoadWorkspaceData && Boolean(organizationId && user),
    staleTime: 15_000,
  })

  useEffect(() => {
    if (!canLoadWorkspaceData || !organizationId || !user) return
    let disposed = false

    lifecycleRef.current = lifecycleRef.current
      .then(async () => {
        const previous = channelRef.current
        if (previous) await supabase.removeChannel(previous)
        if (disposed) return

        let channel = supabase
          .channel(`flowdesk:chat:${organizationId}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'workspace_messages', filter: `organization_id=eq.${organizationId}` },
            () => { void queryClient.invalidateQueries({ queryKey: ['workspace-chat', organizationId] }) },
          )
          .on('presence', { event: 'sync' }, () => {
            const ids = Object.values(channel.presenceState()).flat().map((entry) => (entry as { user_id?: string }).user_id).filter((id): id is string => Boolean(id))
            setOnlineUserIds([...new Set(ids)])
          })
          .on('broadcast', { event: 'typing' }, ({ payload }) => {
            const event = payload as { user_id?: string; typing?: boolean }
            if (!event.user_id || event.user_id === user.id) return
            setTypingUserIds((current) => event.typing ? [...new Set([...current, event.user_id!])] : current.filter((id) => id !== event.user_id))
          })
        channelRef.current = channel
        channel.subscribe((status) => { if (status === 'SUBSCRIBED') void channel.track({ user_id: user.id }) })
      })
      .catch((error: unknown) => console.error('Realtime chat channel failed', error))

    return () => {
      disposed = true
      setOnlineUserIds([])
      setTypingUserIds([])
      lifecycleRef.current = lifecycleRef.current
        .then(async () => {
          const channel = channelRef.current
          if (!channel) return
          channelRef.current = null
          await supabase.removeChannel(channel)
        })
        .catch((error: unknown) => console.error('Realtime chat channel cleanup failed', error))
    }
  }, [canLoadWorkspaceData, organizationId, queryClient, user])

  const sendMessage = useCallback(async (body: string) => {
    if (!organizationId || !user) throw new Error('Your workspace session is not ready.')
    const { error } = await supabase.from('workspace_messages').insert({
      organization_id: organizationId,
      author_user_id: user.id,
      body: body.trim(),
    })
    if (error) throw error
    await query.refetch()
  }, [organizationId, query, user])

  const setTyping = useCallback(async (typing: boolean) => {
    if (!user || !channelRef.current) return
    await channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { user_id: user.id, typing } })
  }, [user])

  return { ...query, sendMessage, setTyping, onlineUserIds, typingUserIds, currentUserId: user?.id ?? null }
}
