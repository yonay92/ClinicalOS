'use client';

import { useState, useEffect, useCallback } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { UserWithAccess } from '@/types/users';
import type { Role } from '@/types/roles';
import type { Site } from '@/types/sites';

export function UserAccessManager({
  user,
  onChanged,
}: {
  user: UserWithAccess;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [allSites, setAllSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchOptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rolesRes, sitesRes] = await Promise.all([fetch('/api/roles'), fetch('/api/sites')]);
      if (rolesRes.ok) {
        const json = (await rolesRes.json()) as { data: { roles: Role[] } };
        setAllRoles(json.data.roles ?? []);
      }
      if (sitesRes.ok) {
        const json = (await sitesRes.json()) as { data: Site[] };
        setAllSites(json.data ?? []);
      }
    } catch {
      setError('Failed to load roles and sites');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void fetchOptions();
  }, [open, fetchOptions]);

  async function toggleRole(roleId: string, assigned: boolean) {
    setBusyKey(`role:${roleId}`);
    setError(null);
    try {
      const res = assigned
        ? await fetch(`/api/users/${user.id}/roles/${roleId}`, { method: 'DELETE' })
        : await fetch(`/api/users/${user.id}/roles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role_id: roleId }),
          });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setError(json.message ?? 'Failed to update role');
        return;
      }
      onChanged();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleSite(siteId: string, assigned: boolean) {
    setBusyKey(`site:${siteId}`);
    setError(null);
    try {
      const res = assigned
        ? await fetch(`/api/users/${user.id}/sites/${siteId}`, { method: 'DELETE' })
        : await fetch(`/api/users/${user.id}/sites`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ site_id: siteId }),
          });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setError(json.message ?? 'Failed to update site');
        return;
      }
      onChanged();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Manage Access
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Manage Access — ${user.full_name}`}
        size="lg"
      >
        <div className="space-y-6">
          {error && <p className="text-sm text-red-600">{error}</p>}

          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">Roles</h3>
                {allRoles.length === 0 ? (
                  <p className="text-sm text-gray-500">No roles found</p>
                ) : (
                  <div className="space-y-2">
                    {allRoles.map((role) => {
                      const assigned = user.roles.some((r) => r.id === role.id);
                      return (
                        <label
                          key={role.id}
                          className="flex items-center gap-2 text-sm text-gray-700"
                        >
                          <input
                            type="checkbox"
                            checked={assigned}
                            disabled={busyKey === `role:${role.id}`}
                            onChange={() => void toggleRole(role.id, assigned)}
                          />
                          {role.name}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">Sites</h3>
                {allSites.length === 0 ? (
                  <p className="text-sm text-gray-500">No sites found</p>
                ) : (
                  <div className="space-y-2">
                    {allSites.map((site) => {
                      const assigned = user.sites.some((s) => s.id === site.id);
                      return (
                        <label
                          key={site.id}
                          className="flex items-center gap-2 text-sm text-gray-700"
                        >
                          <input
                            type="checkbox"
                            checked={assigned}
                            disabled={busyKey === `site:${site.id}`}
                            onChange={() => void toggleSite(site.id, assigned)}
                          />
                          {site.name}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
