import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PermissionService } from '@/services/permissions/PermissionService';
import { PermissionDeniedError, BusinessRuleError } from '@/lib/api/errors';

const mockFrom = vi.fn();
const mockSupabase = { from: mockFrom };

vi.mocked(createServerSupabaseClient).mockResolvedValue(mockSupabase as never);

/**
 * Builds a fluent Supabase query-builder stub.
 * The stub is thenable so `await supabase.from(...).select(...).eq(...)` resolves
 * to `{ data, error }` — matching the real Supabase client behaviour.
 */
function queryStub(data: unknown, error: unknown = null) {
  const resolved = Promise.resolve({ data, error });
  const stub: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    single: vi.fn().mockResolvedValue({ data, error }),
    in: vi.fn().mockReturnThis(),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  // Ensure each chaining method returns the same stub
  (stub.select as ReturnType<typeof vi.fn>).mockReturnValue(stub);
  (stub.eq as ReturnType<typeof vi.fn>).mockReturnValue(stub);
  (stub.order as ReturnType<typeof vi.fn>).mockReturnValue(stub);
  (stub.limit as ReturnType<typeof vi.fn>).mockReturnValue(stub);
  (stub.in as ReturnType<typeof vi.fn>).mockReturnValue(stub);
  return stub;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createServerSupabaseClient).mockResolvedValue(mockSupabase as never);
});

// ── getUserPermissions ────────────────────────────────────────────────────────

describe('PermissionService.getUserPermissions', () => {
  it('returns empty array when user has no roles', async () => {
    mockFrom.mockReturnValue(queryStub([]));

    const result = await PermissionService.getUserPermissions('user-1');

    expect(result).toEqual([]);
  });

  it('returns allowed permission keys from role_permissions', async () => {
    const data = [
      {
        role_id: 'role-1',
        roles: {
          role_permissions: [
            { allowed: true, permissions: { key: 'manage_users' } },
            { allowed: false, permissions: { key: 'manage_sites' } },
            { allowed: true, permissions: { key: 'view_subjects' } },
          ],
        },
      },
    ];
    mockFrom.mockReturnValue(queryStub(data));

    const result = await PermissionService.getUserPermissions('user-1');

    expect(result).toContain('manage_users');
    expect(result).toContain('view_subjects');
    expect(result).not.toContain('manage_sites');
  });

  it('deduplicates permissions granted by multiple roles', async () => {
    const data = [
      {
        role_id: 'role-1',
        roles: {
          role_permissions: [{ allowed: true, permissions: { key: 'manage_users' } }],
        },
      },
      {
        role_id: 'role-2',
        roles: {
          role_permissions: [{ allowed: true, permissions: { key: 'manage_users' } }],
        },
      },
    ];
    mockFrom.mockReturnValue(queryStub(data));

    const result = await PermissionService.getUserPermissions('user-1');

    expect(result.filter((p) => p === 'manage_users')).toHaveLength(1);
  });

  it('returns empty array on Supabase error', async () => {
    mockFrom.mockReturnValue(queryStub(null, { message: 'DB error' }));

    const result = await PermissionService.getUserPermissions('user-1');

    expect(result).toEqual([]);
  });

  it('returns empty array when data is null', async () => {
    mockFrom.mockReturnValue(queryStub(null));

    const result = await PermissionService.getUserPermissions('user-1');

    expect(result).toEqual([]);
  });
});

// ── hasPermission ─────────────────────────────────────────────────────────────

describe('PermissionService.hasPermission', () => {
  it('returns true directly when RPC returns true', async () => {
    const rpcClient = { rpc: vi.fn().mockResolvedValue({ data: true }) };
    vi.mocked(createServerSupabaseClient).mockResolvedValue(rpcClient as never);

    const result = await PermissionService.hasPermission('user-1', 'manage_users');

    expect(result).toBe(true);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns false directly when RPC returns false', async () => {
    const rpcClient = { rpc: vi.fn().mockResolvedValue({ data: false }) };
    vi.mocked(createServerSupabaseClient).mockResolvedValue(rpcClient as never);

    const result = await PermissionService.hasPermission('user-1', 'manage_users');

    expect(result).toBe(false);
  });

  it('falls back to getUserPermissions when RPC returns null', async () => {
    // First call: RPC client (returns null → triggers fallback)
    const rpcClient = { rpc: vi.fn().mockResolvedValue({ data: null }) };
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(rpcClient as never);

    // Second call: used by getUserPermissions fallback
    const data = [
      {
        role_id: 'role-1',
        roles: {
          role_permissions: [{ allowed: true, permissions: { key: 'manage_users' } }],
        },
      },
    ];
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(mockSupabase as never);
    mockFrom.mockReturnValue(queryStub(data));

    const result = await PermissionService.hasPermission('user-1', 'manage_users');

    expect(result).toBe(true);
  });

  it('returns false via fallback when user has no matching permission', async () => {
    const rpcClient = { rpc: vi.fn().mockResolvedValue({ data: null }) };
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(rpcClient as never);

    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(mockSupabase as never);
    mockFrom.mockReturnValue(queryStub([]));

    const result = await PermissionService.hasPermission('user-1', 'manage_users');

    expect(result).toBe(false);
  });
});

// ── requirePermission ─────────────────────────────────────────────────────────

