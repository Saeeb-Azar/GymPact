// Zentrale Datenzugriffs-Schicht: React-Query-Hooks über dem Supabase-Client.
// Nested Selects werden explizit gecastet, da die DB-Typen handgepflegt sind.

import { useEffect } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthProvider';
import type {
  ChallengeRow,
  DailyCheckinRow,
  GroupMemberRow,
  GroupRow,
  HabitEntryRow,
  HabitRow,
  HabitTargetRow,
  NotificationPreferencesRow,
  NotificationRow,
  ProfileRow,
} from '@/lib/database.types';
import type { DateString } from '@/lib/dates';

// ---------------------------------------------------------------- Typen
export interface Membership {
  group_id: string;
  role: 'owner' | 'member';
  groups: GroupRow;
}

export interface MemberWithProfile extends GroupMemberRow {
  profiles: ProfileRow;
}

export interface ChallengeWithHabits extends ChallengeRow {
  habits: HabitRow[];
}

export interface CheckinWithEntries extends DailyCheckinRow {
  habit_entries: HabitEntryRow[];
}

export const queryKeys = {
  profile: (userId: string) => ['profile', userId] as const,
  memberships: (userId: string) => ['memberships', userId] as const,
  groupMembers: (groupId: string) => ['group-members', groupId] as const,
  activeChallenge: (groupId: string) => ['active-challenge', groupId] as const,
  checkin: (challengeId: string, userId: string, date: string) =>
    ['checkin', challengeId, userId, date] as const,
  groupCheckins: (challengeId: string, date: string) =>
    ['group-checkins', challengeId, date] as const,
  myEntries: (challengeId: string, userId: string) =>
    ['my-entries', challengeId, userId] as const,
  notifications: (userId: string) => ['notifications', userId] as const,
  prefs: (userId: string) => ['prefs', userId] as const,
  recentActivity: (challengeId: string) => ['recent-activity', challengeId] as const,
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
      const { error } = await supabase
        .from('profiles')
        .update(update)
        .eq('id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(user!.id) });
    },
  });
}

// ---------------------------------------------------------------- Gruppen
export function useMemberships() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.memberships(user?.id ?? 'anon'),
    enabled: !!user,
    queryFn: async (): Promise<Membership[]> => {
      const { data, error } = await supabase
        .from('group_members')
        .select('group_id, role, groups(*)')
        .eq('user_id', user!.id)
        .order('joined_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Membership[];
    },
  });
}

export function useGroupMembers(groupId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.groupMembers(groupId ?? 'none'),
    enabled: !!groupId,
    queryFn: async (): Promise<MemberWithProfile[]> => {
      const { data, error } = await supabase
        .from('group_members')
        .select('*, profiles(*)')
        .eq('group_id', groupId!)
        .order('joined_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as MemberWithProfile[];
    },
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<GroupRow> => {
      const { data, error } = await supabase.rpc('create_group', { p_name: name });
      if (error) throw new Error(error.message);
      return data as GroupRow;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memberships'] }),
  });
}

export function useJoinGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inviteCode: string): Promise<GroupRow> => {
      const { data, error } = await supabase.rpc('join_group', {
        p_invite_code: inviteCode,
      });
      if (error) throw new Error(error.message);
      return data as GroupRow;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memberships'] }),
  });
}

export function useLeaveGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.rpc('leave_group', { p_group_id: groupId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function useRegenerateInviteCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string): Promise<string> => {
      const { data, error } = await supabase.rpc('regenerate_invite_code', {
        p_group_id: groupId,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memberships'] }),
  });
}

// ---------------------------------------------------------------- Challenges
export function useActiveChallenge(groupId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.activeChallenge(groupId ?? 'none'),
    enabled: !!groupId,
    queryFn: async (): Promise<ChallengeWithHabits | null> => {
      const { data, error } = await supabase
        .from('challenges')
        .select('*, habits(*)')
        .eq('group_id', groupId!)
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const challenge = data as unknown as ChallengeWithHabits;
      challenge.habits.sort((a, b) => a.sort_order - b.sort_order);
      return challenge;
    },
  });
}

// ---------------------------------------------------------------- Persönliche Zielwerte
// Das Thema einer numerischen Gewohnheit ist für die Gruppe gleich, der
// Zielwert aber pro Person unterschiedlich (z. B. Protein: 180 g vs. 160 g).

