'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { VisitLockStatus } from '@/lib/utils/visitSequencing';
import type { Visit } from '@/types/subjects';

export function VisitCompleter({
  subjectId,
  visit,
  lockStatus,
  onChanged,
}: {
  subjectId: string;
  visit: Visit;
  lockStatus: VisitLockStatus;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sprint 4 visit state machine: Complete is only allowed from In Progress —
  // the visit must be Confirmed then Started first.
  if (visit.status !== 'in_progress') return null;

  if (lockStatus.locked) {
    return (
      <div className="text-xs text-gray-500">
        <span className="font-medium text-gray-600">Locked</span> — {lockStatus.reason}
      </div>
    );
  }

  function openModal() {
    setScheduledDate('');
    setError(null);
    setOpen(true);
  }

  async function handleSubmit() {
    if (!scheduledDate) {
      setError('Completion date is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/visits/${visit.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_date: scheduledDate }),
      });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        error?: { code: string; message: string };
      };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? json.message ?? 'Failed to complete visit');
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
        Complete
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Complete ${visit.visit_name}`}>
        <div className="space-y-4">
          <Input
            label="Completion date"
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            required
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
