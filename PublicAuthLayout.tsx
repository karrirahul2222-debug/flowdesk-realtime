import { Outlet } from 'react-router-dom'

/** A deliberately data-free boundary for login and recovery routes. */
export function PublicAuthLayout() {
  return <Outlet />
}