export function useMyHabitTargets() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-habit-targets', user?.id ?? 'anon'],
    enabled: !!user,
    queryFn: async (): Promise<HabitTargetRow[]> => {
      const { data, error } = await supabase
        .from('habit_targets')
        .select('*')
        .eq('user_id', user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSetHabitTarget() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { habitId: string; targetValue: number }) => {
      const { error } = await supabase.from('habit_targets').upsert(
        {
          habit_id: input.habitId,
          user_id: user!.id,
          target_value: input.targetValue,
        },
        { onConflict: 'habit_id,user_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-habit-targets', user?.id ?? 'anon'] });
    },
  });
}

export interface NewHabit {
  name: string;
  type: 'boolean' | 'numeric';
  target_value: number | null;
  unit: string | null;
  auto_remind: boolean;
}

export function useCreateChallenge() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      groupId: string;
      name: string;
      description: string;
      startDate: string;
      endDate: string;
      habits: NewHabit[];
    }) => {
      const { data: challenge, error } = await supabase
        .from('challenges')
        .insert({
          group_id: input.groupId,
          name: input.name,
          description: input.description,
          start_date: input.startDate,
          end_date: input.endDate,
          status: 'active',
          created_by: user!.id,
        })
        .select('*')
        .single();
      if (error) throw error;

      const { error: habitsError } = await supabase.from('habits').insert(
        input.habits.map((habit, index) => ({
          challenge_id: challenge.id,
          name: habit.name,
          type: habit.type,
          target_value: habit.type === 'numeric' ? habit.target_value : null,
          unit: habit.unit,
          sort_order: index,
          auto_remind: habit.auto_remind,
        })),
      );
      if (habitsError) {
        // Challenge ohne Gewohnheiten wieder entfernen, damit kein
        // halbfertiger Zustand zurückbleibt.
        await supabase.from('challenges').delete().eq('id', challenge.id);
        throw habitsError;
      }
      return challenge;
    },
    onSuccess: (challenge) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.activeChallenge(challenge.group_id),
      });
    },
  });
}

export function useUpdateChallengeStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { challengeId: string; status: ChallengeRow['status'] }) => {
      const { error } = await supabase
        .from('challenges')
        .update({ status: input.status })
        .eq('id', input.challengeId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['active-challenge'] }),
  });
}

// ---------------------------------------------------------------- Check-ins
export function useMyCheckin(challengeId: string | undefined, date: DateString) {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.checkin(challengeId ?? 'none', user?.id ?? 'anon', date),
    enabled: !!challengeId && !!user,
    queryFn: async (): Promise<CheckinWithEntries | null> => {
      const { data, error } = await supabase
        .from('daily_checkins')
        .select('*, habit_entries(*)')
        .eq('challenge_id', challengeId!)
        .eq('user_id', user!.id)
        .eq('date', date)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as CheckinWithEntries | null;
    },
  });
}

/** Check-ins aller Gruppenmitglieder für einen Tag (RLS: nur eigene Gruppe). */
export function useGroupCheckins(challengeId: string | undefined, date: DateString) {
  return useQuery({
    queryKey: queryKeys.groupCheckins(challengeId ?? 'none', date),
    enabled: !!challengeId,
    queryFn: async (): Promise<CheckinWithEntries[]> => {
      const { data, error } = await supabase
        .from('daily_checkins')
        .select('*, habit_entries(*)')
        .eq('challenge_id', challengeId!)
        .eq('date', date);
      if (error) throw error;
      return (data ?? []) as unknown as CheckinWithEntries[];
    },
  });
}

/** Alle eigenen Check-ins einer Challenge (Fortschrittsseite). */
export function useMyChallengeCheckins(challengeId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.myEntries(challengeId ?? 'none', user?.id ?? 'anon'),
    enabled: !!challengeId && !!user,
    queryFn: async (): Promise<CheckinWithEntries[]> => {
      const { data, error } = await supabase
        .from('daily_checkins')
        .select('*, habit_entries(*)')
        .eq('challenge_id', challengeId!)
        .eq('user_id', user!.id)
        .order('date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CheckinWithEntries[];
    },
  });
}

/**
 * Alle Check-ins ALLER Mitglieder über die ganze Challenge (Gruppenansicht).
 * RLS erlaubt Mitgliedern, die Check-ins ihrer Gruppe zu lesen.
 */
export function useChallengeGroupCheckins(challengeId: string | undefined) {
  return useQuery({
    queryKey: ['challenge-group-checkins', challengeId ?? 'none'],
    enabled: !!challengeId,
    queryFn: async (): Promise<CheckinWithEntries[]> => {
      const { data, error } = await supabase
        .from('daily_checkins')
        .select('*, habit_entries(*)')
        .eq('challenge_id', challengeId!)
        .order('date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CheckinWithEntries[];
    },
  });
}

/** Letzte Aktivitäten der Gruppe: jüngste Check-in-Updates. */
export function useRecentActivity(challengeId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.recentActivity(challengeId ?? 'none'),
    enabled: !!challengeId,
    queryFn: async (): Promise<CheckinWithEntries[]> => {
      const { data, error } = await supabase
        .from('daily_checkins')
        .select('*, habit_entries(*)')
        .eq('challenge_id', challengeId!)
        .order('updated_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as unknown as CheckinWithEntries[];
    },
  });
}

