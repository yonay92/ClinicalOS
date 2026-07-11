import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server-side Supabase client. Untyped — typed ops come from domain-layer casts.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            const set = cookieStore.set.bind(cookieStore) as (
              name: string,
              value: string,
              options?: object,
            ) => void;
            cookiesToSet.forEach(({ name, value, options }) => set(name, value, options));
          } catch {
            // Server component — cookie setting is handled by middleware
          }
        },
      },
    },
  );
}
