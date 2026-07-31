/** Development-only timing that deliberately excludes user and session data. */
export function logPerformance(label: string, startedAt: number) {
  if (!import.meta.env.DEV) return
  console.info(`[FlowDesk performance] ${label}: ${Math.round(performance.now() - startedAt)}ms`)
}
