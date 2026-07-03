import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client for server-only operations (Edge Functions, invitation acceptance).
 * Untyped — typed ops come from domain-layer casts (as Profile, as Company, etc.).
 * This file must NEVER be imported from /app or /components — server routes and Edge Functions only.
 */
export function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
