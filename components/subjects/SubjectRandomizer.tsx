'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Subject } from '@/types/subjects';

export function SubjectRandomizer({
  subject,
  onChanged,
}: {
  subject: Subject;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [randomizationNumber, setRandomizationNumber] = useState('');
  const [randomizationDate, setRandomizationDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (subject.randomization_date || subject.status !== 'screening') return null;

  if (!subject.baseline_date) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled
        title="Complete the Baseline visit before randomizing"
      >
        Randomize
      </Button>
    );
  }

  function openModal() {
    setRandomizationNumber('');
    setRandomizationDate('');
    setError(null);
    setOpen(true);
  }

  async function handleSubmit() {
    if (!randomizationNumber.trim()) {
      setError('Randomization number is required');
      return;
    }
    if (!randomizationDate) {
      setError('Randomization date is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/subjects/${subject.id}/randomize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          randomization_number: randomizationNumber.trim(),
          randomization_date: randomizationDate,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        error?: { code: string; message: string };
      };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? json.message ?? 'Failed to randomize subject');
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
        Randomize
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Randomize Subject">
        <div className="space-y-4">
          <Input
            label="Randomization number"
            value={randomizationNumber}
            onChange={(e) => setRandomizationNumber(e.target.value)}
            required
            placeholder="R-0001"
          />
          <Input
            label="Randomization date"
            type="date"
            value={randomizationDate}
            onChange={(e) => setRandomizationDate(e.target.value)}
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
