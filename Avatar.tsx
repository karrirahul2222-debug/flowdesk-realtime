import { initials } from '@/lib/format'

export function Avatar({ name, src, size = 'md' }: { name: string; src?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  if (src) return <img className={`avatar avatar-${size}`} src={src} alt={name} referrerPolicy="no-referrer" />
  return <span className={`avatar avatar-${size} avatar-fallback`} aria-label={name}>{initials(name)}</span>
}
