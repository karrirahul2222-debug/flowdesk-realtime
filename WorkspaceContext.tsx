import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from './AuthContext'
import { supabase } from '@/lib/supabase'
import { logPerformance } from '@/lib/performance'
import type { Membership, Organization, Role } from '@/types/models'

interface WorkspaceContextValue {
  memberships: Membership[]
  currentMembership: Membership | null
  organization: Organization | null
  role: Role | null
  loading: boolean
  error: Error | null
  canLoadWorkspaceData: boolean
  setCurrentOrganization: (organizationId: string) => void
  refetch: () => Promise<unknown>
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined)
const storageKey = 'flowdesk.currentOrganizationId'

async function fetchMemberships(userId: string): Promise<Membership[]> {
  const startedAt = performance.now()
  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id,user_id,role,is_owner,active,joined_at,organizations(id,name,timezone,created_by,created_at,updated_at)')
    .eq('user_id', userId)
    .eq('active', true)
    .order('joined_at', { ascending: true })

  logPerformance('access-context request', startedAt)
  if (error) throw error

  return (data ?? []).map((row) => ({
    organization_id: row.organization_id as string,
    user_id: row.user_id as string,
    role: row.role as Role,
    is_owner: row.is_owner as boolean,
    active: row.active as boolean,
    joined_at: row.joined_at as string,
    organization: (Array.isArray(row.organizations) ? row.organizations[0] : row.organizations) as Organization,
  }))
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, authLoading, isPasswordRecovery } = useAuth()
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(() => localStorage.getItem(storageKey))

  const query = useQuery({
    queryKey: ['memberships', user?.id],
    queryFn: () => fetchMemberships(user!.id),
    enabled: Boolean(user && !authLoading && !isPasswordRecovery),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnMount: false,
  })

  const memberships = query.data ?? []

  useEffect(() => {
    if (memberships.length === 0) return
    const storedExists = memberships.some((membership) => membership.organization_id === currentOrganizationId)
    if (!storedExists) {
      const first = memberships[0].organization_id
      setCurrentOrganizationId(first)
      localStorage.setItem(storageKey, first)
    }
  }, [memberships, currentOrganizationId])

  const setCurrentOrganization = (organizationId: string) => {
    if (!memberships.some((membership) => membership.organization_id === organizationId)) return
    setCurrentOrganizationId(organizationId)
    localStorage.setItem(storageKey, organizationId)
  }

  const currentMembership = memberships.find((item) => item.organization_id === currentOrganizationId) ?? memberships[0] ?? null

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      memberships,
      currentMembership,
      organization: currentMembership?.organization ?? null,
      role: currentMembership?.role ?? null,
      loading: query.isLoading,
      error: query.error as Error | null,
      canLoadWorkspaceData: Boolean(user && !authLoading && !isPasswordRecovery),
      setCurrentOrganization,
      refetch: query.refetch,
    }),
    [memberships, currentMembership, query.isLoading, query.error, query.refetch, user, authLoading, isPasswordRecovery],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return context
}
