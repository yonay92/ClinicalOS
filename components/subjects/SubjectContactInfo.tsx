'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { usePermissions } from '@/hooks/usePermissions';
import type { PreferredContactMethod, SubjectContactInfo as ContactInfo } from '@/types/subjects';

const CONTACT_METHOD_OPTIONS: Array<{ value: PreferredContactMethod; label: string }> = [
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
];

type FormState = {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  sex: string;
  phone_primary: string;
  phone_secondary: string;
  email: string;
  preferred_language: string;
  preferred_contact_method: PreferredContactMethod;
  voicemail_permission: boolean;
  best_time_to_contact: string;
};

const EMPTY_FORM: FormState = {
  first_name: '',
  last_name: '',
  date_of_birth: '',
  sex: '',
  phone_primary: '',
  phone_secondary: '',
  email: '',
  preferred_language: '',
  preferred_contact_method: 'phone',
  voicemail_permission: false,
  best_time_to_contact: '',
};

function toFormState(contactInfo: ContactInfo): FormState {
  return {
    first_name: contactInfo.first_name,
    last_name: contactInfo.last_name,
    date_of_birth: contactInfo.date_of_birth,
    sex: contactInfo.sex,
    phone_primary: contactInfo.phone_primary,
    phone_secondary: contactInfo.phone_secondary ?? '',
    email: contactInfo.email ?? '',
    preferred_language: contactInfo.preferred_language,
    preferred_contact_method: contactInfo.preferred_contact_method,
    voicemail_permission: contactInfo.voicemail_permission,
    best_time_to_contact: contactInfo.best_time_to_contact ?? '',
  };
}

export function SubjectContactInfo({ subjectId }: { subjectId: string }) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission('view_subject_phi');
  const canEdit = hasPermission('edit_subject_phi');

  const [contactInfo, setContactInfo] = useState<ContactInfo | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContactInfo = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/contact-info`);
      if (res.ok) {
        const json = (await res.json()) as { data: ContactInfo | null };
        setContactInfo(json.data);
        setForm(json.data ? toFormState(json.data) : EMPTY_FORM);
        setEditing(!json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    if (canView) void fetchContactInfo();
    else setLoading(false);
  }, [canView, fetchContactInfo]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/contact-info`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          phone_secondary: form.phone_secondary.trim() || undefined,
          email: form.email.trim() || undefined,
          best_time_to_contact: form.best_time_to_contact.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: ContactInfo;
        error?: { message: string };
      };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Failed to save contact information');
        return;
      }
      setContactInfo(json.data ?? null);
      setEditing(false);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  }

  if (!canView) {
    return (
      <EmptyState
        title="Restricted"
        description="You do not have permission to view this subject's contact information."
      />
    );
  }

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!editing && contactInfo) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Contact Information</h3>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-gray-500">Name</dt>
              <dd className="mt-0.5 text-gray-900">
                {contactInfo.first_name} {contactInfo.last_name}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Date of Birth</dt>
              <dd className="mt-0.5 text-gray-900">{contactInfo.date_of_birth}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Sex</dt>
              <dd className="mt-0.5 text-gray-900">{contactInfo.sex}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Primary Phone</dt>
              <dd className="mt-0.5 text-gray-900">{contactInfo.phone_primary}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Secondary Phone</dt>
              <dd className="mt-0.5 text-gray-900">{contactInfo.phone_secondary ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Email</dt>
              <dd className="mt-0.5 text-gray-900">{contactInfo.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Preferred Language</dt>
              <dd className="mt-0.5 text-gray-900">{contactInfo.preferred_language}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Preferred Contact Method</dt>
              <dd className="mt-0.5 text-gray-900 capitalize">
                {contactInfo.preferred_contact_method}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">OK to Leave Voicemail</dt>
              <dd className="mt-0.5 text-gray-900">
                {contactInfo.voicemail_permission ? 'Yes' : 'No'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Best Time to Contact</dt>
              <dd className="mt-0.5 text-gray-900">{contactInfo.best_time_to_contact ?? '—'}</dd>
            </div>
          </dl>
        </div>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <EmptyState
        title="No contact information on file"
        description="You do not have permission to add it."
      />
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">
        {contactInfo ? 'Edit Contact Information' : 'Add Contact Information'}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="First Name"
          value={form.first_name}
          onChange={(e) => setForm({ ...form, first_name: e.target.value })}
        />
        <Input
          label="Last Name"
          value={form.last_name}
          onChange={(e) => setForm({ ...form, last_name: e.target.value })}
        />
        <Input
          label="Date of Birth"
          type="date"
          value={form.date_of_birth}
          onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
        />
        <Input
          label="Sex"
          value={form.sex}
          onChange={(e) => setForm({ ...form, sex: e.target.value })}
        />
        <Input
          label="Primary Phone"
          value={form.phone_primary}
          onChange={(e) => setForm({ ...form, phone_primary: e.target.value })}
        />
        <Input
          label="Secondary Phone (optional)"
          value={form.phone_secondary}
          onChange={(e) => setForm({ ...form, phone_secondary: e.target.value })}
        />
        <Input
          label="Email (optional)"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Input
          label="Preferred Language"
          value={form.preferred_language}
          onChange={(e) => setForm({ ...form, preferred_language: e.target.value })}
        />
        <Select
          label="Preferred Contact Method"
          value={form.preferred_contact_method}
          onChange={(e) =>
            setForm({
              ...form,
              preferred_contact_method: e.target.value as PreferredContactMethod,
            })
          }
          options={CONTACT_METHOD_OPTIONS}
        />
        <Input
          label="Best Time to Contact (optional)"
          value={form.best_time_to_contact}
          onChange={(e) => setForm({ ...form, best_time_to_contact: e.target.value })}
        />
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.voicemail_permission}
          onChange={(e) => setForm({ ...form, voicemail_permission: e.target.checked })}
        />
        OK to leave voicemail
      </label>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-3">
        {contactInfo && (
          <Button variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
        <Button loading={saving} disabled={saving} onClick={() => void handleSave()}>
          Save
        </Button>
      </div>
    </div>
  );
}
