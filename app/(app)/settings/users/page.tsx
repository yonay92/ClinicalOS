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
import type { Profile } from '@/types/users';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'default' | 'primary' | 'info';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  active: 'success',
  inactive: 'default',
  pending_invite: 'warning',
  suspended: 'danger',
};

type InviteForm = {
  email: string;
  role_ids: string[];
  site_ids: string[];
};

export default function UsersSettingsPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteForm>({
    email: '',
    role_ids: [],
    site_ids: [],
  });
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Failed to load users');
      const json = (await res.json()) as { data: { users: Profile[] } };
      setUsers(json.data.users);
    } catch {
      setError('Failed to load users. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  async function handleInvite() {
    setInviteError(null);
    setInviting(true);
    try {
      const res = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm),
      });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setInviteError(json.message ?? 'Failed to send invitation');
        return;
      }
      setInviteSuccess(true);
      setInviteForm({ email: '', role_ids: [], site_ids: [] });
      void fetchUsers();
    } catch {
      setInviteError('An unexpected error occurred');
    } finally {
      setInviting(false);
    }
  }

  function closeInviteModal() {
    setInviteOpen(false);
    setInviteError(null);
    setInviteSuccess(false);
    setInviteForm({ email: '', role_ids: [], site_ids: [] });
  }

  async function handleDeactivate(userId: string) {
    if (!confirm('Deactivate this user? They will lose access immediately.')) return;
    setDeactivatingId(userId);
    try {
      await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      void fetchUsers();
    } finally {
      setDeactivatingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage team members, roles, and access"
        action={<Button onClick={() => setInviteOpen(true)}>Invite User</Button>}
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
      ) : users.length === 0 ? (
        <EmptyState
          title="No users yet"
          description="Invite your first team member to get started"
          action={<Button onClick={() => setInviteOpen(true)}>Invite User</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Last Login</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{user.full_name}</td>
                  <td className="px-4 py-3 text-gray-600">{user.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[user.status] ?? 'default'}>
                      {user.status.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {user.last_login_at
                      ? new Date(user.last_login_at).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {user.status === 'active' && (
                      <Button
                        variant="danger"
                        size="sm"
                        loading={deactivatingId === user.id}
                        onClick={() => void handleDeactivate(user.id)}
                      >
                        Deactivate
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={inviteOpen} onClose={closeInviteModal} title="Invite User">
        {inviteSuccess ? (
          <div className="py-4 text-center">
            <p className="font-medium text-green-700">Invitation sent successfully!</p>
            <p className="mt-1 text-sm text-gray-500">
              The user will receive an email with a link to join.
            </p>
            <Button className="mt-4" onClick={closeInviteModal}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {inviteError && (
              <AlertBanner
                variant="error"
                message={inviteError}
                onDismiss={() => setInviteError(null)}
              />
            )}
            <Input
              label="Email address"
              type="email"
              value={inviteForm.email}
              onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="colleague@example.com"
              required
            />
            <p className="text-xs text-gray-500">
              Role and site assignments can be configured after the user accepts the invitation.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={closeInviteModal}>
                Cancel
              </Button>
              <Button
                loading={inviting}
                disabled={inviting || !inviteForm.email}
                onClick={() => void handleInvite()}
              >
                Send Invitation
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