describe('PermissionService.requirePermission', () => {
  it('resolves when user has the permission', async () => {
    const rpcClient = { rpc: vi.fn().mockResolvedValue({ data: true }) };
    vi.mocked(createServerSupabaseClient).mockResolvedValue(rpcClient as never);

    await expect(
      PermissionService.requirePermission('user-1', 'manage_users'),
    ).resolves.toBeUndefined();
  });

  it('throws PermissionDeniedError when user lacks the permission', async () => {
    const rpcClient = { rpc: vi.fn().mockResolvedValue({ data: false }) };
    vi.mocked(createServerSupabaseClient).mockResolvedValue(rpcClient as never);

    await expect(PermissionService.requirePermission('user-1', 'manage_users')).rejects.toThrow(
      PermissionDeniedError,
    );
  });
});

// ── canAccessSite ─────────────────────────────────────────────────────────────

describe('PermissionService.canAccessSite', () => {
  it('returns true when user has view_all_sites', async () => {
    const rpcClient = { rpc: vi.fn().mockResolvedValue({ data: true }) };
    vi.mocked(createServerSupabaseClient).mockResolvedValue(rpcClient as never);

    const result = await PermissionService.canAccessSite('user-1', 'site-1');

    expect(result).toBe(true);
  });

  it('returns true when user is explicitly assigned to the site', async () => {
    // Call 1: canAccessSite's own client → user_sites query (row found)
    const siteClient = {
      from: vi.fn().mockReturnValue(queryStub({ id: 'us-1' })),
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(siteClient as never);

    // Call 2: hasPermission's client → rpc → false (no view_all_sites)
    const rpcFalse = { rpc: vi.fn().mockResolvedValue({ data: false }) };
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(rpcFalse as never);

    const result = await PermissionService.canAccessSite('user-1', 'site-1');

    expect(result).toBe(true);
  });

  it('returns false when user has no assignment and no override permission', async () => {
    // Call 1: canAccessSite's own client → user_sites → null
    const siteClient = {
      from: vi.fn().mockReturnValue(queryStub(null)),
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(siteClient as never);

    // Call 2: hasPermission's client → rpc → false
    const rpcFalse = { rpc: vi.fn().mockResolvedValue({ data: false }) };
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(rpcFalse as never);

    const result = await PermissionService.canAccessSite('user-1', 'site-2');

    expect(result).toBe(false);
  });
});

// ── guardDangerousOperation ───────────────────────────────────────────────────

describe('PermissionService.guardDangerousOperation', () => {
  it('resolves without checking permissions when the operation is not blocked', async () => {
    await expect(
      PermissionService.guardDangerousOperation('user-1', 'force_archive_study', {
        blocked: false,
        blockedMessage: 'blocked',
      }),
    ).resolves.toBeUndefined();

    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('throws the blocked message when blocked and the caller lacks the override permission', async () => {
    const rpcClient = { rpc: vi.fn().mockResolvedValue({ data: false }) };
    vi.mocked(createServerSupabaseClient).mockResolvedValue(rpcClient as never);

    await expect(
      PermissionService.guardDangerousOperation('user-1', 'force_archive_study', {
        blocked: true,
        blockedMessage: 'Cannot archive a study with enrolled subjects',
      }),
    ).rejects.toThrow('Cannot archive a study with enrolled subjects');
  });

  it('throws when blocked, the caller has the override permission, but no reason is given', async () => {
    const rpcClient = { rpc: vi.fn().mockResolvedValue({ data: true }) };
    vi.mocked(createServerSupabaseClient).mockResolvedValue(rpcClient as never);

    await expect(
      PermissionService.guardDangerousOperation('user-1', 'force_archive_study', {
        blocked: true,
        blockedMessage: 'blocked',
      }),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('resolves when blocked, the caller has the override permission, and a reason is given', async () => {
    const rpcClient = { rpc: vi.fn().mockResolvedValue({ data: true }) };
    vi.mocked(createServerSupabaseClient).mockResolvedValue(rpcClient as never);

    await expect(
      PermissionService.guardDangerousOperation('user-1', 'force_archive_study', {
        blocked: true,
        reason: 'Sponsor requested early termination',
        blockedMessage: 'blocked',
      }),
    ).resolves.toBeUndefined();
  });
});

// ── requireSiteAccess ─────────────────────────────────────────────────────────

describe('PermissionService.requireSiteAccess', () => {
  it('resolves when user can access the site', async () => {
    const rpcClient = { rpc: vi.fn().mockResolvedValue({ data: true }) };
    vi.mocked(createServerSupabaseClient).mockResolvedValue(rpcClient as never);

    await expect(PermissionService.requireSiteAccess('user-1', 'site-1')).resolves.toBeUndefined();
  });

  it('throws PermissionDeniedError when site access is denied', async () => {
    // Call 1: canAccessSite's own client → user_sites → null
    const siteClient = {
      from: vi.fn().mockReturnValue(queryStub(null)),
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(siteClient as never);

    // Call 2: hasPermission's client → rpc → false
    const rpcFalse = { rpc: vi.fn().mockResolvedValue({ data: false }) };
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(rpcFalse as never);

    await expect(PermissionService.requireSiteAccess('user-1', 'site-2')).rejects.toThrow(
      PermissionDeniedError,
    );
  });
});
