'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { usePermissions } from '@/hooks/usePermissions';
import type {
  LeadPrescreeningWithAnswers,
  PrescreeningOutcome,
  StudyPrescreeningQuestion,
} from '@/types/recruitment';
import type { Study } from '@/types/studies';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'default' | 'primary' | 'info';

const OUTCOME_VARIANT: Record<PrescreeningOutcome, BadgeVariant> = {
  potentially_eligible: 'success',
  needs_review: 'warning',
  not_eligible: 'danger',
};

const OUTCOME_LABEL: Record<PrescreeningOutcome, string> = {
  potentially_eligible: 'Potentially Eligible',
  needs_review: 'Needs Review',
  not_eligible: 'Not Eligible',
};

const OVERRIDE_OPTIONS: Array<{ value: PrescreeningOutcome; label: string }> = [
  { value: 'potentially_eligible', label: 'Potentially Eligible' },
  { value: 'needs_review', label: 'Needs Review' },
  { value: 'not_eligible', label: 'Not Eligible' },
];

function effectiveOutcome(p: LeadPrescreeningWithAnswers): PrescreeningOutcome {
  return p.manual_outcome ?? p.computed_outcome;
}

export function LeadPrescreeningSection({
  leadId,
  defaultStudyId,
  onChanged,
}: {
  leadId: string;
  defaultStudyId: string | null;
  onChanged: () => void;
}) {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('edit_lead');

  const [prescreenings, setPrescreenings] = useState<LeadPrescreeningWithAnswers[]>([]);
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(true);

  const [newOpen, setNewOpen] = useState(false);
  const [selectedStudyId, setSelectedStudyId] = useState(defaultStudyId ?? '');
  const [questions, setQuestions] = useState<StudyPrescreeningQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [overrideTarget, setOverrideTarget] = useState<LeadPrescreeningWithAnswers | null>(null);
  const [overrideOutcome, setOverrideOutcome] = useState<PrescreeningOutcome>('needs_review');
  const [overrideReason, setOverrideReason] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [prescreeningsRes, studiesRes] = await Promise.all([
        fetch(`/api/leads/${leadId}/prescreenings`),
        fetch('/api/studies'),
      ]);
      if (prescreeningsRes.ok) {
        const json = (await prescreeningsRes.json()) as { data: LeadPrescreeningWithAnswers[] };
        setPrescreenings(json.data);
      }
      if (studiesRes.ok) {
        setStudies(((await studiesRes.json()) as { data: Study[] }).data);
      }
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!selectedStudyId) {
      setQuestions([]);
      return;
    }
    void (async () => {
      const res = await fetch(`/api/studies/${selectedStudyId}/prescreening-questions`);
      if (res.ok) {
        const json = (await res.json()) as { data: StudyPrescreeningQuestion[] };
        setQuestions(json.data);
        setAnswers({});
      }
    })();
  }, [selectedStudyId]);

  function openNew() {
    setSelectedStudyId(defaultStudyId ?? '');
    setAnswers({});
    setError(null);
    setNewOpen(true);
  }

  async function handleSubmit() {
    if (!selectedStudyId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/prescreenings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          study_id: selectedStudyId,
          answers: questions.map((q) => ({
            question_id: q.id,
            answer_value: answers[q.id] ?? '',
          })),
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Failed to submit prescreening');
        return;
      }
      setNewOpen(false);
      void fetchAll();
      onChanged();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setBusy(false);
    }
  }

  function openOverride(p: LeadPrescreeningWithAnswers) {
    setOverrideTarget(p);
    setOverrideOutcome(effectiveOutcome(p));
    setOverrideReason('');
    setError(null);
  }

  async function handleOverride() {
    if (!overrideTarget) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/prescreenings/${overrideTarget.id}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manual_outcome: overrideOutcome,
          manual_override_reason: overrideReason,
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message: string } };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Failed to override outcome');
        return;
      }
      setOverrideTarget(null);
      void fetchAll();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setBusy(false);
    }
  }

  const studyName = (id: string) => studies.find((s) => s.id === id)?.study_name ?? '—';

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Prescreening</h3>
        {canEdit && (
          <Button size="sm" onClick={openNew}>
            New Prescreening
          </Button>
        )}
      </div>

      {prescreenings.length === 0 ? (
        <p className="text-sm text-gray-500">No prescreenings recorded yet.</p>
      ) : (
        <div className="space-y-3">
          {prescreenings.map((p) => (
            <div key={p.id} className="rounded-lg border border-gray-100 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{studyName(p.study_id)}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(p.completed_at).toLocaleString()}
                  </p>
                </div>
                <Badge variant={OUTCOME_VARIANT[effectiveOutcome(p)]}>
                  {OUTCOME_LABEL[effectiveOutcome(p)]}
                </Badge>
              </div>
              {p.manual_outcome && (
                <p className="mt-1 text-xs text-gray-500">
                  Manually overridden from {OUTCOME_LABEL[p.computed_outcome]}
                  {p.manual_override_reason && `: ${p.manual_override_reason}`}
                </p>
              )}
              <ul className="mt-2 space-y-1 text-sm text-gray-600">
                {p.answers.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3">
                    <span>{a.question_text}</span>
                    <span
                      className={
                        a.is_eligible_answer === false
                          ? 'font-medium text-red-600'
                          : 'text-gray-900'
                      }
                    >
                      {a.answer_value}
                    </span>
                  </li>
                ))}
              </ul>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => openOverride(p)}
                >
                  Override Outcome
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New Prescreening" size="lg">
        <div className="space-y-4">
          <Select
            label="Study"
            value={selectedStudyId}
            onChange={(e) => setSelectedStudyId(e.target.value)}
            placeholder="Select a study"
            options={studies.map((s) => ({ value: s.id, label: s.study_name }))}
          />

          {selectedStudyId && questions.length === 0 && (
            <p className="text-sm text-gray-500">
              This study has no prescreening questions configured yet.
            </p>
          )}

          {questions.map((q) => {
            const inputId = `prescreening-answer-${q.id}`;
            return (
              <div key={q.id} className="space-y-1">
                <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
                  {q.question_text}
                </label>
                {q.question_type === 'yes_no' ? (
                  <select
                    id={inputId}
                    className="block h-9 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  >
                    <option value="" disabled>
                      Select an answer
                    </option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                ) : q.question_type === 'number' ? (
                  <input
                    id={inputId}
                    type="number"
                    className="block h-9 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  />
                ) : (
                  <textarea
                    id={inputId}
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    rows={2}
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  />
                )}
              </div>
            );
          })}

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={busy || questions.length === 0}
              onClick={() => void handleSubmit()}
            >
              Submit
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={overrideTarget !== null}
        onClose={() => setOverrideTarget(null)}
        title="Override Prescreening Outcome"
      >
        <div className="space-y-4">
          <Select
            label="Outcome"
            value={overrideOutcome}
            onChange={(e) => setOverrideOutcome(e.target.value as PrescreeningOutcome)}
            options={OVERRIDE_OPTIONS}
          />
          <div className="space-y-1">
            <label htmlFor="override-reason" className="block text-sm font-medium text-slate-700">
              Reason
            </label>
            <textarea
              id="override-reason"
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              rows={3}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setOverrideTarget(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={busy || !overrideReason.trim()}
              onClick={() => void handleOverride()}
            >
              Save Override
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
