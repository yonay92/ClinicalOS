import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PermissionService } from '@/services/permissions/PermissionService';
import { AuditService } from '@/services/audit/AuditService';
import { NotFoundError, DatabaseError, BusinessRuleError } from '@/lib/api/errors';
import type {
  StudyPrescreeningQuestion,
  CreatePrescreeningQuestionInput,
  UpdatePrescreeningQuestionInput,
  LeadPrescreening,
  LeadPrescreeningAnswer,
  LeadPrescreeningWithAnswers,
  SubmitPrescreeningInput,
  OverridePrescreeningInput,
  PrescreeningOutcome,
  PrescreeningQuestionType,
} from '@/types/recruitment';
import type { RequestContext } from '@/types/api';

const QUESTION_COLUMNS =
  'id, company_id, study_id, question_order, question_text, question_type, eligible_answer, min_eligible_value, max_eligible_value, is_hard_exclusion, is_active, created_by, created_at, updated_at';

const PRESCREENING_COLUMNS =
  'id, company_id, lead_id, study_id, computed_outcome, manual_outcome, manual_override_reason, manual_override_by, manual_override_at, completed_by, completed_at';

const ANSWER_COLUMNS =
  'id, company_id, lead_prescreening_id, question_id, question_text, question_type, answer_value, is_eligible_answer';

// Pure and exported for direct unit testing — no eligible_answer configured
// on a yes_no question, or a non-numeric answer to a number question, scores
// as null (no impact either way) rather than guessing.
export function determineAnswerEligibility(
  question: Pick<
    StudyPrescreeningQuestion,
    'question_type' | 'eligible_answer' | 'min_eligible_value' | 'max_eligible_value'
  >,
  answerValue: string,
): boolean | null {
  if (question.question_type === 'text') return null;

  if (question.question_type === 'yes_no') {
    if (!question.eligible_answer) return null;
    return answerValue.trim().toLowerCase() === question.eligible_answer.trim().toLowerCase();
  }

  const numeric = Number(answerValue);
  if (Number.isNaN(numeric)) return null;
  const aboveMin = question.min_eligible_value == null || numeric >= question.min_eligible_value;
  const belowMax = question.max_eligible_value == null || numeric <= question.max_eligible_value;
  return aboveMin && belowMax;
}

// Pure and exported for direct unit testing. Any hard-exclusion question
// answered ineligibly forces not_eligible outright; any other ineligible
// answer only downgrades to needs_review; everything eligible (or
// unscored/text) is potentially_eligible.
export function calculatePrescreeningOutcome(
  scoredAnswers: Array<{ is_eligible_answer: boolean | null; is_hard_exclusion: boolean }>,
): PrescreeningOutcome {
  const ineligible = scoredAnswers.filter((a) => a.is_eligible_answer === false);
  if (ineligible.some((a) => a.is_hard_exclusion)) return 'not_eligible';
  if (ineligible.length > 0) return 'needs_review';
  return 'potentially_eligible';
}

