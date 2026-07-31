import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { logPerformance } from '@/lib/performance'

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  authLoading: boolean
  authEvent: AuthChangeEvent | null
  isPasswordRecovery: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

interface AuthSnapshot {
  session: Session | null
  loading: boolean
  event: AuthChangeEvent | null
}

let authSnapshot: AuthSnapshot = { session: null, loading: true, event: null }
let authBootstrap: Promise<void> | null = null
let authSubscription: { unsubscribe: () => void } | null = null
let releaseSubscriptionTimer: number | undefined
const authListeners = new Set<(snapshot: AuthSnapshot) => void>()

function publishAuth(next: AuthSnapshot) {
  authSnapshot = next
  authListeners.forEach((listener) => listener(authSnapshot))
}

function initializeAuthOnce() {
  if (authBootstrap) return authBootstrap

  const startedAt = performance.now()
  authBootstrap = supabase.auth.getSession()
    .then(({ data, error }) => {
      if (error) console.error('Session bootstrap failed', error)
      publishAuth({ session: data.session ?? null, loading: false, event: 'INITIAL_SESSION' })
    })
    .catch((error: unknown) => {
      console.error('Session bootstrap failed', error)
      publishAuth({ session: null, loading: false, event: 'INITIAL_SESSION' })
    })
    .finally(() => logPerformance('auth initialization', startedAt))

  return authBootstrap
}

function subscribeToAuth(listener: (snapshot: AuthSnapshot) => void) {
  if (releaseSubscriptionTimer) {
    window.clearTimeout(releaseSubscriptionTimer)
    releaseSubscriptionTimer = undefined
  }

  authListeners.add(listener)
  listener(authSnapshot)

  if (!authSubscription) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      publishAuth({ session, loading: false, event })
    })
    authSubscription = data.subscription
  }

  void initializeAuthOnce()

  return () => {
    authListeners.delete(listener)
    if (authListeners.size > 0) return

    // React Strict Mode remounts effects synchronously in development. Deferring
    // this cleanup preserves one durable listener rather than opening two.
    releaseSubscriptionTimer = window.setTimeout(() => {
      if (authListeners.size > 0 || !authSubscription) return
      authSubscription.unsubscribe()
      authSubscription = null
      releaseSubscriptionTimer = undefined
    }, 0)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>(() => authSnapshot)

  useEffect(() => {
    return subscribeToAuth(setSnapshot)
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session: snapshot.session,
      user: snapshot.session?.user ?? null,
      loading: snapshot.loading,
      authLoading: snapshot.loading,
      authEvent: snapshot.event,
      isPasswordRecovery: snapshot.event === 'PASSWORD_RECOVERY',
      signOut,
    }),
    [snapshot, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
