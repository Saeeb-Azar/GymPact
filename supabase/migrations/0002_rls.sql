-- ============================================================
-- GymPact – 0002: Row Level Security
-- RLS ist für JEDE Tabelle aktiviert. Schreibzugriffe auf Gruppen,
-- Mitgliedschaften und Erinnerungen laufen ausschließlich über die
-- SECURITY-DEFINER-RPCs aus 0003_functions.sql.
-- ============================================================

-- ------------------------------------------------------------
-- Hilfsfunktionen (SECURITY DEFINER, um RLS-Rekursion auf
-- group_members zu vermeiden)
-- ------------------------------------------------------------
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_group_owner(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid() and role = 'owner'
  );
$$;

-- Teilen zwei Nutzer mindestens eine Gruppe?
create or replace function public.shares_group_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members me
    join public.group_members them on them.group_id = me.group_id
    where me.user_id = auth.uid() and them.user_id = p_user_id
  );
$$;

-- Darf der aktuelle Nutzer die Challenge sehen (= Gruppenmitglied)?
create or replace function public.can_access_challenge(p_challenge_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.challenges c
    join public.group_members gm on gm.group_id = c.group_id
    where c.id = p_challenge_id and gm.user_id = auth.uid()
  );
$$;

revoke execute on function public.is_group_member(uuid) from anon;
revoke execute on function public.is_group_owner(uuid) from anon;
revoke execute on function public.shares_group_with(uuid) from anon;
revoke execute on function public.can_access_challenge(uuid) from anon;

-- ------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles: eigenes Profil und Gruppenmitglieder lesen"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.shares_group_with(id));

create policy "profiles: nur eigenes Profil ändern"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Insert/Delete laufen über den auth-Trigger bzw. das Löschen des Accounts.

-- ------------------------------------------------------------
-- groups
-- ------------------------------------------------------------
alter table public.groups enable row level security;

create policy "groups: nur Mitglieder lesen"
  on public.groups for select
  to authenticated
  using (public.is_group_member(id));

create policy "groups: nur Owner ändern"
  on public.groups for update
  to authenticated
  using (public.is_group_owner(id))
  with check (public.is_group_owner(id));

create policy "groups: nur Owner löschen"
  on public.groups for delete
  to authenticated
  using (public.is_group_owner(id));

-- Insert nur über RPC create_group (SECURITY DEFINER), damit Gruppe und
-- Owner-Mitgliedschaft atomar entstehen.

-- ------------------------------------------------------------
-- group_members
-- ------------------------------------------------------------
alter table public.group_members enable row level security;

create policy "group_members: Mitglieder sehen Mitglieder ihrer Gruppen"
  on public.group_members for select
  to authenticated
  using (public.is_group_member(group_id));

create policy "group_members: selbst austreten (nicht als Owner)"
  on public.group_members for delete
  to authenticated
  using (user_id = auth.uid() and role <> 'owner');

-- Beitritt nur über RPC join_group; Owner-Austritt über RPC leave_group.

-- ------------------------------------------------------------
-- challenges
-- ------------------------------------------------------------
alter table public.challenges enable row level security;

create policy "challenges: Mitglieder lesen"
  on public.challenges for select
  to authenticated
  using (public.is_group_member(group_id));

create policy "challenges: Owner erstellt"
  on public.challenges for insert
  to authenticated
  with check (public.is_group_owner(group_id) and created_by = auth.uid());

create policy "challenges: Owner ändert"
  on public.challenges for update
  to authenticated
  using (public.is_group_owner(group_id))
  with check (public.is_group_owner(group_id));

create policy "challenges: Owner löscht"
  on public.challenges for delete
  to authenticated
  using (public.is_group_owner(group_id));

-- ------------------------------------------------------------
-- habits
-- ------------------------------------------------------------
alter table public.habits enable row level security;

create policy "habits: Mitglieder lesen"
  on public.habits for select
  to authenticated
  using (public.can_access_challenge(challenge_id));

create policy "habits: Owner erstellt"
  on public.habits for insert
  to authenticated
  with check (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_id and public.is_group_owner(c.group_id)
    )
  );

create policy "habits: Owner ändert"
  on public.habits for update
  to authenticated
  using (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_id and public.is_group_owner(c.group_id)
    )
  );

