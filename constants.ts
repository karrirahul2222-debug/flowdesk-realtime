import type { IssueType, Priority, TaskStatus } from '@/types/models'

export const taskStatuses: Array<{ id: TaskStatus; label: string }> = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'To do' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
]

export const priorities: Priority[] = ['low', 'medium', 'high', 'urgent']
export const issueTypes: IssueType[] = ['epic', 'story', 'task', 'bug', 'subtask']
