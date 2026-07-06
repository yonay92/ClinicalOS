'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Site } from '@/types/sites';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'default' | 'primary' | 'info';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  active: 'success',
  inactive: 'default',
  closed: 'danger',
};

type SiteForm = {
  name: string;
  site_code: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  phone: string;
};

const EMPTY_FORM: SiteForm = {
  name: '',
  site_code: '',
  address: '',
  city: '',
  state: '',
  zip_code: '',
  phone: '',
};

export default function SitesSettingsPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editSite, setEditSite] = useState<Site | null>(null);
  const [form, setForm] = useState<SiteForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchSites = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sites');
      if (!res.ok) throw new Error('Failed to load sites');
      const json = (await res.json()) as { data: Site[] };
      setSites(json.data);
    } catch {
      setError('Failed to load sites. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSites();
  }, [fetchSites]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setCreateOpen(true);
  }

  function openEdit(site: Site) {
    setForm({
      name: site.name,
      site_code: site.site_code ?? '',
      address: site.address ?? '',
      city: site.city ?? '',
      state: site.state ?? '',
      zip_code: site.zip_code ?? '',
      phone: site.phone ?? '',
    });
    setFormError(null);
    setEditSite(site);
  }

  function closeModal() {
    setCreateOpen(false);
    setEditSite(null);
    setFormError(null);
  }

  function stripEmpty(f: SiteForm): Record<string, string> {
    return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '')) as Record<
      string,
      string
    >;
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setFormError('Site name is required');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = stripEmpty(form);
      let res: Response;
      if (editSite) {
        res = await fetch(`/api/sites/${editSite.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch('/api/sites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setFormError(json.message ?? 'Failed to save site');
        return;
      }
      closeModal();
      void fetchSites();
    } catch {
      setFormError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(site: Site) {
    const newStatus = site.status === 'active' ? 'inactive' : 'active';
    if (!confirm(`Set site "${site.name}" to ${newStatus}?`)) return;
    await fetch(`/api/sites/${site.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    void fetchSites();
  }

  return (
    <div>
      <PageHeader
        title="Sites"
        description="Manage clinical research sites and their access"
        action={<Button onClick={openCreate}>Add Site</Button>}
      />

      {error && (
        <div className="mb-4">
          <AlertBanner variant="error" message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : sites.length === 0 ? (
        <EmptyState
          title="No sites yet"
          description="Add your first clinical research site"
          action={<Button onClick={openCreate}>Add Site</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Code</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">City</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sites.map((site) => (
                <tr key={site.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{site.name}</td>
                  <td className="px-4 py-3 text-gray-600">{site.site_code ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {[site.city, site.state].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[site.status] ?? 'default'}>{site.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(site)}>
                        Edit
                      </Button>
                      <Button
                        variant={site.status === 'active' ? 'danger' : 'secondary'}
                        size="sm"
                        onClick={() => void handleToggleStatus(site)}
                      >
                        {site.status === 'active' ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={createOpen || editSite !== null}
        onClose={closeModal}
        title={editSite ? 'Edit Site' : 'Add Site'}
      >
        <div className="space-y-4">
          {formError && (
            <AlertBanner variant="error" message={formError} onDismiss={() => setFormError(null)} />
          )}
          <Input
            label="Site name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            placeholder="Main Research Center"
          />
          <Input
            label="Site code"
            value={form.site_code}
            onChange={(e) => setForm((f) => ({ ...f, site_code: e.target.value }))}
            placeholder="MRC-001"
            hint="Optional short identifier"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="City"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              placeholder="Boston"
            />
            <Input
              label="State"
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              placeholder="MA"
            />
          </div>
          <Input
            label="Address"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="123 Research Blvd"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="ZIP code"
              value={form.zip_code}
              onChange={(e) => setForm((f) => ({ ...f, zip_code: e.target.value }))}
              placeholder="02101"
            />
            <Input
              label="Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="(617) 555-0100"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button loading={saving} disabled={saving} onClick={() => void handleSave()}>
              {editSite ? 'Save Changes' : 'Add Site'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
