'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { Site } from '@/types/sites';

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern (America/New_York)' },
  { value: 'America/Chicago', label: 'Central (America/Chicago)' },
  { value: 'America/Denver', label: 'Mountain (America/Denver)' },
  { value: 'America/Los_Angeles', label: 'Pacific (America/Los_Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska (America/Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Pacific/Honolulu)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London (Europe/London)' },
  { value: 'Europe/Paris', label: 'Paris (Europe/Paris)' },
];

type SiteForm = {
  name: string;
  site_code: string;
  principal_investigator: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  phone: string;
  timezone: string;
};

function toForm(site: Site): SiteForm {
  return {
    name: site.name,
    site_code: site.site_code ?? '',
    principal_investigator: site.principal_investigator ?? '',
    address: site.address ?? '',
    city: site.city ?? '',
    state: site.state ?? '',
    zip_code: site.zip_code ?? '',
    phone: site.phone ?? '',
    timezone: site.timezone ?? '',
  };
}

export function EditSiteModal({ site, onChanged }: { site: Site; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SiteForm>(() => toForm(site));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openModal() {
    setForm(toForm(site));
    setError(null);
    setOpen(true);
  }

  function stripEmpty(f: SiteForm): Record<string, string> {
    return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '')) as Record<
      string,
      string
    >;
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError('Site name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${site.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stripEmpty(form)),
      });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setError(json.message ?? 'Failed to update site');
        return;
      }
      setOpen(false);
      onChanged();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={openModal}>
        Edit
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Edit Site" size="lg">
        <div className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Input
            label="Site name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Site number"
              value={form.site_code}
              onChange={(e) => setForm((f) => ({ ...f, site_code: e.target.value }))}
            />
            <Input
              label="Principal Investigator"
              value={form.principal_investigator}
              onChange={(e) => setForm((f) => ({ ...f, principal_investigator: e.target.value }))}
            />
          </div>
          <Input
            label="Address"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          />
          <div className="grid grid-cols-3 gap-4">
            <Input
              label="City"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
            <Input
              label="State"
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
            />
            <Input
              label="ZIP code"
              value={form.zip_code}
              onChange={(e) => setForm((f) => ({ ...f, zip_code: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <Select
              label="Timezone"
              value={form.timezone}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
              placeholder="Select a timezone"
              options={TIMEZONE_OPTIONS}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={saving} disabled={saving} onClick={() => void handleSave()}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
