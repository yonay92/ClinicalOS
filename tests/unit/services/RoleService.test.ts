import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { RoleService } from '@/services/roles/RoleService';
import { PermissionService } from '@/services/permissions/PermissionService';
import { AuditService } from '@/services/audit/AuditService';
import { PermissionDeniedError, NotFoundError } from '@/lib/api/errors';

vi.mock('@/services/audit/AuditService', () => ({
  AuditService: { log: vi.fn() },
}));

const COMPANY_ID = 'company-uuid';
const USER_ID = 'user-uuid';
const ROLE_ID = 'role-uuid';
const PERMISSION_ID = 'permission-uuid';

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
    upsert: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  for (const key of ['select', 'eq', 'upsert']) {
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

describe('RoleService.setPermission', () => {
  it('throws PermissionDeniedError when the caller lacks manage_users', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockRejectedValue(
      new PermissionDeniedError('manage_users'),
    );

    await expect(
      RoleService.setPermission(ROLE_ID, 'force_archive_study', true, makeCtx()),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('throws NotFoundError when the role does not belong to the company', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const client = makeSupabaseClient({ data: null }); // role lookup
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await expect(
      RoleService.setPermission(ROLE_ID, 'force_archive_study', true, makeCtx()),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError when the permission key does not exist', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const client = makeSupabaseClient(
      { data: { id: ROLE_ID } }, // role lookup
      { data: null }, // permission lookup
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await expect(
      RoleService.setPermission(ROLE_ID, 'not_a_real_permission', true, makeCtx()),
    ).rejects.toThrow(NotFoundError);
  });

  it('upserts the role_permissions row and writes an audit log', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const client = makeSupabaseClient(
      { data: { id: ROLE_ID } }, // role lookup
      { data: { id: PERMISSION_ID } }, // permission lookup
      { data: null }, // role_permissions upsert
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await RoleService.setPermission(ROLE_ID, 'force_archive_study', true, makeCtx());

    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'role_permissions.updated',
        record_id: ROLE_ID,
        new_value: { permission_key: 'force_archive_study', allowed: true },
      }),
    );
  });
});
