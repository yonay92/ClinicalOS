import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ReferralSourceService } from '@/services/recruitment/ReferralSourceService';
import { PermissionService } from '@/services/permissions/PermissionService';
import { PermissionDeniedError, DuplicateRecordError } from '@/lib/api/errors';

vi.mock('@/services/audit/AuditService', () => ({
  AuditService: { log: vi.fn() },
}));

const COMPANY_ID = 'company-uuid';
const USER_ID = 'user-uuid';

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

function queryStub(data: unknown, error: unknown = null) {
  const resolved = Promise.resolve({ data, error });
  const stub: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  for (const key of ['select', 'eq', 'order', 'insert', 'update']) {
    (stub[key] as ReturnType<typeof vi.fn>).mockReturnValue(stub);
  }
  return stub;
}

function makeSupabaseClient(...responses: Array<{ data: unknown; error?: unknown }>) {
  const from = vi.fn();
  for (const r of responses) {
    from.mockReturnValueOnce(queryStub(r.data, r.error ?? null));
  }
  return { from } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ReferralSourceService.create', () => {
  it('throws PermissionDeniedError when the user lacks manage_referral_sources', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockRejectedValue(
      new PermissionDeniedError('manage_referral_sources'),
    );

    await expect(
      ReferralSourceService.create(
        { name: 'Physician Network', category: 'physician_referral' },
        makeCtx(),
      ),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('maps a unique-constraint violation to DuplicateRecordError', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabaseClient({ data: null, error: { code: '23505', message: 'duplicate' } }),
    );

    await expect(
      ReferralSourceService.create(
        { name: 'Physician Network', category: 'physician_referral' },
        makeCtx(),
      ),
    ).rejects.toThrow(DuplicateRecordError);
  });

  it('creates a referral source', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    const created = {
      id: 'source-uuid',
      company_id: COMPANY_ID,
      name: 'Physician Network',
      category: 'physician_referral',
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabaseClient({ data: created }));

    const result = await ReferralSourceService.create(
      { name: 'Physician Network', category: 'physician_referral' },
      makeCtx(),
    );

    expect(result.id).toBe('source-uuid');
  });
});

describe('ReferralSourceService.list', () => {
  it('throws PermissionDeniedError when the user lacks view_leads', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockRejectedValue(
      new PermissionDeniedError('view_leads'),
    );

    await expect(ReferralSourceService.list(makeCtx())).rejects.toThrow(PermissionDeniedError);
  });
});
