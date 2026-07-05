'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AlertBanner } from '@/components/ui/AlertBanner';
import type { Study } from '@/types/studies';

type StudyForm = {
  study_name: string;
  protocol_number: string;
  sponsor: string;
  cro: string;
  phase: string;
  therapeutic_area: string;
  start_date: string;
  end_date: string;
};

const EMPTY_FORM: StudyForm = {
  study_name: '',
  protocol_number: '',
  sponsor: '',
  cro: '',
  phase: '',
  therapeutic_area: '',
  start_date: '',
  end_date: '',
};

export default function NewStudyPage() {
  const router = useRouter();
  const [form, setForm] = useState<StudyForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function stripEmpty(f: StudyForm): Record<string, string> {
    return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '')) as Record<
      string,
      string
    >;
  }

  async function handleSave() {
    if (!form.study_name.trim()) {
      setError('Study name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/studies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stripEmpty(form)),
      });
      const json = (await res.json()) as { success: boolean; data?: Study; message?: string };
      if (!res.ok || !json.success || !json.data) {
        setError(json.message ?? 'Failed to create study');
        return;
      }
      router.push(`/studies/${json.data.id}`);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="New Study" description="Create a study manually" />

      {error && (
        <div className="mb-4">
          <AlertBanner variant="error" message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <Input
          label="Study name"
          value={form.study_name}
          onChange={(e) => setForm((f) => ({ ...f, study_name: e.target.value }))}
          required
          placeholder="A Phase III Study of..."
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Protocol number"
            value={form.protocol_number}
            onChange={(e) => setForm((f) => ({ ...f, protocol_number: e.target.value }))}
            placeholder="PROTO-001"
          />
          <Input
            label="Phase"
            value={form.phase}
            onChange={(e) => setForm((f) => ({ ...f, phase: e.target.value }))}
            placeholder="Phase III"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Sponsor"
            value={form.sponsor}
            onChange={(e) => setForm((f) => ({ ...f, sponsor: e.target.value }))}
          />
          <Input
            label="CRO"
            value={form.cro}
            onChange={(e) => setForm((f) => ({ ...f, cro: e.target.value }))}
          />
        </div>
        <Input
          label="Therapeutic area"
          value={form.therapeutic_area}
          onChange={(e) => setForm((f) => ({ ...f, therapeutic_area: e.target.value }))}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Start date"
            type="date"
            value={form.start_date}
            onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
          />
          <Input
            label="End date"
            type="date"
            value={form.end_date}
            onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => router.push('/studies')}>
            Cancel
          </Button>
          <Button loading={saving} disabled={saving} onClick={() => void handleSave()}>
            Create Study
          </Button>
        </div>
      </div>
    </div>
  );
}
