import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SiteService } from '@/services/sites/SiteService';
import { PermissionService } from '@/services/permissions/PermissionService';
import { AuditService } from '@/services/audit/AuditService';
import { PermissionDeniedError } from '@/lib/api/errors';

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
  for (const key of ['select', 'eq', 'order', 'insert', 'update', 'upsert', 'in']) {
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
