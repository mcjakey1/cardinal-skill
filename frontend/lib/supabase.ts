import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * Returns a configured Supabase client if NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_ANON_KEY are present, or null if running in offline demo mode.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your-project')) {
    return null
  }
  return createClient(supabaseUrl, supabaseAnonKey)
}

export const supabase = getSupabaseClient()
