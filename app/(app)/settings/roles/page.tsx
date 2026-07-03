'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Role, Permission, RolePermission } from '@/types/roles';

type RoleWithPermissions = Role & {
  permissions: string[];
};

type ApiRolesResponse = {
  data: {
    roles: Array<
      Role & {
        role_permissions?: Array<RolePermission & { permissions?: { key: string } }>;
      }
    >;
  };
};

export default function RolesSettingsPage() {
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        fetch('/api/roles'),
        fetch('/api/permissions'),
      ]);

      if (rolesRes.ok) {
        const json = (await rolesRes.json()) as ApiRolesResponse;
        const mapped: RoleWithPermissions[] = (json.data.roles ?? []).map((r) => ({
          ...r,
          permissions:
            r.role_permissions?.filter((rp) => rp.allowed).map((rp) => rp.permissions?.key ?? '') ??
            [],
        }));
        setRoles(mapped);
      }

      if (permsRes.ok) {
        const json = (await permsRes.json()) as { data: { permissions: Permission[] } };
        setAllPermissions(json.data.permissions ?? []);
      }
    } catch {
      setError('Failed to load roles. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const moduleGroups = allPermissions.reduce<Record<string, Permission[]>>((acc, p) => {
    const group = acc[p.module] ?? [];
    group.push(p);
    acc[p.module] = group;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        description="View system roles and their assigned permissions"
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
      ) : roles.length === 0 ? (
        <EmptyState title="No roles found" description="System roles will appear here" />
      ) : (
        <div className="space-y-3">
          {roles.map((role) => (
            <div
              key={role.id}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white"
            >
              <button
                type="button"
                className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-gray-50"
                onClick={() => setExpandedId(expandedId === role.id ? null : role.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gray-900">{role.name}</span>
                  {role.is_system_role && <Badge variant="info">System</Badge>}
                  <Badge variant="default">{role.permissions.length} permissions</Badge>
                </div>
                <svg
                  className={`h-4 w-4 text-gray-400 transition-transform ${expandedId === role.id ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {expandedId === role.id && (
                <div className="border-t border-gray-100 px-5 py-4">
                  {role.description && (
                    <p className="mb-4 text-sm text-gray-500">{role.description}</p>
                  )}
                  {Object.keys(moduleGroups).length === 0 ? (
                    <p className="text-sm text-gray-500">
                      {role.permissions.length > 0
                        ? role.permissions.join(', ')
                        : 'No permissions assigned'}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {Object.entries(moduleGroups).map(([module, perms]) => (
                        <div key={module}>
                          <p className="mb-2 text-xs font-semibold tracking-wider text-gray-400 uppercase">
                            {module.replace(/_/g, ' ')}
                          </p>
                          <div className="space-y-1">
                            {perms.map((perm) => {
                              const granted = role.permissions.includes(perm.key);
                              return (
                                <div key={perm.id} className="flex items-center gap-2">
                                  <span
                                    className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${granted ? 'bg-green-500' : 'bg-gray-200'}`}
                                  />
                                  <span
                                    className={`text-xs ${granted ? 'text-gray-800' : 'text-gray-400'}`}
                                  >
                                    {perm.key.replace(/_/g, ' ')}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
