'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { SiteAssignedUser } from '@/types/sites';
import type { UserWithAccess } from '@/types/users';

export function SiteStaffTab({ siteId }: { siteId: string }) {
  const [assigned, setAssigned] = useState<SiteAssignedUser[]>([]);
  const [allUsers, setAllUsers] = useState<UserWithAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAssigned = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/users`);
      if (res.ok) {
        const json = (await res.json()) as { data: SiteAssignedUser[] };
        setAssigned(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  const fetchAllUsers = useCallback(async () => {
    const res = await fetch('/api/users');
    if (res.ok) {
      const json = (await res.json()) as { data: UserWithAccess[] };
      setAllUsers(json.data);
    }
  }, []);

  useEffect(() => {
    void fetchAssigned();
    void fetchAllUsers();
  }, [fetchAssigned, fetchAllUsers]);

  async function handleAssign() {
    if (!selectedUserId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${selectedUserId}/sites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: siteId }),
      });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setError(json.message ?? 'Failed to assign staff member');
        return;
      }
      setSelectedUserId('');
      void fetchAssigned();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(userId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}/sites/${siteId}`, { method: 'DELETE' });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setError(json.message ?? 'Failed to remove staff member');
        return;
      }
      void fetchAssigned();
    } finally {
      setBusy(false);
    }
  }

  const assignedIds = new Set(assigned.map((a) => a.id));
  const availableUsers = allUsers.filter((u) => !assignedIds.has(u.id));

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex-1">
          <Select
            label="Assign a staff member"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            placeholder="Select a user"
            options={availableUsers.map((u) => ({
              value: u.id,
              label: `${u.full_name} (${u.email})`,
            }))}
          />
        </div>
        <Button
          loading={busy}
          disabled={busy || !selectedUserId}
          onClick={() => void handleAssign()}
        >
          Assign
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {assigned.length === 0 ? (
        <EmptyState
          title="No staff assigned"
          description="Assign a staff member to this site using the picker above"
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Role(s)</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assigned.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{user.full_name}</td>
                  <td className="px-4 py-3 text-gray-600">{user.email}</td>
                  <td className="px-4 py-3">
                    {user.roles.length === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <Badge key={role.id} variant="info">
                            {role.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void handleRemove(user.id)}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
