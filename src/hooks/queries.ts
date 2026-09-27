// Profil- und Admin-Hooks (TanStack Query über dem Supabase-Client).
// Ernährung: ./nutrition.ts, Training: ./training.ts

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthProvider';
import type { AdminUserOverviewRow, ProfileRow } from '@/lib/database.types';

export const queryKeys = {
  profile: (userId: string) => ['profile', userId] as const,
};

// ---------------------------------------------------------------- Profil
export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.profile(user?.id ?? 'anon'),
    enabled: !!user,
    queryFn: async (): Promise<ProfileRow | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (update: Partial<ProfileRow>) => {
      const { error } = await supabase.from('profiles').update(update).eq('id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(user!.id) });
    },
  });
}

// ---------------------------------------------------------------- Admin
/** true, sobald bekannt ist, ob der Nutzer Admin ist – sonst undefined während des Ladens. */
export function useIsAdmin(): boolean | undefined {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['is-admin', user?.id ?? 'anon'],
    enabled: !!user,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('app_admins')
        .select('user_id')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
  if (!user || isLoading) return undefined;
  return data ?? false;
}

export function useAdminUserOverview(enabled: boolean) {
  return useQuery({
    queryKey: ['admin-user-overview'],
    enabled,
    queryFn: async (): Promise<AdminUserOverviewRow[]> => {
      const { data, error } = await supabase.rpc('admin_user_overview');
      if (error) throw error;
      return (data ?? []) as AdminUserOverviewRow[];
    },
  });
}

/** Lesbare Fehlermeldung aus Supabase-/JS-Fehlern. */
export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message: unknown }).message);
    if (/relation .* does not exist|Could not find the table|schema cache/i.test(msg)) {
      return 'Datenbank noch nicht aktualisiert – bitte Migration 0009 in Supabase ausführen.';
    }
    return msg;
  }
  return 'Unbekannter Fehler';
}
