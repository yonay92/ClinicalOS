import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { VisitTemplateService } from '@/services/visit-templates/VisitTemplateService';
import { PermissionService } from '@/services/permissions/PermissionService';
import { AuditService } from '@/services/audit/AuditService';
import { NotFoundError, BusinessRuleError } from '@/lib/api/errors';

vi.mock('@/services/audit/AuditService', () => ({
  AuditService: { log: vi.fn() },
}));

const COMPANY_ID = 'company-uuid';
const STUDY_ID = 'study-uuid';
const TEMPLATE_ID = 'template-uuid';
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
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    single: vi.fn().mockResolvedValue({ data, error }),
    in: vi.fn().mockReturnThis(),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  for (const key of ['select', 'eq', 'order', 'limit', 'insert', 'update', 'in']) {
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

describe('VisitTemplateService.createTemplate', () => {
  it('assigns the next version number based on the latest existing version', async () => {
    vi.spyOn(PermissionService, 'requireAnyPermission').mockResolvedValue(undefined);

    const newTemplate = {
      id: TEMPLATE_ID,
      company_id: COMPANY_ID,
      study_id: STUDY_ID,
      version: 3,
      source: 'manual',
      status: 'draft',
    };
    const items = [{ id: 'item-1', visit_name: 'Screening', visit_order: 1, is_baseline: true }];

    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(
      makeSupabaseClient(
        { data: { version: 2 } }, // existing latest version lookup
        { data: newTemplate }, // insert template
        { data: items }, // insert items
      ),
    );

    const result = await VisitTemplateService.createTemplate(
      STUDY_ID,
      [{ visit_name: 'Screening', visit_order: 1, is_baseline: true }],
      makeCtx(),
    );

    expect(result.version).toBe(3);
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'visit_template.created' }),
    );
  });

  it('rejects a template with zero Baseline items', async () => {
    vi.spyOn(PermissionService, 'requireAnyPermission').mockResolvedValue(undefined);

    await expect(
      VisitTemplateService.createTemplate(
        STUDY_ID,
        [
          { visit_name: 'Screening', visit_order: 1 },
          { visit_name: 'Week 4', visit_order: 2, offset_days: 28 },
        ],
        makeCtx(),
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('rejects a template with more than one Baseline item', async () => {
    vi.spyOn(PermissionService, 'requireAnyPermission').mockResolvedValue(undefined);

    await expect(
      VisitTemplateService.createTemplate(
        STUDY_ID,
        [
          { visit_name: 'Screening', visit_order: 1, is_baseline: true },
          { visit_name: 'Baseline', visit_order: 2, is_baseline: true },
        ],
        makeCtx(),
      ),
    ).rejects.toThrow(BusinessRuleError);
  });
});

describe('VisitTemplateService.approveTemplate', () => {
  it('throws BusinessRuleError when the template is not in draft status', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);

    const approvedTemplate = {
      id: TEMPLATE_ID,
      company_id: COMPANY_ID,
      study_id: STUDY_ID,
      version: 1,
      status: 'approved',
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(
      makeSupabaseClient({ data: approvedTemplate }),
    );

    await expect(VisitTemplateService.approveTemplate(TEMPLATE_ID, makeCtx())).rejects.toThrow(
      BusinessRuleError,
    );
  });

  it('throws NotFoundError when the template does not exist', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.mocked(createServerSupabaseClient).mockResolvedValueOnce(makeSupabaseClient({ data: null }));

    await expect(VisitTemplateService.approveTemplate(TEMPLATE_ID, makeCtx())).rejects.toThrow(
      NotFoundError,
    );
  });
});
