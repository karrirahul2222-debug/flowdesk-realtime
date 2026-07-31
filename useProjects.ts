import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import type { Project } from '@/types/models'

export function useProjects() {
  const { organization, canLoadWorkspaceData } = useWorkspace()
  return useQuery({
    queryKey: ['projects', organization?.id],
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from('projects')
        .select('*,owner:people!projects_owner_person_id_fkey(id,full_name,avatar_url)')
        .eq('organization_id', organization!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Project[]
    },
    enabled: canLoadWorkspaceData && Boolean(organization),
  })
}
