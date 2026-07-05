import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PermissionDeniedError, NotFoundError } from '@/lib/api/errors';
import type { PermissionKey } from '@/types/roles';
import type { Profile } from '@/types/users';

export const PermissionService = {
  async getUserPermissions(userId: string): Promise<PermissionKey[]> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('user_roles')
      .select(
        `
        role_id,
        roles!inner(
          role_permissions!inner(
            allowed,
            permissions!inner(key)
          )
        )
      `,
      )
      .eq('user_id', userId);

    if (error || !data) return [];

    const keys = new Set<PermissionKey>();
    for (const ur of data) {
      const role = ur.roles as unknown as {
        role_permissions: Array<{ allowed: boolean; permissions: { key: string } }>;
      };
      for (const rp of role.role_permissions) {
        if (rp.allowed) {
          keys.add(rp.permissions.key as PermissionKey);
        }
      }
    }
    return Array.from(keys);
  },

  async hasPermission(userId: string, permissionKey: PermissionKey): Promise<boolean> {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.rpc('has_permission', { permission_key: permissionKey });
    // Fallback to manual check if RPC unavailable
    if (data === null || data === undefined) {
      const permissions = await this.getUserPermissions(userId);
      return permissions.includes(permissionKey);
    }
    return Boolean(data);
  },

  async requirePermission(userId: string, permissionKey: PermissionKey): Promise<void> {
    const allowed = await this.hasPermission(userId, permissionKey);
    if (!allowed) {
      throw new PermissionDeniedError(permissionKey);
    }
  },

  async requireAnyPermission(userId: string, permissionKeys: PermissionKey[]): Promise<void> {
    for (const key of permissionKeys) {
      if (await this.hasPermission(userId, key)) return;
    }
    throw new PermissionDeniedError(permissionKeys.join(' or '));
  },

  async canAccessSite(userId: string, siteId: string): Promise<boolean> {
    const supabase = await createServerSupabaseClient();

    // Check if user has view_all_sites
    const hasAllSites = await this.hasPermission(userId, 'view_all_sites');
    if (hasAllSites) return true;

    const { data } = await supabase
      .from('user_sites')
      .select('id')
      .eq('user_id', userId)
      .eq('site_id', siteId)
      .maybeSingle();

    return data !== null;
  },

  async requireSiteAccess(userId: string, siteId: string): Promise<void> {
    const allowed = await this.canAccessSite(userId, siteId);
    if (!allowed) {
      throw new PermissionDeniedError(`site:${siteId}`);
    }
  },

  async canAccessStudy(userId: string, studyId: string): Promise<boolean> {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from('study_staff')
      .select('id')
      .eq('user_id', userId)
      .eq('study_id', studyId)
      .maybeSingle();

    if (data) return true;
    return this.hasPermission(userId, 'manage_studies');
  },

  async getUserRoleKeys(userId: string): Promise<string[]> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('user_roles')
      .select('roles!inner(key)')
      .eq('user_id', userId);

    if (error || !data) return [];
    return data.map((ur) => (ur.roles as unknown as { key: string }).key);
  },

  async validateUserExists(userId: string, companyId: string): Promise<Profile> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id, company_id, full_name, email, phone, status, avatar_file_id, last_login_at, created_at, updated_at',
      )
      .eq('id', userId)
      .eq('company_id', companyId)
      .single();

    if (error || !data) {
      throw new NotFoundError('User');
    }
    return data as Profile;
  },
};
