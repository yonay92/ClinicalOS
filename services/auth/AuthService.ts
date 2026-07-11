import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AuthError, NotFoundError } from '@/lib/api/errors';
import { AuditService } from '@/services/audit/AuditService';
import type { Profile } from '@/types/users';

export const AuthService = {
  async signIn(email: string, password: string): Promise<{ profile: Profile; session: object }> {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      throw new AuthError('Invalid email or password');
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(
        'id, company_id, full_name, email, phone, status, avatar_file_id, last_login_at, created_at, updated_at',
      )
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      throw new NotFoundError('User profile');
    }

    if ((profile as Profile).status !== 'active') {
      await supabase.auth.signOut();
      throw new AuthError('Your account has been deactivated. Contact your administrator.');
    }

    // Update last_login_at
    await supabase
      .from('profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', data.user.id);

    await AuditService.log({
      company_id: (profile as Profile).company_id,
      user_id: data.user.id,
      action: 'auth.login',
      module: 'auth',
      record_type: 'profile',
      record_id: data.user.id,
    });

    return { profile: profile as Profile, session: data.session };
  },

  async signOut(userId: string, companyId: string): Promise<void> {
    const supabase = await createServerSupabaseClient();

    await AuditService.log({
      company_id: companyId,
      user_id: userId,
      action: 'auth.logout',
      module: 'auth',
      record_type: 'profile',
      record_id: userId,
    });

    await supabase.auth.signOut();
  },

  async getCurrentUser(): Promise<Profile | null> {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
      .from('profiles')
      .select(
        'id, company_id, full_name, email, phone, status, avatar_file_id, last_login_at, created_at, updated_at',
      )
      .eq('id', user.id)
      .eq('status', 'active')
      .single();

    return (data as Profile) ?? null;
  },

  async sendPasswordReset(email: string): Promise<void> {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
    });
    if (error) {
      throw new AuthError('Failed to send password reset email');
    }
  },

  async updatePassword(newPassword: string): Promise<void> {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw new AuthError('Failed to update password: ' + error.message);
    }
  },
};
