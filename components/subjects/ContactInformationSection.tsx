'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { usePermissions } from '@/hooks/usePermissions';
import type { SubjectContactInfo as ContactInfo } from '@/types/subjects';
import type { AppointmentConfirmation, AppointmentConfirmationStatus } from '@/types/visits';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'default' | 'primary' | 'info';

const CONFIRMATION_STATUS_VARIANT: Record<AppointmentConfirmationStatus, BadgeVariant> = {
  not_contacted: 'default',
  attempted: 'info',
  confirmed: 'success',
  left_voicemail: 'warning',
  requested_reschedule: 'warning',
  unable_to_reach: 'danger',
};

const CONFIRMATION_STATUS_OPTIONS: Array<{ value: AppointmentConfirmationStatus; label: string }> =
  [
    { value: 'attempted', label: 'Attempted' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'left_voicemail', label: 'Left Voicemail' },
    { value: 'requested_reschedule', label: 'Requested Reschedule' },
    { value: 'unable_to_reach', label: 'Unable to Reach' },
  ];

// Only rendered for a user holding view_subject_phi — renders null otherwise,
// same silent self-gate convention as VisitReopener. Editing the underlying
// contact record happens on the Subject's Contact Info tab, not here; this
// panel is read + appointment-confirmation actions only.
export function ContactInformationSection({
  subjectId,
  visitId,
}: {
  subjectId: string;
  visitId: string;
}) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission('view_subject_phi');
  const canEdit = hasPermission('edit_subject_phi');

  const [contactInfo, setContactInfo] = useState<ContactInfo | null>(null);
  const [confirmation, setConfirmation] = useState<AppointmentConfirmation | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const [logOpen, setLogOpen] = useState(false);
  const [status, setStatus] = useState<AppointmentConfirmationStatus>('attempted');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [contactRes, confirmationRes] = await Promise.all([
        fetch(`/api/subjects/${subjectId}/contact-info`),
        fetch(`/api/subjects/${subjectId}/visits/${visitId}/confirmation`),
      ]);
      if (contactRes.ok) {
        const json = (await contactRes.json()) as { data: ContactInfo | null };
        setContactInfo(json.data);
      }
      if (confirmationRes.ok) {
        const json = (await confirmationRes.json()) as { data: AppointmentConfirmation | null };
        setConfirmation(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [subjectId, visitId]);

  useEffect(() => {
    if (canView) void load();
    else setLoading(false);
  }, [canView, load]);

  if (!canView) return null;

  function openLogModal() {
    setStatus('attempted');
    setNotes('');
    setError(null);
    setLogOpen(true);
  }

  async function handleCopyPhone() {
    if (!contactInfo?.phone_primary) return;
    await navigator.clipboard.writeText(contactInfo.phone_primary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleLogContact() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/visits/${visitId}/confirmation/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmation_status: status,
          notes: notes.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        error?: { message: string };
      };
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Failed to log contact attempt');
        return;
      }
      setLogOpen(false);
      await load();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-gray-100 pt-4">
      <h4 className="mb-2 text-sm font-semibold text-gray-900">Contact Information</h4>

      {loading ? (
        <div className="flex justify-center py-4">
          <LoadingSpinner size="sm" />
        </div>
      ) : !contactInfo ? (
        <p className="text-sm text-gray-500">
          No contact information on file —{' '}
          <Link href={`/subjects/${subjectId}`} className="text-blue-600 hover:underline">
            add it from the Subject profile
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-gray-500">Name</dt>
              <dd className="text-gray-900">
                {contactInfo.first_name} {contactInfo.last_name}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Primary Phone</dt>
              <dd className="text-gray-900">{contactInfo.phone_primary}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Email</dt>
              <dd className="text-gray-900">{contactInfo.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Voicemail OK</dt>
              <dd className="text-gray-900">{contactInfo.voicemail_permission ? 'Yes' : 'No'}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2">
            <a href={`tel:${contactInfo.phone_primary}`}>
              <Button size="sm" variant="outline" type="button">
                Call Patient
              </Button>
            </a>
            {contactInfo.email && (
              <a href={`mailto:${contactInfo.email}`}>
                <Button size="sm" variant="outline" type="button">
                  Email Patient
                </Button>
              </a>
            )}
            <Button size="sm" variant="outline" onClick={() => void handleCopyPhone()}>
              {copied ? 'Copied!' : 'Copy Phone Number'}
            </Button>
          </div>

          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-700">Confirmation Status</span>
              <Badge
                variant={
                  CONFIRMATION_STATUS_VARIANT[confirmation?.confirmation_status ?? 'not_contacted']
                }
              >
                {(confirmation?.confirmation_status ?? 'not_contacted').replace(/_/g, ' ')}
              </Badge>
            </div>
            <dl className="mt-2 space-y-1 text-gray-600">
              <div className="flex justify-between">
                <dt>Last contacted</dt>
                <dd>
                  {confirmation?.last_contacted_at
                    ? new Date(confirmation.last_contacted_at).toLocaleString()
                    : '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Contact attempts</dt>
                <dd>{confirmation?.contact_attempt_count ?? 0}</dd>
              </div>
              {confirmation?.contact_notes && (
                <div>
                  <dt>Notes</dt>
                  <dd className="text-gray-900">{confirmation.contact_notes}</dd>
                </div>
              )}
            </dl>
            {canEdit && (
              <Button size="sm" className="mt-3" onClick={openLogModal}>
                Log Contact Attempt
              </Button>
            )}
          </div>
        </div>
      )}

      <Modal open={logOpen} onClose={() => setLogOpen(false)} title="Log Contact Attempt">
        <div className="space-y-4">
          <Select
            label="Outcome"
            value={status}
            onChange={(e) => setStatus(e.target.value as AppointmentConfirmationStatus)}
            options={CONFIRMATION_STATUS_OPTIONS}
          />
          <div className="space-y-1">
            <label htmlFor="contact-notes" className="block text-sm font-medium text-slate-700">
              Notes (optional)
            </label>
            <textarea
              id="contact-notes"
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {status === 'requested_reschedule' && (
            <p className="text-xs text-gray-500">
              This only records the request. Use the Reschedule action below to actually change the
              visit date.
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setLogOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy} disabled={busy} onClick={() => void handleLogContact()}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
