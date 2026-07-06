import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SiteService } from '@/services/sites/SiteService';
import { PermissionService } from '@/services/permissions/PermissionService';
import { AuditService } from '@/services/audit/AuditService';
import { PermissionDeniedError, BusinessRuleError } from '@/lib/api/errors';

vi.mock('@/services/audit/AuditService', () => ({
  AuditService: { log: vi.fn() },
}));

const COMPANY_ID = 'company-uuid';
const USER_ID = 'user-uuid';
const SITE_ID = 'site-uuid';

function makeCtx() {
  return {
    user: {
      id: USER_ID,
      company_id: COMPANY_ID,
      full_name: 'Admin User',
      email: 'admin@example.com',
      phone: null,
      avatar_file_id: null,
      status: 'active' as const,
      last_login_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    company: {
      id: COMPANY_ID,
      name: 'Test Company',
      legal_name: null,
      status: 'active' as const,
      subscription_plan: null,
      timezone: 'UTC',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

function queryStub(data: unknown, error: unknown = null, count: number | null = null) {
  const resolved = Promise.resolve({ data, error, count });
  const stub: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    single: vi.fn().mockResolvedValue({ data, error }),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  for (const key of ['select', 'eq', 'neq', 'or', 'order', 'insert', 'update', 'upsert', 'in']) {
    (stub[key] as ReturnType<typeof vi.fn>).mockReturnValue(stub);
  }
  return stub;
}

function makeSupabaseClient(
  ...responses: Array<{ data: unknown; error?: unknown; count?: number | null }>
) {
  const from = vi.fn();
  for (const r of responses) {
    from.mockReturnValueOnce(queryStub(r.data, r.error ?? null, r.count ?? null));
  }
  return { from } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SiteService.create', () => {
  const input = { name: 'Main Research Center' };

  it('throws PermissionDeniedError when user lacks manage_sites', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockRejectedValue(
      new PermissionDeniedError('manage_sites'),
    );

    await expect(SiteService.create(input, makeCtx())).rejects.toThrow(PermissionDeniedError);
  });

  it('does not auto-assign anyone when the company already has sites', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const siteRow = { id: SITE_ID, company_id: COMPANY_ID, name: input.name, status: 'active' };

    const client = makeSupabaseClient(
      { data: null, count: 1 }, // existing site count -> not the first site
      { data: siteRow }, // sites insert
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await SiteService.create(input, makeCtx());

    expect(result.id).toBe(SITE_ID);
    expect(AuditService.log).toHaveBeenCalledTimes(1);
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'site.created' }),
    );
  });

  it('auto-assigns every admin-role user when this is the first site', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const siteRow = { id: SITE_ID, company_id: COMPANY_ID, name: input.name, status: 'active' };
    const adminUserRoles = [{ user_id: 'admin-1' }, { user_id: 'admin-2' }];

    const client = makeSupabaseClient(
      { data: null, count: 0 }, // existing site count -> this is the first site
      { data: siteRow }, // sites insert
      { data: adminUserRoles }, // user_roles lookup for admin-role users
      { data: null }, // user_sites upsert
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await SiteService.create(input, makeCtx());

    expect(result.id).toBe(SITE_ID);
    expect(AuditService.log).toHaveBeenCalledTimes(2);
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user_sites.auto_assigned',
        new_value: expect.objectContaining({
          site_id: SITE_ID,
          user_ids: ['admin-1', 'admin-2'],
        }),
      }),
    );
  });

  it('skips auto-assignment when it is the first site but no admin-role users exist', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const siteRow = { id: SITE_ID, company_id: COMPANY_ID, name: input.name, status: 'active' };

    const client = makeSupabaseClient(
      { data: null, count: 0 },
      { data: siteRow },
      { data: [] }, // no admin-role users
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await SiteService.create(input, makeCtx());

    expect(result.id).toBe(SITE_ID);
    expect(AuditService.log).toHaveBeenCalledTimes(1);
  });
});

