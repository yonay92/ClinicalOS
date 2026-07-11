import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PermissionService } from '@/services/permissions/PermissionService';
import { AuditService } from '@/services/audit/AuditService';
import { NotFoundError, DatabaseError } from '@/lib/api/errors';
import type { RequestContext } from '@/types/api';

export const RoleService = {
  async setPermission(
    roleId: string,
    permissionKey: string,
    allowed: boolean,
    ctx: RequestContext,
  ): Promise<void> {
    await PermissionService.requirePermission(ctx.user.id, 'manage_users');

    const supabase = await createServerSupabaseClient();

    const { data: role } = await supabase
      .from('roles')
      .select('id')
      .eq('id', roleId)
      .eq('company_id', ctx.company.id)
      .maybeSingle();
    if (!role) throw new NotFoundError('Role');

    const { data: permission } = await supabase
      .from('permissions')
      .select('id')
      .eq('key', permissionKey)
      .maybeSingle();
    if (!permission) throw new NotFoundError('Permission');

    const { error } = await supabase.from('role_permissions').upsert(
      {
        company_id: ctx.company.id,
        role_id: roleId,
        permission_id: (permission as { id: string }).id,
        allowed,
      },
      { onConflict: 'company_id,role_id,permission_id' },
    );

    if (error) throw new DatabaseError(error.message);

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: 'role_permissions.updated',
      module: 'settings',
      record_type: 'role_permissions',
      record_id: roleId,
      new_value: { permission_key: permissionKey, allowed },
    });
  },
};