export const PrescreeningService = {
  async listQuestions(studyId: string, ctx: RequestContext): Promise<StudyPrescreeningQuestion[]> {
    await PermissionService.requirePermission(ctx.user.id, 'view_leads');

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('study_prescreening_questions')
      .select(QUESTION_COLUMNS)
      .eq('study_id', studyId)
      .eq('company_id', ctx.company.id)
      .eq('is_active', true)
      .order('question_order');

    if (error) throw new DatabaseError(error.message);
    return (data as StudyPrescreeningQuestion[]) ?? [];
  },

  async createQuestion(
    studyId: string,
    input: CreatePrescreeningQuestionInput,
    ctx: RequestContext,
  ): Promise<StudyPrescreeningQuestion> {
    await PermissionService.requireAnyPermission(ctx.user.id, ['edit_study', 'manage_studies']);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('study_prescreening_questions')
      .insert({
        company_id: ctx.company.id,
        study_id: studyId,
        question_order: input.question_order,
        question_text: input.question_text,
        question_type: input.question_type,
        eligible_answer: input.eligible_answer ?? null,
        min_eligible_value: input.min_eligible_value ?? null,
        max_eligible_value: input.max_eligible_value ?? null,
        is_hard_exclusion: input.is_hard_exclusion ?? false,
        created_by: ctx.user.id,
      })
      .select(QUESTION_COLUMNS)
      .single();

    if (error || !data) throw new DatabaseError(error?.message ?? 'Failed to create question');

    const question = data as StudyPrescreeningQuestion;

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: 'prescreening_question.created',
      module: 'recruitment',
      record_type: 'study_prescreening_questions',
      record_id: question.id,
      new_value: { study_id: studyId, question_text: question.question_text },
    });

    return question;
  },

  async updateQuestion(
    questionId: string,
    input: UpdatePrescreeningQuestionInput,
    ctx: RequestContext,
  ): Promise<StudyPrescreeningQuestion> {
    await PermissionService.requireAnyPermission(ctx.user.id, ['edit_study', 'manage_studies']);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('study_prescreening_questions')
      .update(input)
      .eq('id', questionId)
      .eq('company_id', ctx.company.id)
      .select(QUESTION_COLUMNS)
      .single();

    if (error || !data) throw new NotFoundError('Prescreening question');

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: 'prescreening_question.updated',
      module: 'recruitment',
      record_type: 'study_prescreening_questions',
      record_id: questionId,
      new_value: input as Record<string, unknown>,
    });

    return data as StudyPrescreeningQuestion;
  },

  async listForLead(leadId: string, ctx: RequestContext): Promise<LeadPrescreeningWithAnswers[]> {
    await PermissionService.requirePermission(ctx.user.id, 'view_leads');

    const supabase = await createServerSupabaseClient();
    const { data: prescreenings, error } = await supabase
      .from('lead_prescreenings')
      .select(PRESCREENING_COLUMNS)
      .eq('lead_id', leadId)
      .eq('company_id', ctx.company.id)
      .order('completed_at', { ascending: false });

    if (error) throw new DatabaseError(error.message);
    const rows = (prescreenings as LeadPrescreening[]) ?? [];
    if (rows.length === 0) return [];

    const { data: answers, error: answersError } = await supabase
      .from('lead_prescreening_answers')
      .select(ANSWER_COLUMNS)
      .in(
        'lead_prescreening_id',
        rows.map((r) => r.id),
      );

    if (answersError) throw new DatabaseError(answersError.message);
    const answersByPrescreening = new Map<string, LeadPrescreeningAnswer[]>();
    for (const answer of (answers as LeadPrescreeningAnswer[]) ?? []) {
      const list = answersByPrescreening.get(answer.lead_prescreening_id) ?? [];
      list.push(answer);
      answersByPrescreening.set(answer.lead_prescreening_id, list);
    }

    return rows.map((row) => ({ ...row, answers: answersByPrescreening.get(row.id) ?? [] }));
  },

  async submit(
    leadId: string,
    input: SubmitPrescreeningInput,
    ctx: RequestContext,
  ): Promise<LeadPrescreeningWithAnswers> {
    await PermissionService.requirePermission(ctx.user.id, 'edit_lead');

    const supabase = await createServerSupabaseClient();
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id')
      .eq('id', leadId)
      .eq('company_id', ctx.company.id)
      .single();
    if (leadError || !lead) throw new NotFoundError('Lead');

    const { data: questionRows, error: questionsError } = await supabase
      .from('study_prescreening_questions')
      .select(QUESTION_COLUMNS)
      .eq('study_id', input.study_id)
      .eq('company_id', ctx.company.id)
      .in(
        'id',
        input.answers.map((a) => a.question_id),
      );
    if (questionsError) throw new DatabaseError(questionsError.message);

    const questions = (questionRows as StudyPrescreeningQuestion[]) ?? [];
    if (questions.length !== input.answers.length) {
      throw new BusinessRuleError(
        'One or more answered questions do not belong to this study or no longer exist.',
      );
    }
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    const scoredAnswers = input.answers.map((answer) => {
      const question = questionMap.get(answer.question_id);
      if (!question) throw new BusinessRuleError('Unknown prescreening question.');
      return {
        question,
        answer_value: answer.answer_value,
        is_eligible_answer: determineAnswerEligibility(question, answer.answer_value),
      };
    });

    const computedOutcome = calculatePrescreeningOutcome(
      scoredAnswers.map((a) => ({
        is_eligible_answer: a.is_eligible_answer,
        is_hard_exclusion: a.question.is_hard_exclusion,
      })),
    );

    const { data: prescreening, error: prescreeningError } = await supabase
      .from('lead_prescreenings')
      .insert({
        company_id: ctx.company.id,
        lead_id: leadId,
        study_id: input.study_id,
        computed_outcome: computedOutcome,
        completed_by: ctx.user.id,
      })
      .select(PRESCREENING_COLUMNS)
      .single();

    if (prescreeningError || !prescreening) {
      throw new DatabaseError(prescreeningError?.message ?? 'Failed to record prescreening');
    }

    const prescreeningRow = prescreening as LeadPrescreening;

    const { data: insertedAnswers, error: insertAnswersError } = await supabase
      .from('lead_prescreening_answers')
      .insert(
        scoredAnswers.map((a) => ({
          company_id: ctx.company.id,
          lead_prescreening_id: prescreeningRow.id,
          question_id: a.question.id,
          question_text: a.question.question_text,
          question_type: a.question.question_type as PrescreeningQuestionType,
          answer_value: a.answer_value,
          is_eligible_answer: a.is_eligible_answer,
        })),
      )
      .select(ANSWER_COLUMNS);

    if (insertAnswersError) throw new DatabaseError(insertAnswersError.message);

    // Move the lead into the prescreening stage if it hasn't progressed
    // further already — never regress a lead that's already waitlisted/
    // converted/declined/lost.
    await supabase
      .from('leads')
      .update({ status: 'prescreening', updated_by: ctx.user.id })
      .eq('id', leadId)
      .eq('company_id', ctx.company.id)
      .in('status', ['new', 'contacted', 'prescreening']);

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: 'lead.prescreening_submitted',
      module: 'recruitment',
      record_type: 'lead_prescreenings',
      record_id: prescreeningRow.id,
      new_value: { study_id: input.study_id, computed_outcome: computedOutcome },
    });

    return { ...prescreeningRow, answers: (insertedAnswers as LeadPrescreeningAnswer[]) ?? [] };
  },

  async override(
    prescreeningId: string,
    input: OverridePrescreeningInput,
    ctx: RequestContext,
  ): Promise<LeadPrescreening> {
    await PermissionService.requirePermission(ctx.user.id, 'edit_lead');

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('lead_prescreenings')
      .update({
        manual_outcome: input.manual_outcome,
        manual_override_reason: input.manual_override_reason,
        manual_override_by: ctx.user.id,
        manual_override_at: new Date().toISOString(),
      })
      .eq('id', prescreeningId)
      .eq('company_id', ctx.company.id)
      .select(PRESCREENING_COLUMNS)
      .single();

    if (error || !data) throw new NotFoundError('Prescreening');

    await AuditService.log({
      company_id: ctx.company.id,
      user_id: ctx.user.id,
      action: 'lead.prescreening_overridden',
      module: 'recruitment',
      record_type: 'lead_prescreenings',
      record_id: prescreeningId,
      new_value: { manual_outcome: input.manual_outcome, reason: input.manual_override_reason },
    });

    return data as LeadPrescreening;
  },
};
