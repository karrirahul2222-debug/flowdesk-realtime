export function StatusBadge({ value }: { value: string }) {
  return <span className={`status-badge status-${value.replaceAll('_', '-')}`}>{value.replaceAll('_', ' ')}</span>
}