create policy "habits: Owner löscht"
  on public.habits for delete
  to authenticated
  using (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_id and public.is_group_owner(c.group_id)
    )
  );

-- ------------------------------------------------------------
-- daily_checkins
-- Mitglieder dürfen den Status anderer lesen, aber nur eigene
-- Einträge schreiben.
-- ------------------------------------------------------------
alter table public.daily_checkins enable row level security;

create policy "daily_checkins: Mitglieder lesen"
  on public.daily_checkins for select
  to authenticated
  using (user_id = auth.uid() or public.can_access_challenge(challenge_id));

create policy "daily_checkins: nur eigene erstellen"
  on public.daily_checkins for insert
  to authenticated
  with check (user_id = auth.uid() and public.can_access_challenge(challenge_id));

create policy "daily_checkins: nur eigene ändern"
  on public.daily_checkins for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "daily_checkins: nur eigene löschen"
  on public.daily_checkins for delete
  to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------------
-- habit_entries (Zugriff folgt dem zugehörigen Check-in)
-- ------------------------------------------------------------
alter table public.habit_entries enable row level security;

create policy "habit_entries: Mitglieder lesen"
  on public.habit_entries for select
  to authenticated
  using (
    exists (
      select 1 from public.daily_checkins dc
      where dc.id = checkin_id
        and (dc.user_id = auth.uid() or public.can_access_challenge(dc.challenge_id))
    )
  );

create policy "habit_entries: nur zum eigenen Check-in erstellen"
  on public.habit_entries for insert
  to authenticated
  with check (
    exists (
      select 1 from public.daily_checkins dc
      where dc.id = checkin_id and dc.user_id = auth.uid()
    )
  );

create policy "habit_entries: nur eigene ändern"
  on public.habit_entries for update
  to authenticated
  using (
    exists (
      select 1 from public.daily_checkins dc
      where dc.id = checkin_id and dc.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.daily_checkins dc
      where dc.id = checkin_id and dc.user_id = auth.uid()
    )
  );

create policy "habit_entries: nur eigene löschen"
  on public.habit_entries for delete
  to authenticated
  using (
    exists (
      select 1 from public.daily_checkins dc
      where dc.id = checkin_id and dc.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- reminders
-- Versand ausschließlich über RPC send_reminder (Validierung + Cooldown).
-- ------------------------------------------------------------
alter table public.reminders enable row level security;

create policy "reminders: Sender und Empfänger lesen"
  on public.reminders for select
  to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

-- ------------------------------------------------------------
-- notifications
-- Erzeugt nur durch RPCs/Edge Functions (service role).
-- ------------------------------------------------------------
alter table public.notifications enable row level security;

create policy "notifications: nur eigene lesen"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy "notifications: nur eigene ändern (gelesen markieren)"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "notifications: nur eigene löschen"
  on public.notifications for delete
  to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------------
-- push_subscriptions – Endpunkte und Schlüssel sind privat.
-- Nur der Besitzer (und die service role der Edge Functions) hat Zugriff.
-- ------------------------------------------------------------
alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: nur eigene lesen"
  on public.push_subscriptions for select
  to authenticated
  using (user_id = auth.uid());

create policy "push_subscriptions: nur eigene erstellen"
  on public.push_subscriptions for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "push_subscriptions: nur eigene ändern"
  on public.push_subscriptions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "push_subscriptions: nur eigene löschen"
  on public.push_subscriptions for delete
  to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------------
-- notification_preferences
-- ------------------------------------------------------------
alter table public.notification_preferences enable row level security;

create policy "notification_preferences: nur eigene lesen"
  on public.notification_preferences for select
  to authenticated
  using (user_id = auth.uid());

create policy "notification_preferences: nur eigene ändern"
  on public.notification_preferences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ------------------------------------------------------------
-- Storage-Policies für den Avatar-Bucket:
-- öffentlich lesbar, Schreibzugriff nur im eigenen Ordner <uid>/...
-- ------------------------------------------------------------
create policy "avatars: öffentlich lesbar"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars: Upload nur in eigenen Ordner"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars: eigene Dateien ersetzen"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars: eigene Dateien löschen"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
