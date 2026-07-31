import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'

interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

interface ToastContextValue {
  showToast: (message: string, type?: Toast['type']) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const remove = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), [])

  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((current) => [...current, { id, message, type }])
    window.setTimeout(() => remove(id), 4500)
  }, [remove])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toasts.map((toast) => {
          const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? CircleAlert : Info
          return (
            <div key={toast.id} className={`toast toast-${toast.type}`}>
              <Icon size={18} />
              <span>{toast.message}</span>
              <button className="icon-button" onClick={() => remove(toast.id)} aria-label="Dismiss notification"><X size={15} /></button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