// ---------------------------------------------------------------- Reminder
export function useSendReminder() {
  return useMutation({
    mutationFn: async (input: {
      recipientId: string;
      habitId: string;
      message?: string;
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('send_reminder', {
        p_recipient_id: input.recipientId,
        p_habit_id: input.habitId,
        ...(input.message ? { p_message: input.message } : {}),
      });
      // Supabase-Fehler sind keine Error-Instanzen – als echten Error mit
      // der Server-Meldung weiterwerfen, damit die UI den Grund zeigt.
      if (error) throw new Error(error.message);
      const notificationId = data as string;

      // Zustellung (Push/E-Mail) anstoßen – Fehler hier sind nicht kritisch,
      // die In-App-Benachrichtigung existiert bereits.
      supabase.functions
        .invoke('send-push', { body: { notification_id: notificationId } })
        .catch((err) => console.warn('Push-Zustellung fehlgeschlagen:', err));

      return notificationId;
    },
  });
}

// ---------------------------------------------------------------- Notifications
export function useNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.notifications(user?.id ?? 'anon'),
    enabled: !!user,
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUnreadCount(): number {
  const { data } = useNotifications();
  return (data ?? []).filter((n) => !n.read_at).length;
}

export function useMarkNotificationsRead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids?: string[]) => {
      const { error } = await supabase.rpc('mark_notifications_read', {
        p_ids: ids ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications(user?.id ?? 'anon'),
      });
    },
  });
}

/** Realtime: neue Benachrichtigungen sofort anzeigen. */
export function useNotificationsRealtime(onNew?: (n: NotificationRow) => void) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          queryClient.invalidateQueries({
            queryKey: queryKeys.notifications(user.id),
          });
          onNew?.(payload.new as NotificationRow);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // onNew bewusst nicht in den Deps – Callback-Identität ändert sich pro Render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, queryClient]);
}

/** Realtime: Gruppen-Check-ins live aktualisieren. */
export function useChallengeRealtime(challengeId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!challengeId) return;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['group-checkins', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['recent-activity', challengeId] });
      queryClient.invalidateQueries({
        queryKey: ['challenge-group-checkins', challengeId],
      });
    };
    const channel = supabase
      .channel(`challenge-${challengeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_checkins',
          filter: `challenge_id=eq.${challengeId}`,
        },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'habit_entries' },
        invalidate,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [challengeId, queryClient]);
}

// ---------------------------------------------------------------- Einstellungen
export function useNotificationPreferences() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.prefs(user?.id ?? 'anon'),
    enabled: !!user,
    queryFn: async (): Promise<NotificationPreferencesRow | null> => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateNotificationPreferences() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (update: Partial<NotificationPreferencesRow>) => {
      const { error } = await supabase
        .from('notification_preferences')
        .update(update)
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.prefs(user!.id) });
    },
  });
}

// ---------------------------------------------------------------- Admin
// Bewusst getrennt von Gruppen-Rollen: ein App-Admin sieht Gruppen,
// Mitgliedschaften, Challenges und Profile über alle Gruppen hinweg –
// aber nicht die privaten Check-ins, Notizen oder Push-Abos anderer
// Nutzer. Admin-Rechte werden ausschließlich manuell im SQL-Editor
// vergeben (siehe supabase/migrations/0005_admin.sql).

export interface AdminGroupOverview extends GroupRow {
  group_members: Array<
    Pick<GroupMemberRow, 'user_id' | 'role'> & {
      profiles: Pick<ProfileRow, 'display_name'>;
    }
  >;
  challenges: ChallengeRow[];
}

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

export function useAdminOverview() {
  return useQuery({
    queryKey: ['admin-overview'],
    queryFn: async (): Promise<AdminGroupOverview[]> => {
      const { data, error } = await supabase
        .from('groups')
        .select('*, group_members(user_id, role, profiles(display_name)), challenges(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AdminGroupOverview[];
    },
  });
}

export function useAdminUserCount() {
  return useQuery({
    queryKey: ['admin-user-count'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useAdminDeleteGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.from('groups').delete().eq('id', groupId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
      queryClient.invalidateQueries({ queryKey: ['admin-user-count'] });
    },
  });
}
