import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type RecoveryState = 'validating' | 'ready' | 'invalid' | 'updating' | 'success'

const invalidLinkMessage = 'This password reset link is invalid or has expired. Request a new link.'

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return invalidLinkMessage
}

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('validating')
  const [errorMessage, setErrorMessage] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const initializedRef = useRef(false)
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return
      if (event === 'PASSWORD_RECOVERY' && session) {
        setRecoveryState('ready')
        setErrorMessage('')
      }
    })

    const timeoutId = window.setTimeout(() => {
      if (!mountedRef.current) return
      setRecoveryState((currentState) => {
        if (currentState !== 'validating') return currentState
        setErrorMessage('The reset link could not be validated. Request a new password reset link.')
        return 'invalid'
      })
    }, 8_000)

    if (!initializedRef.current) {
      initializedRef.current = true

      void (async () => {
        try {
          const url = new URL(window.location.href)
          const urlError = url.searchParams.get('error_description')
            ?? new URLSearchParams(url.hash.slice(1)).get('error_description')

          if (urlError) throw new Error(urlError)

          const code = url.searchParams.get('code')
          if (code) {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
            if (exchangeError) throw exchangeError

            // The code is one-time use. Keep it available until the exchange has
            // succeeded, then remove only that sensitive query parameter.
            url.searchParams.delete('code')
            window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`)
          }

          const { data: { session }, error: sessionError } = await supabase.auth.getSession()
          if (sessionError) throw sessionError
          if (!mountedRef.current) return

          if (session) {
            setRecoveryState('ready')
            setErrorMessage('')
            return
          }

          setRecoveryState('invalid')
          setErrorMessage(invalidLinkMessage)
        } catch (error: unknown) {
          console.error('Password reset validation failed', { message: getErrorMessage(error) })
          if (!mountedRef.current) return
          setRecoveryState('invalid')
          setErrorMessage(invalidLinkMessage)
        }
      })()
    }

    return () => {
      mountedRef.current = false
      window.clearTimeout(timeoutId)
      subscription.unsubscribe()
    }
  }, [])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!password) {
      setErrorMessage('Enter a new password.')
      return
    }
    if (password.length < 8) {
      setErrorMessage('Your new password must be at least 8 characters.')
      return
    }
    if (password !== confirmation) {
      setErrorMessage('The passwords do not match.')
      return
    }

    setRecoveryState('updating')
    setErrorMessage('')
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error

      setRecoveryState('success')
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
      if (signOutError) console.warn('Local sign-out after password reset failed', { message: signOutError.message })
      navigate('/login?passwordReset=success', { replace: true })
    } catch (error: unknown) {
      setRecoveryState('ready')
      setErrorMessage(getErrorMessage(error))
    }
  }

  if (recoveryState === 'invalid') return <ResetError message={errorMessage || invalidLinkMessage} />
  if (recoveryState === 'success') return <ResetSuccess />

  const formReady = recoveryState === 'ready' || recoveryState === 'updating'
  return (
    <div className="auth-page">
      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-heading">
            <span className="mobile-auth-brand"><div className="brand-mark">F</div>FlowDesk</span>
            <h2>Choose a new password</h2>
            <p>{formReady ? 'Create a secure password for your account.' : 'Validating your reset link...'}</p>
          </div>

          {formReady && (
            <form onSubmit={(event) => void submit(event)}>
              <PasswordField label="New password" value={password} onChange={setPassword} show={showPassword} toggle={() => setShowPassword((value) => !value)} />
              <PasswordField label="Confirm new password" value={confirmation} onChange={setConfirmation} show={showPassword} toggle={() => setShowPassword((value) => !value)} />
              {errorMessage && <div className="form-message error" role="alert">{errorMessage}</div>}
              <button className="primary-button full-width" disabled={recoveryState === 'updating'}>
                {recoveryState === 'updating' ? <><LoaderCircle className="spin" size={17} />Updating password…</> : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}

function PasswordField({ label, value, onChange, show, toggle }: { label: string; value: string; onChange: (value: string) => void; show: boolean; toggle: () => void }) {
  return <label className="field"><span>{label}</span><div className="input-with-icon"><input type={show ? 'text' : 'password'} required minLength={8} autoComplete="new-password" value={value} onChange={(event) => onChange(event.target.value)} /><button type="button" className="password-toggle" onClick={toggle} aria-label="Toggle password visibility">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
}

function ResetError({ message }: { message: string }) {
  return <div className="auth-page"><section className="auth-panel"><div className="auth-card"><div className="auth-card-heading"><h2>Reset link unavailable</h2><p>{message}</p></div><Link className="primary-button full-width" to="/forgot-password">Request a new reset link</Link><p className="auth-switch"><Link to="/login">Return to login</Link></p></div></section></div>
}

function ResetSuccess() {
  return <div className="auth-page"><section className="auth-panel"><div className="auth-card"><div className="auth-card-heading"><h2>Password updated</h2><p>Your password has been updated successfully.</p></div></div></section></div>
}
