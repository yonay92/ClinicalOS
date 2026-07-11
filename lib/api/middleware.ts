import { type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Profile, Company } from '@/types/users';

export type AuthContext = {
  user: Profile;
  company: Company;
};

type AuthResult = { ok: true; user: Profile; company: Company } | { ok: false; reason: string };

type ProfileWithCompany = Profile & { companies: Company };

export async function resolveAuthContext(request: NextRequest): Promise<AuthResult> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    return { ok: false, reason: 'No authenticated session' };
  }

  // Single round trip for both profile and company (previously two sequential
  // queries) — this runs on every API request, so the saved round trip compounds
  // across a page's whole fetch waterfall.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(
      `id, company_id, full_name, email, phone, status, avatar_file_id, last_login_at, created_at, updated_at,
       companies!inner(id, name, legal_name, status, subscription_plan, timezone, created_at, updated_at)`,
    )
    .eq('id', authUser.id)
    .eq('status', 'active')
    .eq('companies.status', 'active')
    .single();

  if (profileError || !profile) {
    return { ok: false, reason: 'User profile or company not found or inactive' };
  }

  const { companies: company, ...user } = profile as unknown as ProfileWithCompany;

  // Attach to request headers for downstream use (avoids repeated DB calls)
  void request;

  return { ok: true, user, company };
}
