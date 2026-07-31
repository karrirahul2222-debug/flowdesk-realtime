import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import type { Department, Person, Team } from '@/types/models'

interface DataLoadOptions {
  enabled?: boolean
}

export function usePeople(options: DataLoadOptions = {}) {
  const { organization, canLoadWorkspaceData } = useWorkspace()
  return useQuery({
    queryKey: ['people', organization?.id],
    queryFn: async (): Promise<Person[]> => {
      const { data, error } = await supabase.from('people').select('*').eq('organization_id', organization!.id).order('full_name')
      if (error) throw error
      return (data ?? []) as Person[]
    },
    enabled: canLoadWorkspaceData && Boolean(organization) && options.enabled !== false,
  })
}

export function useDepartments() {
  const { organization, canLoadWorkspaceData } = useWorkspace()
  return useQuery({
    queryKey: ['departments', organization?.id],
    queryFn: async (): Promise<Department[]> => {
      const { data, error } = await supabase.from('departments').select('*').eq('organization_id', organization!.id).order('name')
      if (error) throw error
      return (data ?? []) as Department[]
    },
    enabled: canLoadWorkspaceData && Boolean(organization),
  })
}

export function useTeams() {
  const { organization, canLoadWorkspaceData } = useWorkspace()
  return useQuery({
    queryKey: ['teams', organization?.id],
    queryFn: async (): Promise<Team[]> => {
      const { data, error } = await supabase.from('teams').select('*').eq('organization_id', organization!.id).order('name')
      if (error) throw error
      return (data ?? []) as Team[]
    },
    enabled: canLoadWorkspaceData && Boolean(organization),
  })
}