describe('SiteService.archiveSite', () => {
  it('returns the site unchanged when it is already archived', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.spyOn(PermissionService, 'requireSiteAccess').mockResolvedValue(undefined);

    const archivedSite = {
      id: SITE_ID,
      company_id: COMPANY_ID,
      name: 'Site A',
      status: 'archived',
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(
      makeSupabaseClient({ data: archivedSite }),
    );

    const result = await SiteService.archiveSite(SITE_ID, makeCtx());

    expect(result.status).toBe('archived');
    expect(AuditService.log).not.toHaveBeenCalled();
  });

  it('throws BusinessRuleError when subjects are enrolled and the caller lacks force_archive_site', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.spyOn(PermissionService, 'requireSiteAccess').mockResolvedValue(undefined);
    vi.spyOn(PermissionService, 'hasPermission').mockResolvedValue(false);

    const siteRow = { id: SITE_ID, company_id: COMPANY_ID, name: 'Site A', status: 'active' };
    const client = makeSupabaseClient(
      { data: siteRow }, // getById
      { data: null, count: 3 }, // enrolled subjects count
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await expect(SiteService.archiveSite(SITE_ID, makeCtx())).rejects.toThrow(BusinessRuleError);
  });

  it('throws BusinessRuleError when the caller holds force_archive_site but gives no reason', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.spyOn(PermissionService, 'requireSiteAccess').mockResolvedValue(undefined);
    vi.spyOn(PermissionService, 'hasPermission').mockResolvedValue(true);

    const siteRow = { id: SITE_ID, company_id: COMPANY_ID, name: 'Site A', status: 'active' };
    const client = makeSupabaseClient({ data: siteRow }, { data: null, count: 2 });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await expect(SiteService.archiveSite(SITE_ID, makeCtx())).rejects.toThrow(BusinessRuleError);
  });

  it('archives with enrolled subjects when the caller holds force_archive_site and gives a reason', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.spyOn(PermissionService, 'requireSiteAccess').mockResolvedValue(undefined);
    vi.spyOn(PermissionService, 'hasPermission').mockResolvedValue(true);

    const siteRow = { id: SITE_ID, company_id: COMPANY_ID, name: 'Site A', status: 'active' };
    const archivedSite = { ...siteRow, status: 'archived' };
    const client = makeSupabaseClient(
      { data: siteRow },
      { data: null, count: 2 },
      { data: archivedSite },
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await SiteService.archiveSite(SITE_ID, makeCtx(), 'Site closure requested');

    expect(result.status).toBe('archived');
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'site.archived',
        new_value: expect.objectContaining({
          enrolled_subject_count: 2,
          forced: true,
          reason: 'Site closure requested',
        }),
      }),
    );
  });

  it('archives directly when there are no enrolled subjects', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.spyOn(PermissionService, 'requireSiteAccess').mockResolvedValue(undefined);
    const hasPermissionSpy = vi.spyOn(PermissionService, 'hasPermission');

    const siteRow = { id: SITE_ID, company_id: COMPANY_ID, name: 'Site A', status: 'active' };
    const archivedSite = { ...siteRow, status: 'archived' };
    const client = makeSupabaseClient(
      { data: siteRow },
      { data: null, count: 0 },
      { data: archivedSite },
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await SiteService.archiveSite(SITE_ID, makeCtx());

    expect(result.status).toBe('archived');
    expect(hasPermissionSpy).not.toHaveBeenCalled();
  });
});

describe('SiteService.listAssignedStudies', () => {
  it('maps study_sites rows joined with studies', async () => {
    vi.spyOn(PermissionService, 'requireSiteAccess').mockResolvedValue(undefined);

    const rows = [
      {
        id: 'ss-1',
        studies: {
          id: 'study-1',
          study_name: 'Study A',
          protocol_number: 'PROTO-1',
          status: 'active',
        },
      },
    ];
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeSupabaseClient({ data: rows }));

    const result = await SiteService.listAssignedStudies(SITE_ID, makeCtx());

    expect(result).toEqual([
      {
        id: 'ss-1',
        study_id: 'study-1',
        study_name: 'Study A',
        protocol_number: 'PROTO-1',
        status: 'active',
      },
    ]);
  });
});

describe('SiteService.listAssignedUsers', () => {
  it('returns an empty array without extra queries when no one is assigned', async () => {
    vi.spyOn(PermissionService, 'requireSiteAccess').mockResolvedValue(undefined);
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeSupabaseClient({ data: [] }));

    const result = await SiteService.listAssignedUsers(SITE_ID, makeCtx());

    expect(result).toEqual([]);
  });

  it('attaches roles to each assigned user', async () => {
    vi.spyOn(PermissionService, 'requireSiteAccess').mockResolvedValue(undefined);

    const userSites = [
      {
        user_id: 'user-1',
        profiles: { id: 'user-1', full_name: 'Alice', email: 'alice@example.com' },
      },
    ];
    const userRoles = [{ user_id: 'user-1', roles: { id: 'role-crc', key: 'crc', name: 'CRC' } }];

    const client = makeSupabaseClient({ data: userSites }, { data: userRoles });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await SiteService.listAssignedUsers(SITE_ID, makeCtx());

    expect(result).toEqual([
      {
        id: 'user-1',
        full_name: 'Alice',
        email: 'alice@example.com',
        roles: [{ id: 'role-crc', key: 'crc', name: 'CRC' }],
      },
    ]);
  });
});

describe('SiteService.list — search and view filters', () => {
  it('excludes archived sites by default', async () => {
    vi.spyOn(PermissionService, 'hasPermission').mockResolvedValue(true);

    const client = makeSupabaseClient({ data: [] });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await SiteService.list(makeCtx());

    const fromMock = (client as { from: ReturnType<typeof vi.fn> }).from;
    const usedStub = fromMock.mock.results[0]?.value as { neq: ReturnType<typeof vi.fn> };
    expect(usedStub.neq).toHaveBeenCalledWith('status', 'archived');
  });

  it('applies a search term across name, site_code, and city', async () => {
    vi.spyOn(PermissionService, 'hasPermission').mockResolvedValue(true);

    const client = makeSupabaseClient({ data: [] });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await SiteService.list(makeCtx(), { search: 'Boston' });

    const fromMock = (client as { from: ReturnType<typeof vi.fn> }).from;
    const usedStub = fromMock.mock.results[0]?.value as { or: ReturnType<typeof vi.fn> };
    expect(usedStub.or).toHaveBeenCalledWith(
      'name.ilike.%Boston%,site_code.ilike.%Boston%,city.ilike.%Boston%',
    );
  });

  it('returns only archived sites when view=archived', async () => {
    vi.spyOn(PermissionService, 'hasPermission').mockResolvedValue(true);

    const client = makeSupabaseClient({ data: [] });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await SiteService.list(makeCtx(), { view: 'archived' });

    const fromMock = (client as { from: ReturnType<typeof vi.fn> }).from;
    const usedStub = fromMock.mock.results[0]?.value as { eq: ReturnType<typeof vi.fn> };
    expect(usedStub.eq).toHaveBeenCalledWith('status', 'archived');
  });
});
