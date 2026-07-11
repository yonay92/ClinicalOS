/**
 * Integration tests: site isolation
 *
 * Verifies that SiteService and PermissionService correctly restrict access
 * to sites based on user_sites assignments and the view_all_sites permission.
 * No cross-site data leaks are permitted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SiteService } from '@/services/sites/SiteService';
import { PermissionService } from '@/services/permissions/PermissionService';
import { SubjectService } from '@/services/subjects/SubjectService';
import { PermissionDeniedError, NotFoundError } from '@/lib/api/errors';

// ── helpers ─────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-uuid';
const SITE_A = 'site-a-uuid';
const SITE_B = 'site-b-uuid';
const USER_ID = 'user-uuid';

function makeCtx(userId = USER_ID) {
  return {
    user: {
      id: userId,
      company_id: COMPANY_ID,
      full_name: 'CRC User',
      email: 'crc@example.com',
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

function makeRpcClient(hasPermission: boolean) {
  return { rpc: vi.fn().mockResolvedValue({ data: hasPermission }) } as never;
}

function makeSiteListClient(siteRows: unknown[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  };
  const promise = Promise.resolve({ data: siteRows, error: null });
  Object.assign(chain, {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  });
  return { from: vi.fn().mockReturnValue(chain) } as never;
}

function makeSingleClient(row: unknown, error: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error }),
    single: vi.fn().mockResolvedValue({ data: row, error }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  };
  const promise = Promise.resolve({ data: row, error });
  Object.assign(chain, {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  });
  return { from: vi.fn().mockReturnValue(chain) } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── SiteService.list — scoped vs all-sites ──────────────────────────────────

describe('SiteService.list() — site access scoping', () => {
  it('returns all company sites when user has view_all_sites', async () => {
    const allSites = [
      { id: SITE_A, company_id: COMPANY_ID, name: 'Site A' },
      { id: SITE_B, company_id: COMPANY_ID, name: 'Site B' },
    ];
    // Call 1: SiteService.list()'s own supabase → sites query
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeSiteListClient(allSites));
    // Call 2: hasPermission's supabase → rpc → true
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeRpcClient(true));

    const result = await SiteService.list(makeCtx());
    expect(result).toHaveLength(2);
  });

  it('returns only assigned sites when user lacks view_all_sites', async () => {
    const userSiteRows = [{ sites: { id: SITE_A, company_id: COMPANY_ID, name: 'Site A' } }];
    // Call 1: SiteService.list()'s own supabase → user_sites join query
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeSiteListClient(userSiteRows));
    // Call 2: hasPermission's supabase → rpc → false
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeRpcClient(false));

    const result = await SiteService.list(makeCtx());
    expect(result.length).toBeLessThanOrEqual(1);
  });

  it('returns empty array when user has no site assignments', async () => {
    // Call 1: SiteService.list()'s own supabase
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeSiteListClient([]));
    // Call 2: hasPermission → rpc → false
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeRpcClient(false));

    const result = await SiteService.list(makeCtx());
    expect(result).toEqual([]);
  });
});

// ── SiteService.getById — access guard ─────────────────────────────────────

describe('SiteService.getById() — access enforcement', () => {
  it('allows access when user has view_all_sites and site exists', async () => {
    const siteRow = {
      id: SITE_A,
      company_id: COMPANY_ID,
      name: 'Site A',
      site_code: null,
      address: null,
      city: null,
      state: null,
      zip_code: null,
      phone: null,
      status: 'active',
      created_at: '',
      updated_at: '',
    };
    // Call 1: canAccessSite's own client (consumed but .from() never called since hasAllSites=true)
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeSingleClient(null));
    // Call 2: hasPermission's client → rpc → true
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeRpcClient(true));
    // Call 3: SiteService.getById's own client → site query
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeSingleClient(siteRow));

    const result = await SiteService.getById(SITE_A, makeCtx());
    expect(result.id).toBe(SITE_A);
  });

  it('throws NotFoundError when site does not belong to company', async () => {
    // Call 1: canAccessSite's own client (placeholder — .from() not called since hasAllSites=true)
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeSingleClient(null));
    // Call 2: hasPermission's client → rpc → true
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeRpcClient(true));
    // Call 3: SiteService.getById → site query → null (company_id filter excludes it)
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeSingleClient(null));

    await expect(SiteService.getById('foreign-site', makeCtx())).rejects.toThrow(NotFoundError);
  });
});

// ── SiteService.create — permission guard ───────────────────────────────────

describe('SiteService.create() — permission enforcement', () => {
  it('throws PermissionDeniedError when user lacks manage_sites', async () => {
    // requirePermission(manage_sites) → hasPermission → false → throws
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeRpcClient(false));
    // Fallback getUserPermissions → empty
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeSiteListClient([]));

    await expect(SiteService.create({ name: 'New Site' }, makeCtx())).rejects.toThrow(
      PermissionDeniedError,
    );
  });
});

// ── PermissionService.canAccessSite ────────────────────────────────────────

describe('PermissionService.canAccessSite()', () => {
  it('grants access via view_all_sites permission', async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeRpcClient(true));
    const result = await PermissionService.canAccessSite(USER_ID, SITE_A);
    expect(result).toBe(true);
  });

  it('grants access when user is explicitly assigned to the site', async () => {
    // Call 1: canAccessSite's own client → user_sites → row found
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeSingleClient({ id: 'us-1' }));
    // Call 2: hasPermission's client → rpc → false (no view_all_sites)
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeRpcClient(false));
    const result = await PermissionService.canAccessSite(USER_ID, SITE_A);
    expect(result).toBe(true);
  });

  it('denies access when user has no site assignment and no override permission', async () => {
    // Call 1: canAccessSite's own client → user_sites → null
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeSingleClient(null));
    // Call 2: hasPermission's client → rpc → false
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeRpcClient(false));
    const result = await PermissionService.canAccessSite(USER_ID, SITE_B);
    expect(result).toBe(false);
  });

  it('requireSiteAccess throws PermissionDeniedError for denied site', async () => {
    // Call 1: canAccessSite's own client → user_sites → null
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeSingleClient(null));
    // Call 2: hasPermission's client → rpc → false
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeRpcClient(false));
    await expect(PermissionService.requireSiteAccess(USER_ID, SITE_B)).rejects.toThrow(
      PermissionDeniedError,
    );
  });
});

// ── SubjectService.create — site access enforcement ────────────────────────

describe('SubjectService.create() — site access enforcement', () => {
  const input = { site_id: SITE_B, study_id: 'study-uuid', subject_number: '001-001' };

  it('throws PermissionDeniedError when the user lacks access to the target site', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.spyOn(PermissionService, 'requireSiteAccess').mockRejectedValue(
      new PermissionDeniedError('site_access'),
    );

    await expect(SubjectService.create(input, makeCtx())).rejects.toThrow(PermissionDeniedError);
  });

  it('checks site access for the exact site_id supplied, not an implicit default', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    const requireSiteAccessSpy = vi
      .spyOn(PermissionService, 'requireSiteAccess')
      .mockResolvedValue(undefined);
    // Study lookup returns nothing — creation still fails downstream, but the
    // site-access check must have already run with the right site_id.
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeSingleClient(null));

    await expect(SubjectService.create(input, makeCtx())).rejects.toThrow(NotFoundError);
    expect(requireSiteAccessSpy).toHaveBeenCalledWith(USER_ID, SITE_B);
  });
});

// ── SiteService.getUserSites — always user-scoped ──────────────────────────

describe('SiteService.getUserSites()', () => {
  it('returns only the sites assigned to the specific user', async () => {
    const rows = [
      { id: 'us-1', company_id: COMPANY_ID, user_id: USER_ID, site_id: SITE_A, created_at: '' },
    ];
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: undefined as unknown,
    };
    const promise = Promise.resolve({ data: rows, error: null });
    Object.assign(chain, {
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
      finally: promise.finally.bind(promise),
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(chain),
    } as never);

    const result = await SiteService.getUserSites(USER_ID, COMPANY_ID);
    expect(result).toHaveLength(1);
    expect(result[0]?.site_id).toBe(SITE_A);
  });
});
