'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { Visit } from '@/types/subjects';

const CANCELLABLE_STATUSES: Visit['status'][] = ['scheduled', 'confirmed', 'in_progress'];

export function VisitCanceller({
  subjectId,
  visit,
  onChanged,
}: {
  subjectId: string;
  visit: Visit;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!CANCELLABLE_STATUSES.includes(visit.status)) return null;

  function openModal() {
    setReason('');
    setError(null);
    setOpen(true);
  }

  async function handleCancel() {
    if (!reason.trim()) {
      setError('A reason is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/visits/${visit.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        error?: { code: string; message: string };
      };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? json.message ?? 'Failed to cancel visit');
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
      <Button size="sm" variant="danger" onClick={openModal}>
        Cancel
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Cancel ${visit.visit_name}`}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Cancel &ldquo;{visit.visit_name}&rdquo;? The visit record is kept, never deleted.
          </p>
          <div className="space-y-1">
            <label htmlFor="cancel-reason" className="block text-sm font-medium text-slate-700">
              Reason
            </label>
            <textarea
              id="cancel-reason"
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Required — why is this visit being cancelled?"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Back
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={busy}
              onClick={() => void handleCancel()}
            >
              Cancel Visit
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
