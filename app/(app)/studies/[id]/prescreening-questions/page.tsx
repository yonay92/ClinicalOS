'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import type { StudyPrescreeningQuestion, PrescreeningQuestionType } from '@/types/recruitment';

type QuestionForm = {
  question_text: string;
  question_type: PrescreeningQuestionType;
  eligible_answer: string;
  min_eligible_value: string;
  max_eligible_value: string;
  is_hard_exclusion: boolean;
};

const EMPTY_FORM: QuestionForm = {
  question_text: '',
  question_type: 'yes_no',
  eligible_answer: 'yes',
  min_eligible_value: '',
  max_eligible_value: '',
  is_hard_exclusion: false,
};

const TYPE_OPTIONS: Array<{ value: PrescreeningQuestionType; label: string }> = [
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'number', label: 'Number' },
  { value: 'text', label: 'Free text (no scoring)' },
];

export default function StudyPrescreeningQuestionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: studyId } = use(params);
  const [questions, setQuestions] = useState<StudyPrescreeningQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<QuestionForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/studies/${studyId}/prescreening-questions`);
      if (res.ok) {
        const json = (await res.json()) as { data: StudyPrescreeningQuestion[] };
        setQuestions(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [studyId]);

  useEffect(() => {
    void fetchQuestions();
  }, [fetchQuestions]);

  async function handleAdd() {
    if (!form.question_text.trim()) {
      setError('Question text is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/studies/${studyId}/prescreening-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_order: questions.length,
          question_text: form.question_text,
          question_type: form.question_type,
          eligible_answer: form.question_type === 'yes_no' ? form.eligible_answer : undefined,
          min_eligible_value:
            form.question_type === 'number' && form.min_eligible_value !== ''
              ? Number(form.min_eligible_value)
              : undefined,
          max_eligible_value:
            form.question_type === 'number' && form.max_eligible_value !== ''
              ? Number(form.max_eligible_value)
              : undefined,
          is_hard_exclusion: form.is_hard_exclusion,
        }),
      });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setError(json.message ?? 'Failed to add question');
        return;
      }
      setForm(EMPTY_FORM);
      void fetchQuestions();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(questionId: string) {
    await fetch(`/api/studies/${studyId}/prescreening-questions/${questionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    });
    void fetchQuestions();
  }

  return (
    <div>
      <PageHeader
        title="Prescreening Questionnaire"
        description="Configure this study's eligibility triage questions. Yes/No and Number questions score automatically; a hard exclusion forces Not Eligible on its own."
      />

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : questions.length === 0 ? (
        <EmptyState
          title="No questions configured yet"
          description="Add the study's inclusion/exclusion criteria below"
        />
      ) : (
        <div className="mb-6 space-y-2">
          {questions.map((q) => (
            <div
              key={q.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3"
            >
              <div>
                <p className="text-sm text-gray-900">{q.question_text}</p>
                <p className="text-xs text-gray-500">
                  {TYPE_OPTIONS.find((t) => t.value === q.question_type)?.label}
                  {q.question_type === 'yes_no' && ` · eligible: ${q.eligible_answer}`}
                  {q.question_type === 'number' &&
                    ` · eligible range: ${q.min_eligible_value ?? '−∞'} to ${q.max_eligible_value ?? '∞'}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {q.is_hard_exclusion && <Badge variant="danger">Hard exclusion</Badge>}
                <Button size="sm" variant="ghost" onClick={() => void handleDeactivate(q.id)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="max-w-xl rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Add Question</h3>
        <div className="space-y-3">
          <Input
            label="Question text"
            value={form.question_text}
            onChange={(e) => setForm((f) => ({ ...f, question_text: e.target.value }))}
            placeholder="Is the patient between 18 and 65 years old?"
          />
          <Select
            label="Answer type"
            value={form.question_type}
            onChange={(e) =>
              setForm((f) => ({ ...f, question_type: e.target.value as PrescreeningQuestionType }))
            }
            options={TYPE_OPTIONS}
          />
          {form.question_type === 'yes_no' && (
            <Select
              label="Eligible answer"
              value={form.eligible_answer}
              onChange={(e) => setForm((f) => ({ ...f, eligible_answer: e.target.value }))}
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]}
            />
          )}
          {form.question_type === 'number' && (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Min eligible value"
                type="number"
                value={form.min_eligible_value}
                onChange={(e) => setForm((f) => ({ ...f, min_eligible_value: e.target.value }))}
              />
              <Input
                label="Max eligible value"
                type="number"
                value={form.max_eligible_value}
                onChange={(e) => setForm((f) => ({ ...f, max_eligible_value: e.target.value }))}
              />
            </div>
          )}
          {form.question_type !== 'text' && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.is_hard_exclusion}
                onChange={(e) => setForm((f) => ({ ...f, is_hard_exclusion: e.target.checked }))}
              />
              Hard exclusion — an ineligible answer forces Not Eligible on its own
            </label>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end">
            <Button loading={saving} disabled={saving} onClick={() => void handleAdd()}>
              Add Question
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
