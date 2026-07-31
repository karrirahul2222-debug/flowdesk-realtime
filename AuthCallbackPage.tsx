import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/errors'
import { LoadingScreen } from '@/components/LoadingScreen'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const callbackStarted = useRef(false)

  useEffect(() => {
    if (callbackStarted.current) return
    callbackStarted.current = true
    let active = true

    const finish = async () => {
      const params = new URLSearchParams(window.location.search)
      const callbackError = params.get('error_description') ?? params.get('error')
      const { data: initialSession, error: initialSessionError } = await supabase.auth.getSession()
      if (initialSessionError) throw initialSessionError
      if (initialSession.session) {
        window.history.replaceState({}, document.title, '/auth/callback')
        if (active) navigate('/', { replace: true })
        return
      }

      const code = params.get('code')
      let authError: Error | null = callbackError ? new Error(callbackError) : null
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) authError = exchangeError
      }

      const { data: finalSession, error: finalSessionError } = await supabase.auth.getSession()
      if (finalSessionError) authError = finalSessionError
      if (finalSession.session) {
        window.history.replaceState({}, document.title, '/auth/callback')
        if (active) navigate('/', { replace: true })
        return
      }

      if (authError) throw new Error('Email link is invalid or has expired')
      throw new Error('A session could not be established from this callback.')
    }

    void finish().catch((caught) => {
      if (active) setError(getErrorMessage(caught))
    })

    return () => {
      active = false
    }
  }, [navigate])

  if (!error) return <LoadingScreen message="Completing secure sign-in…" />

  return (
    <div className="callback-error-page">
      <div className="callback-error-card">
        <div className="error-icon"><AlertTriangle size={28} /></div>
        <h1>Sign-in could not be completed</h1>
        <p>{error}</p>
        <button className="primary-button" onClick={() => navigate('/login', { replace: true })}><ArrowLeft size={17} />Return to login</button>
      </div>
    </div>
  )
}
