'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { VisitLockStatus } from '@/lib/utils/visitSequencing';
import type { Subject } from '@/types/subjects';

export function SubjectBaselineCompleter({
  subject,
  lockStatus,
  onChanged,
}: {
  subject: Subject;
  lockStatus: VisitLockStatus;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [baselineDate, setBaselineDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (subject.baseline_date) return null;

  if (lockStatus.locked) {
    return (
      <div className="text-xs text-gray-500">
        <span className="font-medium text-gray-600">Baseline locked</span> — {lockStatus.reason}
      </div>
    );
  }

  function openModal() {
    setBaselineDate('');
    setError(null);
    setOpen(true);
  }

  async function handleSubmit() {
    if (!baselineDate) {
      setError('Baseline date is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/subjects/${subject.id}/baseline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseline_date: baselineDate }),
      });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        error?: { code: string; message: string };
      };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? json.message ?? 'Failed to complete baseline visit');
        return;
      }
      setOpen(false);
      onChanged();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={openModal}>
        Complete Baseline Visit
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Complete Baseline Visit">
        <div className="space-y-4">
          <Input
            label="Baseline date"
            type="date"
            value={baselineDate}
            onChange={(e) => setBaselineDate(e.target.value)}
            required
            hint="Anchors the rest of the protocol visit schedule"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy} disabled={busy} onClick={() => void handleSubmit()}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
