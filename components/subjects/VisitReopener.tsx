'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { usePermissions } from '@/hooks/usePermissions';
import type { Visit } from '@/types/subjects';

// Only rendered for a user holding reopen_visit — matches the existing
// force-archive actions (StudyProfileHeader/SiteProfileHeader), which hide
// rather than disable a dangerous-operation button the caller can't use.
export function VisitReopener({
  subjectId,
  visit,
  onChanged,
}: {
  subjectId: string;
  visit: Visit;
  onChanged: () => void;
}) {
  const { hasPermission } = usePermissions();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (visit.status !== 'completed') return null;
  if (!hasPermission('reopen_visit')) return null;

  function openModal() {
    setReason('');
    setError(null);
    setOpen(true);
  }

  async function handleReopen() {
    if (!reason.trim()) {
      setError('A reason is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/visits/${visit.id}/reopen`, {
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
        setError(json.error?.message ?? json.message ?? 'Failed to reopen visit');
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
        Reopen
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Reopen ${visit.visit_name}`}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Reopening returns this visit to In Progress. This overrides the normal one-way
            completion and requires a reason for the audit trail.
          </p>
          <div className="space-y-1">
            <label htmlFor="reopen-reason" className="block text-sm font-medium text-slate-700">
              Reason
            </label>
            <textarea
              id="reopen-reason"
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Required — why is this visit being reopened?"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Back
            </Button>
            <Button loading={busy} disabled={busy} onClick={() => void handleReopen()}>
              Reopen Visit
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
