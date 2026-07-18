'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Visit } from '@/types/subjects';

export function VisitRescheduler({
  subjectId,
  visit,
  onChanged,
}: {
  subjectId: string;
  visit: Visit;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [targetDate, setTargetDate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (visit.status !== 'scheduled' && visit.status !== 'confirmed') return null;

  function openModal() {
    setTargetDate(visit.target_date ?? '');
    setReason('');
    setError(null);
    setOpen(true);
  }

  async function handleSubmit() {
    if (!targetDate) {
      setError('A new date is required');
      return;
    }
    if (!reason.trim()) {
      setError('A reason is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/visits/${visit.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_date: targetDate, reason: reason.trim() }),
      });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        error?: { code: string; message: string };
      };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? json.message ?? 'Failed to reschedule visit');
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
        Reschedule
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Reschedule ${visit.visit_name}`}>
        <div className="space-y-4">
          <Input
            label="New target date"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            required
          />
          <div className="space-y-1">
            <label htmlFor="reschedule-reason" className="block text-sm font-medium text-slate-700">
              Reason
            </label>
            <textarea
              id="reschedule-reason"
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Required — why is this visit being rescheduled?"
            />
          </div>
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
