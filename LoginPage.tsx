import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { ArrowRight, CheckCircle2, CircleUserRound, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { env } from '@/lib/env'
import { useAuth } from '@/contexts/AuthContext'
import { logPerformance } from '@/lib/performance'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  if (typeof error === 'string' && error.trim()) return error
  return 'Unable to create your account. Please try again.'
}

export function LoginPage() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [showSignupActions, setShowSignupActions] = useState(false)
  const [canResendConfirmation, setCanResendConfirmation] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('passwordReset') === 'success') {
      setNotice('Password updated successfully. Sign in with your new password.')
      window.history.replaceState({}, document.title, '/login')
      return
    }
    const authError = params.get('error_description') ?? params.get('error')
    if (authError) setFormError(authError)
  }, [location.search])

  if (!loading && user) return <Navigate to="/" replace />

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const startedAt = performance.now()
    setSubmitting(true)
    setFormError('')
    setNotice('')
    setShowSignupActions(false)
    setCanResendConfirmation(false)
    try {
      if (mode === 'login') {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (loginError) throw loginError
      } else {
        const { data, error: signupError } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        })
        if (signupError) {
          console.error('Signup failed', {
            name: signupError.name,
            message: signupError.message,
            status: signupError.status,
            code: signupError.code,
          })
          setFormError(getErrorMessage(signupError))
          return
        }
        if (!data.session) {
          setNotice('Check your inbox if this is a new account. If you already registered, sign in or continue with Google.')
          setShowSignupActions(true)
          // A new, unconfirmed email/password identity is the only case where this
          // client response can safely offer a resend without probing an address.
          setCanResendConfirmation(Boolean(data.user?.identities?.length))
        }
      }
    } catch (error: unknown) {
      console.error('Unexpected signup error:', error)
      setFormError(getErrorMessage(error))
    } finally {
      setSubmitting(false)
      logPerformance(mode === 'login' ? 'login request' : 'signup request', startedAt)
    }
  }

  const googleSignIn = async () => {
    setSubmitting(true)
    setFormError('')
    setShowSignupActions(false)
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { access_type: 'offline', prompt: 'select_account' },
        },
      })
      if (oauthError) throw oauthError
    } catch (caught) {
      setSubmitting(false)
      setFormError(getErrorMessage(caught))
    }
  }

  const goToSignIn = () => {
    setMode('login')
    setFormError('')
    setNotice('')
    setShowSignupActions(false)
    setCanResendConfirmation(false)
  }

  const resendConfirmation = async () => {
    if (!canResendConfirmation) return
    setResending(true)
    setFormError('')
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: `${env.appUrl}/auth/callback` },
      })
      if (resendError) throw resendError
      setNotice('If email confirmation is still needed, a new confirmation link may arrive shortly.')
    } catch (caught) {
      setFormError(getErrorMessage(caught))
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-showcase">
        <div className="auth-brand"><div className="brand-mark">F</div><strong>FlowDesk</strong></div>
        <div className="auth-showcase-content">
          <span className="eyebrow light">OPERATIONS, PROJECTS & DELIVERY</span>
          <h1>Run your company from one clear workspace.</h1>
          <p>Plan projects, manage Jira-style sprints, track evidence, review work and keep every role accountable.</p>
          <div className="auth-benefits">
            <span><CheckCircle2 size={18} />Role-based dashboards</span>
            <span><CheckCircle2 size={18} />Realtime project boards</span>
            <span><CheckCircle2 size={18} />Approvals, blockers and time logs</span>
            <span><CheckCircle2 size={18} />Supabase RLS security</span>
          </div>
        </div>
        <div className="auth-proof">
          <div><strong>6</strong><span>Access roles</span></div>
          <div><strong>1</strong><span>Source of truth</span></div>
          <div><strong>24/7</strong><span>Realtime visibility</span></div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-heading">
            <span className="mobile-auth-brand"><div className="brand-mark">F</div>FlowDesk</span>
            <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
            <p>{mode === 'login' ? 'Sign in to continue to your workspace.' : 'Start with a secure FlowDesk workspace.'}</p>
          </div>

          <button className="google-button" onClick={() => void googleSignIn()} disabled={submitting}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.24-.2-1.8H12v3.4h5.52a4.75 4.75 0 0 1-2.05 3.03l-.02.11 2.98 2.31.2.02c1.85-1.7 2.97-4.22 2.97-7.07Z"/><path fill="#34A853" d="M12 22c2.69 0 4.94-.89 6.59-2.42l-3.14-2.44c-.84.57-1.97.97-3.45.97a5.98 5.98 0 0 1-5.65-4.13l-.1.01-3.1 2.4-.04.1A9.96 9.96 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.35 13.98A6.15 6.15 0 0 1 6.03 12c0-.69.12-1.36.31-1.98v-.12L3.2 7.47l-.1.05A10 10 0 0 0 2 12c0 1.61.39 3.13 1.1 4.48l3.25-2.5Z"/><path fill="#EA4335" d="M12 5.89c1.87 0 3.13.8 3.85 1.47l2.8-2.73C16.94 3.03 14.69 2 12 2a9.96 9.96 0 0 0-8.9 5.52l3.24 2.5A6.01 6.01 0 0 1 12 5.89Z"/></svg>
            Continue with Google
          </button>

          <div className="auth-divider"><span>or continue with email</span></div>

          <form onSubmit={(event) => void submit(event)}>
            {mode === 'signup' && (
              <label className="field"><span>Full name</span><div className="input-with-icon"><CircleUserIcon /><input required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Rahul Karri" /></div></label>
            )}
            <label className="field"><span>Email address</span><div className="input-with-icon"><Mail size={17} /><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></div></label>
            <label className="field"><span>Password</span><div className="input-with-icon"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} minLength={8} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 8 characters" /><button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label="Toggle password visibility">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
            {mode === 'login' && <p className="auth-switch"><Link to="/forgot-password">Forgot password?</Link></p>}

            {formError && <div className="form-message error" role="alert">{formError}</div>}
            {notice && <div className="form-message success">{notice}</div>}

            <button className="primary-button full-width" type="submit" disabled={submitting}>
              {submitting ? <LoaderCircle className="spin" size={17} /> : <>{mode === 'login' ? 'Sign in' : 'Create account'}<ArrowRight size={17} /></>}
            </button>
          </form>

          {showSignupActions && (
            <div className="signup-next-steps" aria-label="Account next steps">
              <button className="secondary-button" onClick={() => void googleSignIn()} disabled={submitting}>Continue with Google</button>
              <button className="secondary-button" onClick={goToSignIn}>Go to Sign in</button>
              <Link className="secondary-button" to="/forgot-password">Forgot password</Link>
              {canResendConfirmation && <button className="secondary-button" onClick={() => void resendConfirmation()} disabled={resending}>{resending ? 'Resending…' : 'Resend confirmation'}</button>}
            </div>
          )}

          <p className="auth-switch">{mode === 'login' ? 'New to FlowDesk?' : 'Already have an account?'} <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setFormError(''); setNotice(''); setShowSignupActions(false); setCanResendConfirmation(false) }}>{mode === 'login' ? 'Create account' : 'Sign in'}</button></p>
        </div>
      </section>
    </div>
  )
}

function CircleUserIcon() {
  return <CircleUserRound size={17} />
}
