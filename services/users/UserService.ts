import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { PermissionService } from '@/services/permissions/PermissionService';
import { AuditService } from '@/services/audit/AuditService';
import { NotFoundError, DatabaseError, PermissionDeniedError } from '@/lib/api/errors';
import type { Profile, UserWithAccess } from '@/types/users';
import type { RequestContext } from '@/types/api';

export const UserService = {
  async list(
    ctx: RequestContext,
    filters?: { role?: string; site?: string; status?: string },
  ): Promise<UserWithAccess[]> {
    const supabase = await createServerSupabaseClient();
    let query = supabase
      .from('profiles')
      .select(
        'id, company_id, full_name, email, phone, status, avatar_file_id, last_login_at, created_at, updated_at',
      )
      .eq('company_id', ctx.company.id)
      .order('full_name');

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data } = await query;
    const profiles = (data as Profile[]) ?? [];
    if (profiles.length === 0) return [];

    const userIds = profiles.map((p) => p.id);

    const [{ data: userRoles }, { data: userSites }] = await Promise.all([
      supabase
        .from('user_roles')
        .select('user_id, roles!inner(id, key, name)')
        .eq('company_id', ctx.company.id)
        .in('user_id', userIds),
      supabase
        .from('user_sites')
        .select('user_id, sites!inner(id, name)')
        .eq('company_id', ctx.company.id)
        .in('user_id', userIds),
    ]);

    const rolesByUser = new Map<string, UserWithAccess['roles']>();
    for (const ur of (userRoles as Array<{
      user_id: string;
      roles: UserWithAccess['roles'][number];
    }> | null) ?? []) {
      const list = rolesByUser.get(ur.user_id) ?? [];
      list.push(ur.roles);
      rolesByUser.set(ur.user_id, list);
    }

    const sitesByUser = new Map<string, UserWithAccess['sites']>();
    for (const us of (userSites as Array<{
      user_id: string;
      sites: UserWithAccess['sites'][number];
    }> | null) ?? []) {
      const list = sitesByUser.get(us.user_id) ?? [];
      list.push(us.sites);
      sitesByUser.set(us.user_id, list);
    }

    return profiles.map((p) => ({
      ...p,
      roles: rolesByUser.get(p.id) ?? [],
      sites: sitesByUser.get(p.id) ?? [],
    }));
  },

  async getById(userId: string, ctx: RequestContext): Promise<Profile> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id, company_id, full_name, email, phone, status, avatar_file_id, last_login_at, created_at, updated_at',
      )
      .eq('id', userId)
      .eq('company_id', ctx.company.id)
      .single();

    if (error || !data) throw new NotFoundError('User');
    return data as Profile;
  },

  async update(
    userId: string,
    input: { full_name?: string; phone?: string | null; status?: string },
    ctx: RequestContext,
  ): Promise<Profile> {
    // User can update own profile; admin can update any profile in company
    const isSelf = userId === ctx.user.id;
    if (!isSelf) {
      await PermissionService.requirePermission(ctx.user.id, 'manage_users');
    }

    const supabase = await createServerSupabaseClient();
    const { data: old } = await supabase
      .from('profiles')
      .select('id, full_name, phone, status')
      .eq('id', userId)
      .eq('company_id', ctx.company.id)
      .maybeSingle();

    if (!old) throw new NotFoundError('User');

    const { data, error } = await supabase
      .from('profiles')
      .update(input)
      .eq('id', userId)
      .eq('company_id', ctx.company.id)
      .select(
        'id, company_id, full_name, email, phone, status, avatar_file_id, last_login_at, created_at, updated_at',
      )
      .single();

    if (error || !data) throw new DatabaseError(error?.message ?? 'Update failed');

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: isSelf ? 'user.updated_self' : 'user.updated',
      module: 'users',
      record_type: 'profiles',
      record_id: userId,
      old_value: old as Record<string, unknown>,
      new_value: input as Record<string, unknown>,
    });

    return data as Profile;
  },

  async deactivate(userId: string, ctx: RequestContext): Promise<void> {
    await PermissionService.requirePermission(ctx.user.id, 'manage_users');

    if (userId === ctx.user.id) {
      throw new PermissionDeniedError('Cannot deactivate your own account');
    }

    const supabase = await createServerSupabaseClient();
    const { data: existing } = await supabase
      .from('profiles')
      .select('id, full_name, status')
      .eq('id', userId)
      .eq('company_id', ctx.company.id)
      .maybeSingle();

    if (!existing) throw new NotFoundError('User');

    const adminSupabase = createAdminSupabaseClient();
    const { error } = await adminSupabase
      .from('profiles')
      .update({ status: 'inactive' })
      .eq('id', userId)
      .eq('company_id', ctx.company.id);

    if (error) throw new DatabaseError(error.message);

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: 'user.deactivated',
      module: 'users',
      record_type: 'profiles',
      record_id: userId,
      old_value: { status: (existing as { status: string }).status },
      new_value: { status: 'inactive' },
    });
  },

  async assignRole(userId: string, roleId: string, ctx: RequestContext): Promise<void> {
    await PermissionService.requirePermission(ctx.user.id, 'manage_users');

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.from('user_roles').insert({
      company_id: ctx.company.id,
      user_id: userId,
      role_id: roleId,
    });

    if (error && !error.message.includes('duplicate')) {
      throw new DatabaseError(error.message);
    }

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: 'user_roles.assigned',
      module: 'users',
      record_type: 'user_roles',
      new_value: { user_id: userId, role_id: roleId },
    });
  },

  async removeRole(userId: string, roleId: string, ctx: RequestContext): Promise<void> {
    await PermissionService.requirePermission(ctx.user.id, 'manage_users');

    const supabase = await createServerSupabaseClient();
    await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('role_id', roleId)
      .eq('company_id', ctx.company.id);

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: 'user_roles.removed',
      module: 'users',
      record_type: 'user_roles',
      new_value: { user_id: userId, role_id: roleId },
    });
  },

  async assignSite(userId: string, siteId: string, ctx: RequestContext): Promise<void> {
    await PermissionService.requirePermission(ctx.user.id, 'manage_users');

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.from('user_sites').insert({
      company_id: ctx.company.id,
      user_id: userId,
      site_id: siteId,
    });

    if (error && !error.message.includes('duplicate')) {
      throw new DatabaseError(error.message);
    }

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: 'user_sites.assigned',
      module: 'users',
      record_type: 'user_sites',
      new_value: { user_id: userId, site_id: siteId },
    });
  },

  async removeSite(userId: string, siteId: string, ctx: RequestContext): Promise<void> {
    await PermissionService.requirePermission(ctx.user.id, 'manage_users');

    const supabase = await createServerSupabaseClient();
    await supabase
      .from('user_sites')
      .delete()
      .eq('user_id', userId)
      .eq('site_id', siteId)
      .eq('company_id', ctx.company.id);

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: 'user_sites.removed',
      module: 'users',
      record_type: 'user_sites',
      new_value: { user_id: userId, site_id: siteId },
    });
  },
};
