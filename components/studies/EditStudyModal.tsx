'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
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

function toForm(study: Study): StudyForm {
  return {
    study_name: study.study_name,
    protocol_number: study.protocol_number ?? '',
    sponsor: study.sponsor ?? '',
    cro: study.cro ?? '',
    phase: study.phase ?? '',
    therapeutic_area: study.therapeutic_area ?? '',
    start_date: study.start_date ?? '',
    end_date: study.end_date ?? '',
  };
}

export function EditStudyModal({ study, onChanged }: { study: Study; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<StudyForm>(() => toForm(study));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openModal() {
    setForm(toForm(study));
    setError(null);
    setOpen(true);
  }

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
      const res = await fetch(`/api/studies/${study.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stripEmpty(form)),
      });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setError(json.message ?? 'Failed to update study');
        return;
      }
      setOpen(false);
      onChanged();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={openModal}>
        Edit
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Edit Study" size="lg">
        <div className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Input
            label="Study name"
            value={form.study_name}
            onChange={(e) => setForm((f) => ({ ...f, study_name: e.target.value }))}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Protocol number"
              value={form.protocol_number}
              onChange={(e) => setForm((f) => ({ ...f, protocol_number: e.target.value }))}
            />
            <Input
              label="Phase"
              value={form.phase}
              onChange={(e) => setForm((f) => ({ ...f, phase: e.target.value }))}
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
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={saving} disabled={saving} onClick={() => void handleSave()}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
