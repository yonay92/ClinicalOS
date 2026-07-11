'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EditSiteModal } from '@/components/sites/EditSiteModal';
import { ArchiveSiteModal } from '@/components/sites/ArchiveSiteModal';
import { usePermissions } from '@/hooks/usePermissions';
import type { Site, SiteStatus } from '@/types/sites';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'default' | 'primary' | 'info';

const STATUS_VARIANT: Record<SiteStatus, BadgeVariant> = {
  active: 'success',
  inactive: 'default',
  closed: 'danger',
  archived: 'default',
};

export function SiteProfileHeader({ site, onChanged }: { site: Site; onChanged: () => void }) {
  const { hasPermission } = usePermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(status: SiteStatus) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${site.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
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

  const canManage = hasPermission('manage_sites');

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-900">{site.name}</h1>
            <Badge variant={STATUS_VARIANT[site.status]}>{site.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {[site.site_code, site.principal_investigator, site.city].filter(Boolean).join(' · ') ||
              '—'}
          </p>
        </div>

        {canManage && (
          <div className="flex gap-2">
            <EditSiteModal site={site} onChanged={onChanged} />
            {site.status === 'active' && (
              <Button
                size="sm"
                variant="danger"
                loading={busy}
                disabled={busy}
                onClick={() => void updateStatus('inactive')}
              >
                Deactivate
              </Button>
            )}
            {site.status === 'inactive' && (
              <Button
                size="sm"
                loading={busy}
                disabled={busy}
                onClick={() => void updateStatus('active')}
              >
                Activate
              </Button>
            )}
            {site.status !== 'archived' && <ArchiveSiteModal site={site} onChanged={onChanged} />}
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
