import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import type { Task } from '@/types/models'

interface TaskFilters {
  projectId?: string
  status?: string
  sprintId?: string | null
}

export function useTasks(filters: TaskFilters = {}) {
  const { organization, canLoadWorkspaceData } = useWorkspace()
  return useQuery({
    queryKey: ['tasks', organization?.id, filters],
    queryFn: async (): Promise<Task[]> => {
      let query = supabase
        .from('tasks')
        .select('*,project:projects!tasks_project_id_fkey(id,name,code),assignees:task_assignees!task_assignees_task_id_fkey(person_id,person:people!task_assignees_person_id_fkey(id,full_name,avatar_url))')
        .eq('organization_id', organization!.id)
        .order('created_at', { ascending: false })

      if (filters.projectId) query = query.eq('project_id', filters.projectId)
      if (filters.status) query = query.eq('status', filters.status)
      if (filters.sprintId === null) query = query.is('sprint_id', null)
      else if (filters.sprintId) query = query.eq('sprint_id', filters.sprintId)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as unknown as Task[]
    },
    enabled: canLoadWorkspaceData && Boolean(organization),
    retry: false,
  })
}
