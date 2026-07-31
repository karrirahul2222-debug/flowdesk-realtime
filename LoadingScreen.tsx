export function LoadingScreen({ message = 'Loading FlowDesk…' }: { message?: string }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="brand-mark">F</div>
      <div className="spinner" />
      <p>{message}</p>
    </div>
  )
}
