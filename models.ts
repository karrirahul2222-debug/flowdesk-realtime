export type Role = 'ceo' | 'admin' | 'manager' | 'team_lead' | 'employee' | 'viewer'
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'review' | 'done'
export type IssueType = 'epic' | 'story' | 'task' | 'bug' | 'subtask'

export interface Organization {
  id: string
  name: string
  timezone: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface Membership {
  organization_id: string
  user_id: string
  role: Role
  is_owner: boolean
  active: boolean
  joined_at: string
  organization?: Organization
}

export interface Department {
  id: string
  organization_id: string
  name: string
  description: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface Team {
  id: string
  organization_id: string
  department_id: string | null
  name: string
  description: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface Person {
  id: string
  organization_id: string
  auth_user_id: string | null
  full_name: string
  email: string | null
  job_title: string | null
  access_role: Role
  department_id: string | null
  team_id: string | null
  manager_id: string | null
  weekly_capacity_hours: number
  status: 'active' | 'inactive' | 'invited'
  avatar_url: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  organization_id: string
  name: string
  code: string | null
  description: string | null
  status: ProjectStatus
  priority: Priority
  owner_person_id: string | null
  start_date: string | null
  due_date: string | null
  progress: number
  created_by: string
  created_at: string
  updated_at: string
  owner?: Pick<Person, 'id' | 'full_name' | 'avatar_url'> | null
}

export interface Sprint {
  id: string
  organization_id: string
  project_id: string
  name: string
  goal: string | null
  status: 'planned' | 'active' | 'completed'
  start_date: string | null
  end_date: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface Epic {
  id: string
  organization_id: string
  project_id: string
  name: string
  description: string | null
  color: string | null
  status: 'open' | 'in_progress' | 'done'
  created_by: string
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  organization_id: string
  project_id: string
  parent_task_id: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: Priority
  start_date: string | null
  due_date: string | null
  estimated_hours: number | null
  progress: number
  reviewer_person_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  issue_type?: IssueType
  story_points?: number | null
  sprint_id?: string | null
  epic_id?: string | null
  rank?: number
  acceptance_criteria?: string | null
  assignees?: Array<{ person_id: string; person?: Pick<Person, 'id' | 'full_name' | 'avatar_url'> }>
  project?: Pick<Project, 'id' | 'name' | 'code'>
}

export interface TaskComment {
  id: string
  organization_id: string
  task_id: string
  author_user_id: string
  body: string
  created_at: string
  updated_at: string
}

export interface TimeEntry {
  id: string
  organization_id: string
  task_id: string
  user_id: string
  entry_date: string
  minutes: number
  note: string | null
  created_at: string
  updated_at: string
}

export interface Approval {
  id: string
  organization_id: string
  task_id: string
  requested_by: string
  reviewer_user_id: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  request_message: string | null
  decision_note: string | null
  requested_at: string
  decided_at: string | null
  task?: Pick<Task, 'id' | 'title' | 'status' | 'priority'>
}

export interface Blocker {
  id: string
  organization_id: string
  task_id: string
  reported_by: string
  reason: string
  status: 'open' | 'resolved'
  resolution: string | null
  created_at: string
  resolved_at: string | null
}

export interface TaskEvidence {
  id: string
  organization_id: string
  task_id: string
  uploaded_by: string
  file_name: string
  storage_path: string
  mime_type: string | null
  file_size: number | null
  note: string | null
  created_at: string
}

export interface Notification {
  id: string
  organization_id: string
  user_id: string
  title: string
  body: string | null
  type: 'info' | 'task' | 'approval' | 'warning'
  read_at: string | null
  created_at: string
}

export interface WorkspaceMessage {
  id: string
  organization_id: string
  author_user_id: string
  body: string
  created_at: string
}

export const roleRank: Record<Role, number> = {
  viewer: 0,
  employee: 1,
  team_lead: 2,
  manager: 3,
  admin: 4,
  ceo: 5,
}

export function hasMinimumRole(current: Role | null, minimum: Role): boolean {
  return current !== null && roleRank[current] >= roleRank[minimum]
}
