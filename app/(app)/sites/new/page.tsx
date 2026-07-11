'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { AlertBanner } from '@/components/ui/AlertBanner';
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

const EMPTY_FORM: SiteForm = {
  name: '',
  site_code: '',
  principal_investigator: '',
  address: '',
  city: '',
  state: '',
  zip_code: '',
  phone: '',
  timezone: '',
};

export default function NewSitePage() {
  const router = useRouter();
  const [form, setForm] = useState<SiteForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stripEmpty(form)),
      });
      const json = (await res.json()) as { success: boolean; data?: Site; message?: string };
      if (!res.ok || !json.success || !json.data) {
        setError(json.message ?? 'Failed to create site');
        return;
      }
      router.push(`/sites/${json.data.id}`);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="New Site" description="Add a clinical research site" />

      {error && (
        <div className="mb-4">
          <AlertBanner variant="error" message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <Input
          label="Site name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
          placeholder="Main Research Center"
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Site number"
            value={form.site_code}
            onChange={(e) => setForm((f) => ({ ...f, site_code: e.target.value }))}
            placeholder="101"
          />
          <Input
            label="Principal Investigator"
            value={form.principal_investigator}
            onChange={(e) => setForm((f) => ({ ...f, principal_investigator: e.target.value }))}
            placeholder="Dr. Jane Smith"
          />
        </div>
        <Input
          label="Address"
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          placeholder="123 Research Blvd"
        />
        <div className="grid grid-cols-3 gap-4">
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
          <Input
            label="ZIP code"
            value={form.zip_code}
            onChange={(e) => setForm((f) => ({ ...f, zip_code: e.target.value }))}
            placeholder="02101"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="(617) 555-0100"
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
          <Button variant="outline" onClick={() => router.push('/sites')}>
            Cancel
          </Button>
          <Button loading={saving} disabled={saving} onClick={() => void handleSave()}>
            Create Site
          </Button>
        </div>
      </div>
    </div>
  );
}
