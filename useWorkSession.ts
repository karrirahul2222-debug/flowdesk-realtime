import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { env } from '@/lib/env'

export function useWorkSession() {
  const { user } = useAuth()
  const { organization, canLoadWorkspaceData } = useWorkspace()
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const enabled = env.attendanceEnabled && canLoadWorkspaceData && Boolean(organization && user)

  const query = useQuery({
    queryKey: ['work-session', organization?.id, user?.id],
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_active_work_session')
      if (error) {
        if (/schema cache|work_sessions/i.test(error.message)) {
          throw new Error('Attendance setup is not available yet. Ask an administrator to complete the database migration.')
        }
        throw error
      }
      return data
    },
  })

  const invoke = useCallback(async (name: string, args = {}) => {
    if (!env.attendanceEnabled) return null
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc(name, args)
      if (error) throw error
      await client.invalidateQueries({ queryKey: ['work-session', organization?.id, user?.id] })
      return data
    } finally {
      setBusy(false)
    }
  }, [client, organization?.id, user?.id])

  useEffect(() => {
    if (!enabled || !organization || !user || !query.data) return

    const heartbeat = window.setInterval(() => void invoke('heartbeat_work_session'), 90_000)
    const channel = supabase
      .channel(`flowdesk:attendance:${organization.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_sessions', filter: `organization_id=eq.${organization.id}` }, () => {
        void client.invalidateQueries({ queryKey: ['work-session', organization.id, user.id] })
      })
      .subscribe()
    const activity = () => void invoke('heartbeat_work_session')
    document.addEventListener('visibilitychange', activity)

    return () => {
      window.clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', activity)
      void supabase.removeChannel(channel)
    }
  }, [client, enabled, invoke, organization?.id, query.data?.id, user?.id])

  return { session: query.data, busy, error: query.error, invoke, refetch: query.refetch, enabled }
}
