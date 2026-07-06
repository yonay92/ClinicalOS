import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PermissionService } from '@/services/permissions/PermissionService';
import { AuditService } from '@/services/audit/AuditService';
import { NotFoundError, DatabaseError } from '@/lib/api/errors';
import type { Site, UserSite, SiteAssignedStudy, SiteAssignedUser } from '@/types/sites';
import type { RequestContext } from '@/types/api';

export type SiteListFilters = {
  search?: string | undefined;
  view?: 'active' | 'archived' | 'all' | undefined;
};

function matchesView(site: Pick<Site, 'status'>, view?: 'active' | 'archived' | 'all'): boolean {
  if (view === 'archived') return site.status === 'archived';
  if (view === 'all') return true;
  return site.status !== 'archived';
}

function matchesSearch(site: Pick<Site, 'name' | 'site_code' | 'city'>, search?: string): boolean {
  if (!search) return true;
  const term = search.toLowerCase();
  return (
    site.name.toLowerCase().includes(term) ||
    (site.site_code?.toLowerCase().includes(term) ?? false) ||
    (site.city?.toLowerCase().includes(term) ?? false)
  );
}

export const SiteService = {
  async list(ctx: RequestContext, filters?: SiteListFilters): Promise<Site[]> {
    const supabase = await createServerSupabaseClient();
    const hasAllSites = await PermissionService.hasPermission(ctx.user.id, 'view_all_sites');

    if (hasAllSites) {
      let query = supabase
        .from('sites')
        .select(
          'id, company_id, name, site_code, principal_investigator, address, city, state, zip_code, phone, timezone, status, created_at, updated_at',
        )
        .eq('company_id', ctx.company.id);

      if (filters?.view === 'archived') {
        query = query.eq('status', 'archived');
      } else if (filters?.view !== 'all') {
        query = query.neq('status', 'archived');
      }
      if (filters?.search) {
        const term = filters.search.replace(/[(),%]/g, '').trim();
        if (term) {
          query = query.or(`name.ilike.%${term}%,site_code.ilike.%${term}%,city.ilike.%${term}%`);
        }
      }

      const { data } = await query.order('name');
      return (data as Site[]) ?? [];
    }

    const { data } = await supabase
      .from('user_sites')
      .select(
        `
        sites!inner(
          id, company_id, name, site_code, principal_investigator, address, city, state, zip_code, phone, timezone, status, created_at, updated_at
        )
      `,
      )
      .eq('user_id', ctx.user.id)
      .eq('company_id', ctx.company.id);

    const sites =
      (data as Array<{ sites: Site }> | null)?.map((r) => r.sites).filter(Boolean) ?? [];
    return sites.filter((s) => matchesView(s, filters?.view) && matchesSearch(s, filters?.search));
  },

  async getById(siteId: string, ctx: RequestContext): Promise<Site> {
    await PermissionService.requireSiteAccess(ctx.user.id, siteId);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('sites')
      .select(
        'id, company_id, name, site_code, principal_investigator, address, city, state, zip_code, phone, timezone, status, created_at, updated_at',
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
      principal_investigator?: string;
      address?: string;
      city?: string;
      state?: string;
      zip_code?: string;
      phone?: string;
      timezone?: string;
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
        'id, company_id, name, site_code, principal_investigator, address, city, state, zip_code, phone, timezone, status, created_at, updated_at',
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
        | 'name'
        | 'site_code'
        | 'principal_investigator'
        | 'address'
        | 'city'
        | 'state'
        | 'zip_code'
        | 'phone'
        | 'timezone'
        | 'status'
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
        'id, company_id, name, site_code, principal_investigator, address, city, state, zip_code, phone, timezone, status, created_at, updated_at',
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

  async archiveSite(siteId: string, ctx: RequestContext, reason?: string): Promise<Site> {
    await PermissionService.requirePermission(ctx.user.id, 'manage_sites');

    const site = await this.getById(siteId, ctx);
    if (site.status === 'archived') return site;

    const supabase = await createServerSupabaseClient();

    const { count: enrolledSubjectCount } = await supabase
      .from('subjects')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', siteId)
      .eq('company_id', ctx.company.id);

    const subjectCount = enrolledSubjectCount ?? 0;

    await PermissionService.guardDangerousOperation(ctx.user.id, 'force_archive_site', {
      blocked: subjectCount > 0,
      reason,
      blockedMessage: `Cannot archive a site with ${subjectCount} enrolled subject(s). Requires the Force Archive Site permission.`,
    });

    const { data: updated, error } = await supabase
      .from('sites')
      .update({ status: 'archived' })
      .eq('id', siteId)
      .eq('company_id', ctx.company.id)
      .select(
        'id, company_id, name, site_code, principal_investigator, address, city, state, zip_code, phone, timezone, status, created_at, updated_at',
      )
      .single();

    if (error || !updated) throw new DatabaseError(error?.message ?? 'Failed to archive site');

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: 'site.archived',
      module: 'settings',
      record_type: 'sites',
      record_id: siteId,
      old_value: { status: site.status },
      new_value: {
        status: 'archived',
        enrolled_subject_count: subjectCount,
        forced: subjectCount > 0,
        reason: reason?.trim() || null,
      },
    });

    return updated as Site;
  },

  async listAssignedStudies(siteId: string, ctx: RequestContext): Promise<SiteAssignedStudy[]> {
    await PermissionService.requireSiteAccess(ctx.user.id, siteId);

    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from('study_sites')
      .select('id, studies!inner(id, study_name, protocol_number, status)')
      .eq('site_id', siteId)
      .eq('company_id', ctx.company.id);

    type Row = {
      id: string;
      studies: { id: string; study_name: string; protocol_number: string | null; status: string };
    };

    return ((data as Row[] | null) ?? []).map((row) => ({
      id: row.id,
      study_id: row.studies.id,
      study_name: row.studies.study_name,
      protocol_number: row.studies.protocol_number,
      status: row.studies.status,
    }));
  },

  async listAssignedUsers(siteId: string, ctx: RequestContext): Promise<SiteAssignedUser[]> {
    await PermissionService.requireSiteAccess(ctx.user.id, siteId);

    const supabase = await createServerSupabaseClient();
    const { data: userSites } = await supabase
      .from('user_sites')
      .select('user_id, profiles!inner(id, full_name, email)')
      .eq('site_id', siteId)
      .eq('company_id', ctx.company.id);

    type UserSiteRow = {
      user_id: string;
      profiles: { id: string; full_name: string; email: string };
    };
    const rows = (userSites as UserSiteRow[] | null) ?? [];
    if (rows.length === 0) return [];

    const userIds = rows.map((r) => r.user_id);
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('user_id, roles!inner(id, key, name)')
      .eq('company_id', ctx.company.id)
      .in('user_id', userIds);

    type RoleRow = { user_id: string; roles: SiteAssignedUser['roles'][number] };
    const rolesByUser = new Map<string, SiteAssignedUser['roles']>();
    for (const ur of (userRoles as RoleRow[] | null) ?? []) {
      const list = rolesByUser.get(ur.user_id) ?? [];
      list.push(ur.roles);
      rolesByUser.set(ur.user_id, list);
    }

    return rows.map((r) => ({
      id: r.profiles.id,
      full_name: r.profiles.full_name,
      email: r.profiles.email,
      roles: rolesByUser.get(r.user_id) ?? [],
    }));
  },
};
