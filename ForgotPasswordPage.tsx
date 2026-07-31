import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, LoaderCircle, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logPerformance } from '@/lib/performance'

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return typeof error === 'string' && error.trim() ? error : 'Something went wrong. Please try again.'
}

function isValidPublicEmail(value: string): boolean {
  const email = value.trim().toLowerCase()

  if (!email || email.length > 254) return false

  const parts = email.split('@')
  if (parts.length !== 2) return false

  const [localPart, domain] = parts
  if (!localPart || !domain) return false

  if (
    localPart.length > 64
    || localPart.startsWith('.')
    || localPart.endsWith('.')
    || localPart.includes('..')
  ) return false

  if (
    !domain.includes('.')
    || domain.startsWith('.')
    || domain.endsWith('.')
    || domain.includes('..')
  ) return false

  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const inFlight = useRef(false)

  useEffect(() => { if (!cooldown) return; const timer = window.setInterval(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000); return () => window.clearInterval(timer) }, [cooldown])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    if (!isValidPublicEmail(normalizedEmail)) {
      setFormError('Enter a valid email address, for example name@company.com.')
      return
    }
    if (inFlight.current || cooldown) return
    const startedAt = performance.now()
    inFlight.current = true; setSubmitting(true); setFormError('')
    try {
      const { error: requestError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: `${window.location.origin}/reset-password` })
      if (requestError) throw requestError
      setSuccess(true); setCooldown(60)
    } catch (caught) { setFormError(getErrorMessage(caught)) } finally { inFlight.current = false; setSubmitting(false); logPerformance('reset-email request', startedAt) }
  }
  return <div className="auth-page"><section className="auth-panel"><div className="auth-card"><div className="auth-card-heading"><span className="mobile-auth-brand"><div className="brand-mark">F</div>FlowDesk</span><h2>Reset your password</h2><p>We will send a secure password reset link.</p></div><form noValidate onSubmit={(event) => void submit(event)}><label className="field"><span>Email address</span><div className="input-with-icon"><Mail size={17} /><input type="email" inputMode="email" required autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setSuccess(false) }} placeholder="you@company.com" /></div></label>{formError && <div className="form-message error" role="alert">{formError}</div>}{success && <div className="form-message success" role="status">If an account exists for this email, we have sent a password reset link. Please check your inbox and spam folder.</div>}<button className="primary-button full-width" disabled={submitting || cooldown > 0}>{submitting ? <><LoaderCircle className="spin" size={17} />Sending secure reset link…</> : cooldown ? `Resend available in ${cooldown}s` : 'Send reset link'}</button></form><p className="auth-switch"><Link to="/login"><ArrowLeft size={15} />Back to login</Link></p></div></section></div>
}
