import type { AuthError, PostgrestError } from '@supabase/supabase-js'

type KnownError = Error | AuthError | PostgrestError | { message?: string; code?: string }

export function getErrorMessage(error: unknown): string {
  const known = error as KnownError | null
  const rawMessage = typeof known?.message === 'string' ? known.message.trim() : ''
  const message = rawMessage.toLowerCase()
  const code = known && typeof known === 'object' && 'code' in known
    ? (known as { code?: string }).code
    : undefined

  if (message.includes('oauth state not found') || message.includes('code verifier')) {
    return 'The Google sign-in session expired or the callback was processed twice. Return to login and try once.'
  }
  if (message.includes('redirect') && message.includes('not allowed')) {
    return 'This callback URL is not allowed in Supabase Auth. Add the exact /auth/callback URL to Redirect URLs.'
  }
  if (message.includes('unauthorized ip address')) {
    return 'Email delivery is blocked by the configured SMTP provider. Authorize the Supabase IP or use a working SMTP service.'
  }
  if (code === 'PGRST202' || message.includes('schema cache')) {
    return 'A required database function is missing. Apply the included Supabase migration, then reload the schema cache.'
  }
  if (message.includes('row-level security') || code === '42501') {
    return 'Your account does not have permission for this action.'
  }
  if (message.includes('invalid login credentials')) {
    return 'The email or password is incorrect.'
  }
  if (message.includes('already registered')) {
    return 'An account already exists for this email. Sign in instead.'
  }

  return rawMessage || 'We could not complete that request. Check your connection and try again.'
}
