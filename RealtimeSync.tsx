import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { supabase } from '@/lib/supabase'

const tableToQueryRoots: Record<string, string[]> = {
  projects: ['projects', 'dashboard-ops'],
  people: ['people'],
  departments: ['departments'],
  teams: ['teams'],
  tasks: ['tasks', 'dashboard-ops', 'approvals'],
  task_assignees: ['tasks'],
  task_comments: ['task-detail'],
  task_updates: ['task-detail', 'tasks'],
  task_time_entries: ['task-detail', 'dashboard-ops', 'reports-time'],
  task_evidence: ['task-detail'],
  task_blockers: ['task-detail', 'dashboard-ops', 'tasks'],
  task_approvals: ['task-detail', 'dashboard-ops', 'approvals', 'tasks'],
  notifications: ['notifications'],
  sprints: ['backlog-jira', 'jira-options'],
  epics: ['backlog-jira', 'jira-options'],
  labels: ['labels'],
  task_labels: ['task-detail', 'tasks'],
}

export function RealtimeSync() {
  const { organization } = useWorkspace()
  const queryClient = useQueryClient()
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lifecycleRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    if (!organization) return

    let disposed = false
    let debounceId: number | undefined
    const queryRoots = new Set<string>()
    const invalidate = (roots: string[]) => {
      roots.forEach((root) => queryRoots.add(root))
      if (debounceId) window.clearTimeout(debounceId)
      debounceId = window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['dashboard-metrics', organization.id] })
        for (const root of queryRoots) void queryClient.invalidateQueries({ queryKey: [root] })
        queryRoots.clear()
      }, 600)
    }

    lifecycleRef.current = lifecycleRef.current
      .then(async () => {
        const previous = channelRef.current
        if (previous) await supabase.removeChannel(previous)
        if (disposed) return

        let channel = supabase.channel(`flowdesk:org:${organization.id}`)
        for (const [table, roots] of Object.entries(tableToQueryRoots)) {
          channel = channel.on(
            'postgres_changes',
            { event: '*', schema: 'public', table, filter: `organization_id=eq.${organization.id}` },
            () => invalidate(roots),
          )
        }
        channelRef.current = channel
        channel.subscribe()
      })
      .catch((error: unknown) => console.error('Realtime workspace channel failed', error))

    return () => {
      disposed = true
      if (debounceId) window.clearTimeout(debounceId)
      lifecycleRef.current = lifecycleRef.current
        .then(async () => {
          const channel = channelRef.current
          if (!channel) return
          channelRef.current = null
          await supabase.removeChannel(channel)
        })
        .catch((error: unknown) => console.error('Realtime workspace channel cleanup failed', error))
    }
  }, [organization?.id, queryClient])

  return null
}
