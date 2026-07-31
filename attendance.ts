import type { Role } from '@/types/models'
export const attendancePolicy = { trackedRoles: ['manager', 'team_lead', 'employee', 'viewer'] as Role[], exemptRoles: ['ceo', 'admin'] as Role[] }
export const isAttendanceTracked = (role: Role | null) => role !== null && attendancePolicy.trackedRoles.includes(role)
