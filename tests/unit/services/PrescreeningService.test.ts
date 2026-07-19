import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  PrescreeningService,
  determineAnswerEligibility,
  calculatePrescreeningOutcome,
} from '@/services/recruitment/PrescreeningService';
import { PermissionService } from '@/services/permissions/PermissionService';
import { AuditService } from '@/services/audit/AuditService';
import { PermissionDeniedError, BusinessRuleError, NotFoundError } from '@/lib/api/errors';
import type { StudyPrescreeningQuestion } from '@/types/recruitment';

vi.mock('@/services/audit/AuditService', () => ({
  AuditService: { log: vi.fn() },
}));

const COMPANY_ID = 'company-uuid';
const LEAD_ID = 'lead-uuid';
const STUDY_ID = 'study-uuid';
const USER_ID = 'user-uuid';

function makeCtx() {
  return {
    user: {
      id: USER_ID,
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

function queryStub(data: unknown, error: unknown = null) {
  const resolved = Promise.resolve({ data, error });
  const stub: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    single: vi.fn().mockResolvedValue({ data, error }),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  for (const key of ['select', 'eq', 'in', 'order', 'limit', 'insert', 'update']) {
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

const YES_NO_ELIGIBLE_YES: StudyPrescreeningQuestion = {
  id: 'q1',
  company_id: COMPANY_ID,
  study_id: STUDY_ID,
  question_order: 0,
  question_text: 'Is the patient 18 or older?',
  question_type: 'yes_no',
  eligible_answer: 'yes',
  min_eligible_value: null,
  max_eligible_value: null,
  is_hard_exclusion: true,
  is_active: true,
  created_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const NUMBER_RANGE_QUESTION: StudyPrescreeningQuestion = {
  ...YES_NO_ELIGIBLE_YES,
  id: 'q2',
  question_type: 'number',
  eligible_answer: null,
  min_eligible_value: 18,
  max_eligible_value: 65,
  is_hard_exclusion: false,
};

const TEXT_QUESTION: StudyPrescreeningQuestion = {
  ...YES_NO_ELIGIBLE_YES,
  id: 'q3',
  question_type: 'text',
  eligible_answer: null,
  is_hard_exclusion: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('determineAnswerEligibility', () => {
  it('scores a yes_no question by case-insensitive match against eligible_answer', () => {
    expect(determineAnswerEligibility(YES_NO_ELIGIBLE_YES, 'yes')).toBe(true);
    expect(determineAnswerEligibility(YES_NO_ELIGIBLE_YES, 'YES')).toBe(true);
    expect(determineAnswerEligibility(YES_NO_ELIGIBLE_YES, 'no')).toBe(false);
  });

  it('returns null for a yes_no question with no eligible_answer configured', () => {
    expect(
      determineAnswerEligibility({ ...YES_NO_ELIGIBLE_YES, eligible_answer: null }, 'yes'),
    ).toBeNull();
  });

  it('scores a number question against the eligible range, inclusive', () => {
    expect(determineAnswerEligibility(NUMBER_RANGE_QUESTION, '18')).toBe(true);
    expect(determineAnswerEligibility(NUMBER_RANGE_QUESTION, '65')).toBe(true);
    expect(determineAnswerEligibility(NUMBER_RANGE_QUESTION, '17')).toBe(false);
    expect(determineAnswerEligibility(NUMBER_RANGE_QUESTION, '66')).toBe(false);
  });

  it('returns null for a non-numeric answer to a number question', () => {
    expect(determineAnswerEligibility(NUMBER_RANGE_QUESTION, 'abc')).toBeNull();
  });

  it('never scores a text question', () => {
    expect(determineAnswerEligibility(TEXT_QUESTION, 'anything')).toBeNull();
  });

  it('treats an unbounded min or max as no constraint on that side', () => {
    const minOnly = { ...NUMBER_RANGE_QUESTION, max_eligible_value: null };
    expect(determineAnswerEligibility(minOnly, '1000')).toBe(true);
    const maxOnly = { ...NUMBER_RANGE_QUESTION, min_eligible_value: null };
    expect(determineAnswerEligibility(maxOnly, '-1000')).toBe(true);
  });
});

describe('calculatePrescreeningOutcome', () => {
  it('is potentially_eligible when every scored answer is eligible', () => {
    expect(
      calculatePrescreeningOutcome([
        { is_eligible_answer: true, is_hard_exclusion: true },
        { is_eligible_answer: true, is_hard_exclusion: false },
        { is_eligible_answer: null, is_hard_exclusion: false },
      ]),
    ).toBe('potentially_eligible');
  });

  it('is needs_review when a soft (non-hard-exclusion) answer is ineligible', () => {
    expect(
      calculatePrescreeningOutcome([
        { is_eligible_answer: true, is_hard_exclusion: true },
        { is_eligible_answer: false, is_hard_exclusion: false },
      ]),
    ).toBe('needs_review');
  });

  it('is not_eligible when any hard-exclusion answer is ineligible, regardless of other answers', () => {
    expect(
      calculatePrescreeningOutcome([
        { is_eligible_answer: true, is_hard_exclusion: false },
        { is_eligible_answer: false, is_hard_exclusion: true },
      ]),
    ).toBe('not_eligible');
  });

  it('is potentially_eligible for an empty answer set', () => {
    expect(calculatePrescreeningOutcome([])).toBe('potentially_eligible');
  });
});

describe('PrescreeningService.submit', () => {
  it('throws PermissionDeniedError when the user lacks edit_lead', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockRejectedValue(
      new PermissionDeniedError('edit_lead'),
    );

    await expect(
      PrescreeningService.submit(
        LEAD_ID,
        { study_id: STUDY_ID, answers: [{ question_id: 'q1', answer_value: 'yes' }] },
        makeCtx(),
      ),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('throws NotFoundError when the lead does not exist in this company', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    vi.mocked(createServerSupabaseClient).mockResolvedValue(makeSupabaseClient({ data: null }));

    await expect(
      PrescreeningService.submit(
        LEAD_ID,
        { study_id: STUDY_ID, answers: [{ question_id: 'q1', answer_value: 'yes' }] },
        makeCtx(),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws BusinessRuleError when an answered question does not belong to this study', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    const client = makeSupabaseClient(
      { data: { id: LEAD_ID } }, // lead lookup
      { data: [] }, // questions lookup — none match
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    await expect(
      PrescreeningService.submit(
        LEAD_ID,
        { study_id: STUDY_ID, answers: [{ question_id: 'q1', answer_value: 'yes' }] },
        makeCtx(),
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('computes and persists the outcome, and audits without raw answer text', async () => {
    vi.spyOn(PermissionService, 'requirePermission').mockResolvedValue(undefined);
    const insertedPrescreening = {
      id: 'prescreening-uuid',
      company_id: COMPANY_ID,
      lead_id: LEAD_ID,
      study_id: STUDY_ID,
      computed_outcome: 'not_eligible',
      manual_outcome: null,
      manual_override_reason: null,
      manual_override_by: null,
      manual_override_at: null,
      completed_by: USER_ID,
      completed_at: new Date().toISOString(),
    };
    const client = makeSupabaseClient(
      { data: { id: LEAD_ID } }, // lead lookup
      { data: [YES_NO_ELIGIBLE_YES] }, // questions lookup
      { data: insertedPrescreening }, // lead_prescreenings insert
      { data: [{ id: 'answer-uuid' }] }, // lead_prescreening_answers insert
      { data: [{ id: LEAD_ID }] }, // leads status update
    );
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client);

    const result = await PrescreeningService.submit(
      LEAD_ID,
      {
        study_id: STUDY_ID,
        answers: [{ question_id: YES_NO_ELIGIBLE_YES.id, answer_value: 'no' }],
      },
      makeCtx(),
    );

    expect(result.computed_outcome).toBe('not_eligible');
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'lead.prescreening_submitted',
        new_value: expect.objectContaining({ computed_outcome: 'not_eligible' }),
      }),
    );
  });
});
