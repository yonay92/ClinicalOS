'use client';

import { useEffect, useState, useCallback } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { Profile } from '@/types/users';
import type { Company } from '@/types/users';

export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; profile: Profile; company: Company }
  | { status: 'unauthenticated' };

export function useAuth(): AuthState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch('/api/users/me');
      if (!res.ok) {
        setState({ status: 'unauthenticated' });
        return;
      }
      const json = (await res.json()) as { data: { profile: Profile; company: Company } };
      setState({ status: 'authenticated', profile: json.data.profile, company: json.data.company });
    } catch {
      setState({ status: 'unauthenticated' });
    }
  }, []);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    void fetchMe();

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setState({ status: 'unauthenticated' });
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        void fetchMe();
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [fetchMe]);

  return { ...state, refresh: fetchMe };
}
