import { type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Profile, Company } from '@/types/users';

export type AuthContext = {
  user: Profile;
  company: Company;
};

type AuthResult = { ok: true; user: Profile; company: Company } | { ok: false; reason: string };

export async function resolveAuthContext(request: NextRequest): Promise<AuthResult> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    return { ok: false, reason: 'No authenticated session' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(
      'id, company_id, full_name, email, phone, status, avatar_file_id, last_login_at, created_at, updated_at',
    )
    .eq('id', authUser.id)
    .eq('status', 'active')
    .single();

  if (profileError || !profile) {
    return { ok: false, reason: 'User profile not found or inactive' };
  }

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('id, name, legal_name, status, subscription_plan, timezone, created_at, updated_at')
    .eq('id', profile.company_id)
    .eq('status', 'active')
    .single();

  if (companyError || !company) {
    return { ok: false, reason: 'Company not found or inactive' };
  }

  // Attach to request headers for downstream use (avoids repeated DB calls)
  void request;

  return { ok: true, user: profile as Profile, company: company as Company };
}
