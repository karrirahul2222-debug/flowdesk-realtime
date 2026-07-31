import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell, Blocks, BriefcaseBusiness, ChartNoAxesCombined, CheckSquare2, ChevronDown,
  CircleUserRound, FolderKanban, Gauge, LogOut, Menu, MessageCircleMore, Network, Search, Settings,
  ShieldCheck, UsersRound, X,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { Avatar } from './Avatar'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { hasMinimumRole, type Notification, type Role } from '@/types/models'
import { RealtimeSync } from './RealtimeSync'

interface NavItem {
  label: string
  path: string
  icon: typeof Gauge
  minimumRole?: Role
}

const navigation: NavItem[] = [
  { label: 'Overview', path: '/', icon: Gauge },
  { label: 'Projects', path: '/projects', icon: BriefcaseBusiness },
  { label: 'Board', path: '/board', icon: FolderKanban },
  { label: 'Backlog & sprints', path: '/backlog', icon: Blocks },
  { label: 'My work', path: '/my-work', icon: CheckSquare2 },
  { label: 'Workspace chat', path: '/chat', icon: MessageCircleMore },
  { label: 'Approvals', path: '/approvals', icon: ShieldCheck },
  { label: 'People', path: '/people', icon: UsersRound, minimumRole: 'manager' },
  { label: 'Reports', path: '/reports', icon: ChartNoAxesCombined, minimumRole: 'team_lead' },
  { label: 'Settings', path: '/settings', icon: Settings, minimumRole: 'admin' },
]

export function AppLayout() {
  const { user, signOut } = useAuth()
  const { memberships, organization, role, setCurrentOrganization, canLoadWorkspaceData } = useWorkspace()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    setSidebarOpen(false)
    setProfileOpen(false)
    setNotificationsOpen(false)
  }, [location.pathname])

  const notificationsQuery = useQuery({
    queryKey: ['notifications', organization?.id, user?.id],
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('organization_id', organization!.id)
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []) as Notification[]
    },
    enabled: canLoadWorkspaceData && Boolean(organization && user),
  })

  const visibleNavigation = useMemo(
    () => navigation.filter((item) => !item.minimumRole || hasMinimumRole(role, item.minimumRole)),
    [role],
  )

  const displayName = user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? user?.email ?? 'FlowDesk user'
  const unreadCount = (notificationsQuery.data ?? []).filter((item) => !item.read_at).length

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault()
    const term = globalSearch.trim()
    if (term) navigate(`/my-work?q=${encodeURIComponent(term)}`)
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <RealtimeSync />
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">F</div>
          <div><strong>FlowDesk</strong><span>Work operating system</span></div>
          <button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>

        <div className="workspace-switcher">
          <Network size={17} />
          <select
            aria-label="Current workspace"
            value={organization?.id ?? ''}
            onChange={(event) => setCurrentOrganization(event.target.value)}
          >
            {memberships.map((membership) => (
              <option key={membership.organization_id} value={membership.organization_id}>
                {membership.organization?.name ?? 'Workspace'}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          <span className="nav-section-label">Workspace</span>
          {visibleNavigation.map((item) => {
            const Icon = item.icon
            return (
              <NavLink key={item.path} to={item.path} end={item.path === '/'} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="plan-card">
            <span>REALTIME MVP</span>
            <strong>Built on Supabase</strong>
            <p>RLS-protected, multi-workspace and ready for automation.</p>
          </div>
        </div>
      </aside>

      {sidebarOpen && <button className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}

      <div className="main-column">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <form className="global-search" onSubmit={handleSearch}>
            <Search size={17} />
            <input value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder="Search tasks and projects…" />
            <kbd>⌘ K</kbd>
          </form>

          <div className="topbar-actions">
            <div className="popover-anchor">
              <button className="icon-button notification-button" onClick={() => setNotificationsOpen((value) => !value)} aria-label="Notifications">
                <Bell size={19} />
                {unreadCount > 0 && <span className="notification-count">{Math.min(unreadCount, 9)}</span>}
              </button>
              {notificationsOpen && (
                <div className="popover notification-popover">
                  <div className="popover-header"><strong>Notifications</strong><span>{unreadCount} unread</span></div>
                  <div className="notification-list">
                    {(notificationsQuery.data ?? []).length === 0 ? (
                      <p className="muted-block">No notifications yet.</p>
                    ) : (notificationsQuery.data ?? []).map((notification) => (
                      <button
                        key={notification.id}
                        className={`notification-item ${notification.read_at ? '' : 'unread'}`}
                        onClick={async () => {
                          if (!notification.read_at) {
                            await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notification.id)
                            void notificationsQuery.refetch()
                          }
                        }}
                      >
                        <span className={`notification-dot notification-${notification.type}`} />
                        <span><strong>{notification.title}</strong><small>{notification.body}</small></span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="popover-anchor">
              <button className="profile-button" onClick={() => setProfileOpen((value) => !value)}>
                <Avatar name={displayName} src={user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture} size="sm" />
                <span><strong>{displayName}</strong><small>{role?.replace('_', ' ')}</small></span>
                <ChevronDown size={14} />
              </button>
              {profileOpen && (
                <div className="popover profile-popover">
                  <button onClick={() => navigate('/settings')}><CircleUserRound size={17} />Profile & settings</button>
                  <button onClick={() => void handleSignOut()}><LogOut size={17} />Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="page-content"><Outlet /></main>
      </div>
    </div>
  )
}
