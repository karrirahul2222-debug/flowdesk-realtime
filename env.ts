const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'] as const

for (const key of required) {
  if (!import.meta.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
}

export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
  appUrl: (import.meta.env.VITE_APP_URL as string | undefined) ?? window.location.origin,
  attendanceEnabled: import.meta.env.VITE_ATTENDANCE_ENABLED === 'true',
}
