'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EditStudyModal } from '@/components/studies/EditStudyModal';
import { ArchiveStudyModal } from '@/components/studies/ArchiveStudyModal';
import { usePermissions } from '@/hooks/usePermissions';
import type { Study, StudyStatus } from '@/types/studies';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'default' | 'primary' | 'info';

const STATUS_VARIANT: Record<StudyStatus, BadgeVariant> = {
  draft: 'default',
  active: 'success',
  on_hold: 'warning',
  closed: 'danger',
  archived: 'default',
};

export function StudyProfileHeader({ study, onChanged }: { study: Study; onChanged: () => void }) {
  const { hasPermission } = usePermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(status: StudyStatus) {
    setBusy(true);
    setError(null);
    try {
      const url =
        status === 'closed' ? `/api/studies/${study.id}/close` : `/api/studies/${study.id}`;
      const res = await fetch(url, {
        method: status === 'closed' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        ...(status === 'closed' ? {} : { body: JSON.stringify({ status }) }),
      });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setError(json.message ?? 'Action failed');
        return;
      }
      onChanged();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setBusy(false);
    }
  }

  const canManage = hasPermission('manage_studies');
  const canEdit = canManage || hasPermission('edit_study');

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-900">{study.study_name}</h1>
            <Badge variant={STATUS_VARIANT[study.status]}>{study.status}</Badge>
            {study.ai_generated && <Badge variant="info">AI Draft</Badge>}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {[study.sponsor, study.phase, study.therapeutic_area].filter(Boolean).join(' · ') ||
              '—'}
          </p>
        </div>

        {canEdit && (
          <div className="flex gap-2">
            <EditStudyModal study={study} onChanged={onChanged} />
            {canManage && (study.status === 'draft' || study.status === 'on_hold') ? (
              <Button
                size="sm"
                loading={busy}
                disabled={busy}
                onClick={() => void updateStatus('active')}
              >
                Activate
              </Button>
            ) : null}
            {canManage && study.status === 'active' && (
              <Button
                size="sm"
                variant="danger"
                loading={busy}
                disabled={busy}
                onClick={() => void updateStatus('closed')}
              >
                Close Study
              </Button>
            )}
            {canManage && study.status !== 'archived' && (
              <ArchiveStudyModal study={study} onChanged={onChanged} />
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
