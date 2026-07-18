'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { Visit } from '@/types/subjects';

export function VisitStarter({
  subjectId,
  visit,
  onChanged,
}: {
  subjectId: string;
  visit: Visit;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (visit.status !== 'confirmed') return null;

  async function handleStart() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/visits/${visit.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        error?: { code: string; message: string };
      };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? json.message ?? 'Failed to start visit');
        return;
      }
      onChanged();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button
        size="sm"
        variant="outline"
        loading={busy}
        disabled={busy}
        onClick={() => void handleStart()}
      >
        Start
      </Button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
