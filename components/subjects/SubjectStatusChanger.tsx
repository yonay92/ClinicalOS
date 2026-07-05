'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import type { Subject, SubjectStatus } from '@/types/subjects';

const STATUS_OPTIONS: Array<{ value: SubjectStatus; label: string }> = [
  { value: 'pre_screening', label: 'Pre-Screening' },
  { value: 'screening', label: 'Screening' },
  { value: 'screen_failed', label: 'Screen Failed' },
  { value: 'randomized', label: 'Randomized' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'early_terminated', label: 'Early Terminated' },
  { value: 'lost_to_follow_up', label: 'Lost to Follow Up' },
];

export function SubjectStatusChanger({
  subject,
  onChanged,
}: {
  subject: Subject;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<SubjectStatus | ''>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openModal() {
    setStatus('');
    setReason('');
    setError(null);
    setOpen(true);
  }

  async function handleSubmit() {
    if (!status) {
      setError('Select a new status');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/subjects/${subject.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(reason.trim() ? { reason: reason.trim() } : {}) }),
      });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setError(json.message ?? 'Failed to change status');
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
        Change Status
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Change Subject Status">
        <div className="space-y-4">
          <Select
            label="New status"
            value={status}
            onChange={(e) => setStatus(e.target.value as SubjectStatus)}
            placeholder="Select a status"
            options={STATUS_OPTIONS.filter((o) => o.value !== subject.status)}
          />
          <div className="space-y-1">
            <label htmlFor="status-reason" className="block text-sm font-medium text-slate-700">
              Reason (optional)
            </label>
            <textarea
              id="status-reason"
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
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
