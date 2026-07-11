'use client';

import { useState, useEffect, useCallback, use, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { AIDraftVisitEditor } from '@/components/studies/AIDraftVisitEditor';
import { makeVisitItemKey, type VisitItemDraft } from '@/components/studies/VisitItemRow';
import type { StudyDraft, Study } from '@/types/studies';

type ProfileForm = {
  study_name: string;
  protocol_number: string;
  protocol_version: string;
  sponsor: string;
  cro: string;
  phase: string;
  therapeutic_area: string;
  indication: string;
  estimated_enrollment: string;
  study_duration: string;
  study_design: string;
  primary_endpoint: string;
  start_date: string;
  end_date: string;
};

const EMPTY_FORM: ProfileForm = {
  study_name: '',
  protocol_number: '',
  protocol_version: '',
  sponsor: '',
  cro: '',
  phase: '',
  therapeutic_area: '',
  indication: '',
  estimated_enrollment: '',
  study_duration: '',
  study_design: '',
  primary_endpoint: '',
  start_date: '',
  end_date: '',
};

function toFormValue(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function confidenceVariant(confidence: number | null): 'success' | 'warning' | 'danger' {
  if (confidence === null) return 'danger';
  if (confidence >= 0.8) return 'success';
  if (confidence >= 0.5) return 'warning';
  return 'danger';
}

export default function AIDraftReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: draftId } = use(params);
  const router = useRouter();

  const [draft, setDraft] = useState<StudyDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [items, setItems] = useState<VisitItemDraft[]>([]);
  const [finalizing, setFinalizing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDraft = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/studies/ai-drafts/${draftId}`);
      if (!res.ok) {
        setDraft(null);
        return;
      }
      const json = (await res.json()) as { data: { draft: StudyDraft } };
      const loaded = json.data.draft;
      setDraft(loaded);
      const profile = loaded.extracted_profile;
      setForm({
        study_name: toFormValue(profile.study_name),
        protocol_number: toFormValue(profile.protocol_number),
        protocol_version: toFormValue(profile.protocol_version),
        sponsor: toFormValue(profile.sponsor),
        cro: toFormValue(profile.cro),
        phase: toFormValue(profile.phase),
        therapeutic_area: toFormValue(profile.therapeutic_area),
        indication: toFormValue(profile.indication),
        estimated_enrollment: toFormValue(profile.estimated_enrollment),
        study_duration: toFormValue(profile.study_duration),
        study_design: toFormValue(profile.study_design),
        primary_endpoint: toFormValue(profile.primary_endpoint),
        start_date: toFormValue(profile.start_date),
        end_date: toFormValue(profile.end_date),
      });
      setItems(loaded.extracted_visit_items.map((item) => ({ ...item, key: makeVisitItemKey() })));
    } finally {
      setLoading(false);
    }
  }, [draftId]);

  useEffect(() => {
    void fetchDraft();
  }, [fetchDraft]);

  function field(name: keyof ProfileForm) {
    return {
      value: form[name],
      onChange: (e: ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [name]: e.target.value })),
    };
  }

  async function handleFinalize() {
    if (!form.study_name.trim()) {
      setError('Study title is required');
      return;
    }
    if (items.length > 0 && items.filter((i) => i.is_baseline).length !== 1) {
      setError('Mark exactly one visit as Baseline, or remove all visits');
      return;
    }

    setFinalizing(true);
    setError(null);
    try {
      const body = {
        study_name: form.study_name.trim(),
        protocol_number: form.protocol_number.trim() || undefined,
        protocol_version: form.protocol_version.trim() || undefined,
        sponsor: form.sponsor.trim() || undefined,
        cro: form.cro.trim() || undefined,
        phase: form.phase.trim() || undefined,
        therapeutic_area: form.therapeutic_area.trim() || undefined,
        indication: form.indication.trim() || undefined,
        estimated_enrollment: form.estimated_enrollment.trim()
          ? Number(form.estimated_enrollment)
          : undefined,
        study_duration: form.study_duration.trim() || undefined,
        study_design: form.study_design.trim() || undefined,
        primary_endpoint: form.primary_endpoint.trim() || undefined,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        visit_template_items:
          items.length > 0 ? items.map(({ key: _key, ...rest }) => rest) : undefined,
      };

      const res = await fetch(`/api/studies/ai-drafts/${draftId}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: { study: Study };
        message?: string;
      };
      if (!res.ok || !json.success || !json.data) {
        setError(json.message ?? 'Failed to finalize study');
        return;
      }
      router.push(`/studies/${json.data.study.id}`);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setFinalizing(false);
    }
  }

  async function handleDiscard() {
    setDiscarding(true);
    setError(null);
    try {
      const res = await fetch(`/api/studies/ai-drafts/${draftId}`, { method: 'DELETE' });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setError(json.message ?? 'Failed to discard draft');
        return;
      }
      router.push('/studies');
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setDiscarding(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!draft) {
    return <AlertBanner variant="error" message="This AI draft could not be found." />;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Review AI-Drafted Study"
        description="Nothing is saved as a real study until you finalize. Edit anything the Protocol Agent got wrong or left blank."
      />

      {error && <AlertBanner variant="error" message={error} onDismiss={() => setError(null)} />}

      {draft.status === 'failed' && (
        <AlertBanner
          variant="warning"
          title="AI extraction failed"
          message={
            draft.error_message ??
            'The Protocol Agent could not process this file. Fill in the fields manually below.'
          }
        />
      )}

      {draft.status === 'ready' && (
        <div className="flex items-center gap-3">
          <Badge variant={confidenceVariant(draft.confidence)}>
            Confidence:{' '}
            {draft.confidence !== null ? `${Math.round(draft.confidence * 100)}%` : 'N/A'}
          </Badge>
        </div>
      )}

      {draft.uncertain_fields.length > 0 && (
        <AlertBanner
          variant="info"
          title="Left blank for your review"
          message={draft.uncertain_fields.join(' • ')}
        />
      )}

      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-gray-900">Study Profile</h3>
        <Input
          label="Study name"
          required
          placeholder="A Phase III Study of..."
          {...field('study_name')}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Protocol number" {...field('protocol_number')} />
          <Input label="Protocol version" {...field('protocol_version')} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Sponsor" {...field('sponsor')} />
          <Input label="CRO" {...field('cro')} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Phase" {...field('phase')} />
          <Input label="Therapeutic area" {...field('therapeutic_area')} />
        </div>
        <Input label="Indication" {...field('indication')} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Estimated enrollment" type="number" {...field('estimated_enrollment')} />
          <Input label="Study duration" {...field('study_duration')} />
        </div>
        <Input label="Study design" {...field('study_design')} />
        <Input label="Primary endpoint" {...field('primary_endpoint')} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Start date" type="date" {...field('start_date')} />
          <Input label="End date" type="date" {...field('end_date')} />
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-gray-900">Visit Schedule</h3>
        <AIDraftVisitEditor items={items} onChange={setItems} />
      </div>

      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          loading={discarding}
          disabled={discarding || finalizing}
          onClick={() => void handleDiscard()}
        >
          Discard draft
        </Button>
        <Button
          loading={finalizing}
          disabled={finalizing || discarding}
          onClick={() => void handleFinalize()}
        >
          Finalize / Create Study
        </Button>
      </div>
    </div>
  );
}
