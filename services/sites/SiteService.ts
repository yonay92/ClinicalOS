import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PermissionService } from '@/services/permissions/PermissionService';
import { AuditService } from '@/services/audit/AuditService';
import { NotFoundError, DatabaseError } from '@/lib/api/errors';
import type { Site, UserSite } from '@/types/sites';
import type { RequestContext } from '@/types/api';

export const SiteService = {
  async list(ctx: RequestContext): Promise<Site[]> {
    const supabase = await createServerSupabaseClient();
    const hasAllSites = await PermissionService.hasPermission(ctx.user.id, 'view_all_sites');

    if (hasAllSites) {
      const { data } = await supabase
        .from('sites')
        .select(
          'id, company_id, name, site_code, address, city, state, zip_code, phone, status, created_at, updated_at',
        )
        .eq('company_id', ctx.company.id)
        .order('name');
      return (data as Site[]) ?? [];
    }

    const { data } = await supabase
      .from('user_sites')
      .select(
        `
        sites!inner(
          id, company_id, name, site_code, address, city, state, zip_code, phone, status, created_at, updated_at
        )
      `,
      )
      .eq('user_id', ctx.user.id)
      .eq('company_id', ctx.company.id);

    return (data as Array<{ sites: Site }> | null)?.map((r) => r.sites).filter(Boolean) ?? [];
  },

  async getById(siteId: string, ctx: RequestContext): Promise<Site> {
    await PermissionService.requireSiteAccess(ctx.user.id, siteId);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('sites')
      .select(
        'id, company_id, name, site_code, address, city, state, zip_code, phone, status, created_at, updated_at',
      )
      .eq('id', siteId)
      .eq('company_id', ctx.company.id)
      .single();

    if (error || !data) throw new NotFoundError('Site');
    return data as Site;
  },

  async create(
    input: {
      name: string;
      site_code?: string;
      address?: string;
      city?: string;
      state?: string;
      zip_code?: string;
      phone?: string;
    },
    ctx: RequestContext,
  ): Promise<Site> {
    await PermissionService.requirePermission(ctx.user.id, 'manage_sites');

    const supabase = await createServerSupabaseClient();

    const { count: existingSiteCount } = await supabase
      .from('sites')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', ctx.company.id);
    const isFirstSite = (existingSiteCount ?? 0) === 0;

    const { data, error } = await supabase
      .from('sites')
      .insert({ company_id: ctx.company.id, ...input })
      .select(
        'id, company_id, name, site_code, address, city, state, zip_code, phone, status, created_at, updated_at',
      )
      .single();

    if (error || !data) throw new DatabaseError(error?.message ?? 'Failed to create site');

    const site = data as Site;

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: 'site.created',
      module: 'settings',
      record_type: 'sites',
      record_id: site.id,
      new_value: input as Record<string, unknown>,
    });

    // Bootstrap convenience: the very first site in a company has no one
    // assigned to it yet, and there's no "manage access" UI moment to do it
    // manually until this site already exists. Auto-assign every admin so
    // the assignment is explicit and visible in Settings > Users, on top of
    // the `view_all_sites` permission bypass admins already have.
    if (isFirstSite) {
      const { data: adminUserRoles } = await supabase
        .from('user_roles')
        .select('user_id, roles!inner(key)')
        .eq('company_id', ctx.company.id)
        .eq('roles.key', 'admin');

      const adminUserIds = (adminUserRoles as Array<{ user_id: string }> | null)?.map(
        (ur) => ur.user_id,
      );

      if (adminUserIds && adminUserIds.length > 0) {
        await supabase.from('user_sites').upsert(
          adminUserIds.map((userId) => ({
            company_id: ctx.company.id,
            user_id: userId,
            site_id: site.id,
          })),
          { onConflict: 'user_id,site_id', ignoreDuplicates: true },
        );

        await AuditService.log({
          company_id: ctx.company.id,
          user_id: ctx.user.id,
          action: 'user_sites.auto_assigned',
          module: 'settings',
          record_type: 'user_sites',
          record_id: site.id,
          new_value: { site_id: site.id, user_ids: adminUserIds },
        });
      }
    }

    return site;
  },

  async update(
    siteId: string,
    input: Partial<
      Pick<
        Site,
        'name' | 'site_code' | 'address' | 'city' | 'state' | 'zip_code' | 'phone' | 'status'
      >
    >,
    ctx: RequestContext,
  ): Promise<Site> {
    await PermissionService.requirePermission(ctx.user.id, 'manage_sites');

    const supabase = await createServerSupabaseClient();
    const { data: old } = await supabase
      .from('sites')
      .select('id, name, status')
      .eq('id', siteId)
      .eq('company_id', ctx.company.id)
      .maybeSingle();

    if (!old) throw new NotFoundError('Site');

    const { data, error } = await supabase
      .from('sites')
      .update(input)
      .eq('id', siteId)
      .eq('company_id', ctx.company.id)
      .select(
        'id, company_id, name, site_code, address, city, state, zip_code, phone, status, created_at, updated_at',
      )
      .single();

    if (error || !data) throw new DatabaseError(error?.message ?? 'Failed to update site');

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: 'site.updated',
      module: 'settings',
      record_type: 'sites',
      record_id: siteId,
      old_value: old as Record<string, unknown>,
      new_value: input as Record<string, unknown>,
    });

    return data as Site;
  },

  async getUserSites(userId: string, companyId: string): Promise<UserSite[]> {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from('user_sites')
      .select('id, company_id, user_id, site_id, created_at')
      .eq('user_id', userId)
      .eq('company_id', companyId);

    return (data as UserSite[]) ?? [];
  },
};
