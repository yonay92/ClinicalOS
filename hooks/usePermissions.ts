'use client';

import { useEffect, useState, useCallback } from 'react';
import type { PermissionKey } from '@/types/roles';

export function usePermissions() {
  const [permissions, setPermissions] = useState<PermissionKey[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await fetch('/api/users/me/permissions');
      if (!res.ok) {
        setPermissions([]);
        return;
      }
      const json = (await res.json()) as { data: { permissions: PermissionKey[] } };
      setPermissions(json.data.permissions);
    } catch {
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPermissions();
  }, [fetchPermissions]);

  const hasPermission = useCallback(
    (key: PermissionKey): boolean => permissions.includes(key),
    [permissions],
  );

  const hasAnyPermission = useCallback(
    (...keys: PermissionKey[]): boolean => keys.some((k) => permissions.includes(k)),
    [permissions],
  );

  return { permissions, loading, hasPermission, hasAnyPermission, refresh: fetchPermissions };
}
