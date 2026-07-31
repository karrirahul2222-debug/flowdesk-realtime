import { AlertCircle, ArrowDown, ArrowUp, ChevronsUp } from 'lucide-react'
import type { Priority } from '@/types/models'

const icons = {
  low: ArrowDown,
  medium: AlertCircle,
  high: ArrowUp,
  urgent: ChevronsUp,
}

export function PriorityBadge({ value }: { value: Priority }) {
  const Icon = icons[value]
  return <span className={`priority-badge priority-${value}`}><Icon size={13} />{value}</span>
}
