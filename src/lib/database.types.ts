// Handgepflegte Typen für das Supabase-Schema (siehe supabase/migrations).
// Bei Schemaänderungen hier synchron halten – oder mit
// `supabase gen types typescript` neu generieren und angleichen.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type GroupRole = 'owner' | 'member';
export type ChallengeStatus = 'draft' | 'active' | 'completed' | 'archived';
export type HabitType = 'boolean' | 'numeric';
export type NotificationType = 'reminder' | 'auto_reminder' | 'group' | 'system';

export type ProfileRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export type GroupRow = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
}

export type GroupMemberRow = {
  group_id: string;
  user_id: string;
  role: GroupRole;
  joined_at: string;
}

export type ChallengeRow = {
  id: string;
  group_id: string;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  status: ChallengeStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type HabitRow = {
  id: string;
  challenge_id: string;
  name: string;
  type: HabitType;
  target_value: number | null;
  unit: string | null;
  sort_order: number;
  auto_remind: boolean;
  created_at: string;
}

export type HabitTargetRow = {
  habit_id: string;
  user_id: string;
  target_value: number;
  updated_at: string;
}

export type DailyCheckinRow = {
  id: string;
  challenge_id: string;
  user_id: string;
  date: string;
  weight_kg: number | null;
  note: string;
  created_at: string;
  updated_at: string;
}

export type HabitEntryRow = {
  id: string;
  checkin_id: string;
  habit_id: string;
  value_boolean: boolean | null;
  value_numeric: number | null;
  completed: boolean;
  updated_at: string;
}

export type ReminderRow = {
  id: string;
  group_id: string;
  challenge_id: string;
  sender_id: string;
  recipient_id: string;
  habit_id: string;
  reminder_date: string;
  message: string | null;
  created_at: string;
}

export type NotificationRow = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Json;
  read_at: string | null;
  push_sent_at: string | null;
  email_sent_at: string | null;
  created_at: string;
}

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
}

export type NotificationPreferencesRow = {
  user_id: string;
  in_app: boolean;
  push: boolean;
  email: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  auto_reminders: boolean;
  auto_reminder_time: string;
  updated_at: string;
}

export type AppAdminRow = {
  user_id: string;
  granted_at: string;
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & { id: string };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      groups: {
        Row: GroupRow;
        Insert: Partial<GroupRow> & { name: string; created_by: string };
        Update: Partial<GroupRow>;
        Relationships: [];
      };
      group_members: {
        Row: GroupMemberRow;
        Insert: Partial<GroupMemberRow> & { group_id: string; user_id: string };
        Update: Partial<GroupMemberRow>;
        Relationships: [];
      };
      challenges: {
        Row: ChallengeRow;
        Insert: {
          id?: string;
          group_id: string;
          name: string;
          description?: string;
          start_date: string;
          end_date: string;
          status?: ChallengeStatus;
          created_by: string;
        };
        Update: Partial<ChallengeRow>;
        Relationships: [];
      };
      habits: {
        Row: HabitRow;
        Insert: {
          id?: string;
          challenge_id: string;
          name: string;
          type: HabitType;
          target_value?: number | null;
          unit?: string | null;
          sort_order?: number;
          auto_remind?: boolean;
        };
        Update: Partial<HabitRow>;
        Relationships: [];
      };
      daily_checkins: {
        Row: DailyCheckinRow;
        Insert: {
          id?: string;
          challenge_id: string;
          user_id: string;
          date: string;
          weight_kg?: number | null;
          note?: string;
        };
        Update: Partial<DailyCheckinRow>;
        Relationships: [];
      };
      habit_entries: {
        Row: HabitEntryRow;
        Insert: {
          id?: string;
          checkin_id: string;
          habit_id: string;
          value_boolean?: boolean | null;
          value_numeric?: number | null;
        };
        Update: Partial<HabitEntryRow>;
        Relationships: [];
      };
      reminders: {
        Row: ReminderRow;
        Insert: never; // nur über RPC send_reminder
        Update: never;
        Relationships: [];
      };
      notifications: {
        Row: NotificationRow;
        Insert: never; // nur über RPCs / Edge Functions
        Update: Partial<Pick<NotificationRow, 'read_at'>>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: PushSubscriptionRow;
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
          last_seen_at?: string;
        };
        Update: Partial<PushSubscriptionRow>;
        Relationships: [];
      };
      notification_preferences: {
        Row: NotificationPreferencesRow;
        Insert: Partial<NotificationPreferencesRow> & { user_id: string };
        Update: Partial<NotificationPreferencesRow>;
        Relationships: [];
      };
      app_admins: {
        Row: AppAdminRow;
        Insert: never; // nur manuell im SQL-Editor
        Update: never;
        Relationships: [];
      };
      habit_targets: {
        Row: HabitTargetRow;
        Insert: {
          habit_id: string;
          user_id: string;
          target_value: number;
        };
        Update: Partial<Pick<HabitTargetRow, 'target_value'>>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_group: { Args: { p_name: string }; Returns: GroupRow };
      join_group: { Args: { p_invite_code: string }; Returns: GroupRow };
      leave_group: { Args: { p_group_id: string }; Returns: undefined };
      regenerate_invite_code: { Args: { p_group_id: string }; Returns: string };
      send_reminder: {
        Args: { p_recipient_id: string; p_habit_id: string; p_message?: string };
        Returns: string;
      };
      mark_notifications_read: {
        Args: { p_ids?: string[] | null };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
