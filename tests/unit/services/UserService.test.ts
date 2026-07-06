import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { UserService } from '@/services/users/UserService';

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
    in: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    single: vi.fn().mockResolvedValue({ data, error }),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  for (const key of ['select', 'eq', 'order', 'in']) {
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

describe('UserService.list', () => {
  it('returns an empty array without extra queries when there are no profiles', async () => {
    const client = makeSupabaseClient({ data: [] });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await UserService.list(makeCtx());

    expect(result).toEqual([]);
  });

  it('attaches each user’s roles and sites via batched lookups', async () => {
    const profiles = [
      { id: 'user-1', company_id: COMPANY_ID, full_name: 'Alice', email: 'alice@example.com' },
      { id: 'user-2', company_id: COMPANY_ID, full_name: 'Bob', email: 'bob@example.com' },
    ];
    const userRoles = [
      { user_id: 'user-1', roles: { id: 'role-admin', key: 'admin', name: 'Administrator' } },
    ];
    const userSites = [{ user_id: 'user-1', sites: { id: 'site-1', name: 'Main Site' } }];

    const client = makeSupabaseClient(
      { data: profiles }, // profiles select
      { data: userRoles }, // user_roles batched lookup
      { data: userSites }, // user_sites batched lookup
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await UserService.list(makeCtx());

    expect(result).toHaveLength(2);
    const alice = result.find((u) => u.id === 'user-1');
    const bob = result.find((u) => u.id === 'user-2');

    expect(alice?.roles).toEqual([{ id: 'role-admin', key: 'admin', name: 'Administrator' }]);
    expect(alice?.sites).toEqual([{ id: 'site-1', name: 'Main Site' }]);
    expect(bob?.roles).toEqual([]);
    expect(bob?.sites).toEqual([]);
  });
});
