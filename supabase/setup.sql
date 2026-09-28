-- ============================================================
-- GymPact – KOMPLETT-SETUP für ein NEUES Supabase-Projekt
--
-- Einmal komplett im Supabase SQL-Editor ausführen
-- (Dashboard → SQL Editor → New query → alles einfügen → Run).
-- Enthält alle Migrationen in der richtigen Reihenfolge.
--
-- Enthält alle Migrationen. Der ERSTE Nutzer, der sich danach in der App
-- registriert, wird automatisch Admin.
-- ============================================================

-- >>>>>>>>>>>>>>>>>>>> migrations/0001_schema.sql
-- ============================================================
-- GymPact – 0001: Basisschema
-- Tabellen, Constraints, Indizes und Trigger.
-- RLS-Policies folgen in 0002_rls.sql, RPC-Funktionen in 0003_functions.sql.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Hilfsfunktion: updated_at automatisch pflegen
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- profiles – 1:1 zu auth.users
-- ------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default ''
               check (char_length(display_name) <= 60),
  avatar_url   text,
  timezone     text not null default 'Europe/Berlin'
               check (char_length(timezone) <= 64),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- notification_preferences – 1:1 zu profiles
-- ------------------------------------------------------------
create table public.notification_preferences (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  in_app             boolean not null default true,
  push               boolean not null default true,
  email              boolean not null default false,
  quiet_hours_start  time not null default '22:00',
  quiet_hours_end    time not null default '07:00',
  auto_reminders     boolean not null default true,
  auto_reminder_time time not null default '18:00',
  updated_at         timestamptz not null default now()
);

create trigger trg_notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- Profil + Standard-Einstellungen automatisch bei Registrierung anlegen
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1))
  );
  insert into public.notification_preferences (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- groups
-- ------------------------------------------------------------
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique default upper(encode(gen_random_bytes(4), 'hex')),
  created_by  uuid not null references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- group_members
-- ------------------------------------------------------------
create table public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index idx_group_members_user on public.group_members (user_id);

-- ------------------------------------------------------------
-- challenges
-- ------------------------------------------------------------
create table public.challenges (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  start_date  date not null,
  end_date    date not null,
  status      text not null default 'active'
              check (status in ('draft', 'active', 'completed', 'archived')),
  created_by  uuid not null references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

-- Pro Gruppe höchstens eine aktive Challenge
create unique index idx_challenges_one_active_per_group
  on public.challenges (group_id)
  where status = 'active';

create index idx_challenges_group on public.challenges (group_id);

create trigger trg_challenges_updated_at
  before update on public.challenges
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- habits – konfigurierbare tägliche Gewohnheiten einer Challenge
-- ------------------------------------------------------------
create table public.habits (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  type         text not null check (type in ('boolean', 'numeric')),
  target_value numeric(10, 2),
  unit         text check (unit is null or char_length(unit) <= 20),
  sort_order   integer not null default 0,
  auto_remind  boolean not null default true,
  created_at   timestamptz not null default now(),
  -- boolesche Gewohnheiten haben keinen Zielwert, numerische brauchen einen > 0
  check (
    (type = 'boolean' and target_value is null)
    or (type = 'numeric' and target_value is not null and target_value > 0)
  )
);

create index idx_habits_challenge on public.habits (challenge_id, sort_order);

-- ------------------------------------------------------------
-- daily_checkins – ein Eintrag pro Nutzer, Challenge und Tag
-- ------------------------------------------------------------
create table public.daily_checkins (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  date         date not null,
  weight_kg    numeric(5, 2) check (weight_kg is null or (weight_kg >= 20 and weight_kg <= 400)),
  note         text not null default '' check (char_length(note) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- verhindert doppelte Check-ins für denselben Nutzer, dieselbe Challenge
  -- und dasselbe Datum
  unique (challenge_id, user_id, date)
);

create index idx_daily_checkins_user_date on public.daily_checkins (user_id, date);
create index idx_daily_checkins_challenge_date on public.daily_checkins (challenge_id, date);

create trigger trg_daily_checkins_updated_at
  before update on public.daily_checkins
  for each row execute function public.set_updated_at();

-- Serverseitige Validierung: Datum muss im Challenge-Zeitraum liegen,
-- die Challenge muss aktiv sein.
create or replace function public.validate_checkin()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  c record;
begin
  select start_date, end_date, status into c
  from public.challenges where id = new.challenge_id;

  if c is null then
    raise exception 'Challenge nicht gefunden';
  end if;
  if c.status <> 'active' then
    raise exception 'Die Challenge ist nicht aktiv';
  end if;
  if new.date < c.start_date or new.date > c.end_date then
    raise exception 'Das Datum liegt außerhalb des Challenge-Zeitraums';
  end if;
  return new;
end;
$$;

create trigger trg_daily_checkins_validate
  before insert or update on public.daily_checkins
  for each row execute function public.validate_checkin();

-- ------------------------------------------------------------
-- habit_entries – Werte je Gewohnheit und Check-in
-- ------------------------------------------------------------
create table public.habit_entries (
  id            uuid primary key default gen_random_uuid(),
  checkin_id    uuid not null references public.daily_checkins (id) on delete cascade,
  habit_id      uuid not null references public.habits (id) on delete cascade,
  value_boolean boolean,
  value_numeric numeric(10, 2) check (value_numeric is null or value_numeric >= 0),
  completed     boolean not null default false,
  updated_at    timestamptz not null default now(),
  unique (checkin_id, habit_id)
);

create index idx_habit_entries_habit on public.habit_entries (habit_id);

-- "completed" wird serverseitig aus Typ und Zielwert berechnet und ist damit
-- nicht vom Client manipulierbar.
create or replace function public.compute_habit_entry_completed()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  h record;
begin
  select h1.type, h1.target_value, h1.challenge_id into h
  from public.habits h1 where h1.id = new.habit_id;

  if h is null then
    raise exception 'Gewohnheit nicht gefunden';
  end if;

  -- Gewohnheit muss zur Challenge des Check-ins gehören
  if not exists (
    select 1 from public.daily_checkins dc
    where dc.id = new.checkin_id and dc.challenge_id = h.challenge_id
  ) then
    raise exception 'Gewohnheit gehört nicht zur Challenge des Check-ins';
  end if;

  if h.type = 'boolean' then
    new.value_numeric := null;
    new.completed := coalesce(new.value_boolean, false);
  else
    new.value_boolean := null;
    new.completed := coalesce(new.value_numeric, 0) >= h.target_value;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_habit_entries_compute
  before insert or update on public.habit_entries
  for each row execute function public.compute_habit_entry_completed();

-- ------------------------------------------------------------
-- reminders – manuelle Erinnerungen zwischen Gruppenmitgliedern
-- ------------------------------------------------------------
create table public.reminders (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups (id) on delete cascade,
  challenge_id  uuid not null references public.challenges (id) on delete cascade,
  sender_id     uuid not null references public.profiles (id) on delete cascade,
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  habit_id      uuid not null references public.habits (id) on delete cascade,
  reminder_date date not null,
  message       text check (message is null or char_length(message) <= 200),
  created_at    timestamptz not null default now(),
  check (sender_id <> recipient_id),
  -- Standard-Cooldown: höchstens eine Erinnerung pro Sender, Empfänger,
  -- Gewohnheit und Tag
  unique (sender_id, recipient_id, habit_id, reminder_date)
);

create index idx_reminders_recipient on public.reminders (recipient_id, created_at desc);
create index idx_reminders_sender_recent on public.reminders (sender_id, created_at desc);

-- ------------------------------------------------------------
-- notifications – In-App-Postfach (Quelle für Push/E-Mail-Versand)
-- ------------------------------------------------------------
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  type          text not null check (type in ('reminder', 'auto_reminder', 'group', 'system')),
  title         text not null check (char_length(title) <= 120),
  body          text not null default '' check (char_length(body) <= 500),
  data          jsonb not null default '{}'::jsonb,
  read_at       timestamptz,
  push_sent_at  timestamptz,
  email_sent_at timestamptz,
  created_at    timestamptz not null default now()
);

create index idx_notifications_user on public.notifications (user_id, created_at desc);
create index idx_notifications_unread on public.notifications (user_id) where read_at is null;

-- ------------------------------------------------------------
-- push_subscriptions – ein Web-Push-Abo pro Nutzer und Gerät
-- ------------------------------------------------------------
create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index idx_push_subscriptions_user on public.push_subscriptions (user_id);

-- ------------------------------------------------------------
-- Storage: Bucket für Avatare (öffentlich lesbar, Upload nur ins
-- eigene Verzeichnis – Policies in 0002_rls.sql)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- >>>>>>>>>>>>>>>>>>>> migrations/0002_rls.sql
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

-- >>>>>>>>>>>>>>>>>>>> migrations/0003_functions.sql
-- ============================================================
-- GymPact – 0003: RPC-Funktionen
-- Alle Funktionen sind SECURITY DEFINER und validieren serverseitig,
-- unabhängig von jeder Client-Validierung.
-- ============================================================

-- ------------------------------------------------------------
-- Lokales Datum eines Nutzers anhand seiner Profil-Zeitzone
-- ------------------------------------------------------------
create or replace function public.user_local_date(p_user_id uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone coalesce(
    (select timezone from public.profiles where id = p_user_id),
    'Europe/Berlin'
  ))::date;
$$;

-- Liegt die lokale Uhrzeit des Nutzers in seinen Ruhezeiten?
create or replace function public.in_quiet_hours(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  prefs record;
  local_time time;
begin
  select quiet_hours_start, quiet_hours_end into prefs
  from public.notification_preferences where user_id = p_user_id;

  if prefs is null then
    return false;
  end if;

  local_time := (now() at time zone coalesce(
    (select timezone from public.profiles where id = p_user_id),
    'Europe/Berlin'
  ))::time;

  if prefs.quiet_hours_start = prefs.quiet_hours_end then
    return false; -- keine Ruhezeit konfiguriert
  elsif prefs.quiet_hours_start < prefs.quiet_hours_end then
    return local_time >= prefs.quiet_hours_start and local_time < prefs.quiet_hours_end;
  else
    -- Zeitfenster über Mitternacht, z. B. 22:00 → 07:00
    return local_time >= prefs.quiet_hours_start or local_time < prefs.quiet_hours_end;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- create_group: Gruppe + Owner-Mitgliedschaft atomar anlegen
-- ------------------------------------------------------------
create or replace function public.create_group(p_name text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_group public.groups;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'Der Gruppenname muss zwischen 1 und 80 Zeichen lang sein';
  end if;

  insert into public.groups (name, created_by)
  values (v_name, auth.uid())
  returning * into v_group;

  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, auth.uid(), 'owner');

  return v_group;
end;
$$;

-- ------------------------------------------------------------
-- join_group: Beitritt über Einladungscode
-- ------------------------------------------------------------
create or replace function public.join_group(p_invite_code text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.groups;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet';
  end if;

  select * into v_group
  from public.groups
  where invite_code = upper(trim(coalesce(p_invite_code, '')));

  if v_group is null then
    raise exception 'Ungültiger Einladungscode';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;

  return v_group;
end;
$$;

-- ------------------------------------------------------------
-- regenerate_invite_code: neuer Code (nur Owner)
-- ------------------------------------------------------------
create or replace function public.regenerate_invite_code(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Nur der Owner kann den Einladungscode erneuern';
  end if;

  update public.groups
  set invite_code = upper(encode(gen_random_bytes(4), 'hex'))
  where id = p_group_id
  returning invite_code into v_code;

  return v_code;
end;
$$;

-- ------------------------------------------------------------
-- leave_group: Austritt inkl. Owner-Übergabe.
-- Verlässt der Owner die Gruppe, geht die Rolle an das dienstälteste
-- Mitglied. Ist niemand mehr übrig, wird die Gruppe gelöscht.
-- ------------------------------------------------------------
create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_next uuid;
begin
  select role into v_role
  from public.group_members
  where group_id = p_group_id and user_id = auth.uid();

  if v_role is null then
    raise exception 'Du bist kein Mitglied dieser Gruppe';
  end if;

  delete from public.group_members
  where group_id = p_group_id and user_id = auth.uid();

  if v_role = 'owner' then
    select user_id into v_next
    from public.group_members
    where group_id = p_group_id
    order by joined_at asc
    limit 1;

    if v_next is null then
      delete from public.groups where id = p_group_id;
    else
      update public.group_members
      set role = 'owner'
      where group_id = p_group_id and user_id = v_next;
    end if;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- send_reminder: freundliche Erinnerung an ein Gruppenmitglied.
-- Serverseitige Regeln:
--   * Sender und Empfänger müssen Mitglieder derselben Gruppe sein
--   * Challenge muss aktiv sein, heute im Zeitraum liegen
--   * Die Gewohnheit muss beim Empfänger heute noch offen sein
--   * Ruhezeiten und Benachrichtigungseinstellungen des Empfängers
--   * Cooldown: max. 1 Erinnerung pro Sender/Empfänger/Gewohnheit/Tag
--     (Unique Constraint) und max. 1 Erinnerung pro Sender/Empfänger
--     alle 10 Minuten (Burst-Schutz über alle Gewohnheiten hinweg)
-- Gibt die ID der erzeugten Notification zurück.
-- ------------------------------------------------------------
create or replace function public.send_reminder(
  p_recipient_id uuid,
  p_habit_id uuid,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid := auth.uid();
  v_habit record;
  v_challenge record;
  v_recipient_date date;
  v_sender_name text;
  v_notification_id uuid;
  v_message text := nullif(trim(coalesce(p_message, '')), '');
begin
  if v_sender is null then
    raise exception 'Nicht angemeldet';
  end if;
  if v_sender = p_recipient_id then
    raise exception 'Du kannst dich nicht selbst erinnern';
  end if;
  if v_message is not null and char_length(v_message) > 200 then
    raise exception 'Die Nachricht darf höchstens 200 Zeichen lang sein';
  end if;

  select h.id, h.name, h.challenge_id into v_habit
  from public.habits h where h.id = p_habit_id;
  if v_habit is null then
    raise exception 'Gewohnheit nicht gefunden';
  end if;

  select c.id, c.group_id, c.status, c.start_date, c.end_date into v_challenge
  from public.challenges c where c.id = v_habit.challenge_id;

  if v_challenge.status <> 'active' then
    raise exception 'Die Challenge ist nicht aktiv';
  end if;

  -- Beide müssen Mitglieder derselben Gruppe sein
  if not exists (
    select 1 from public.group_members
    where group_id = v_challenge.group_id and user_id = v_sender
  ) then
    raise exception 'Du bist kein Mitglied dieser Gruppe';
  end if;
  if not exists (
    select 1 from public.group_members
    where group_id = v_challenge.group_id and user_id = p_recipient_id
  ) then
    raise exception 'Die Person ist kein Mitglied dieser Gruppe';
  end if;

  v_recipient_date := public.user_local_date(p_recipient_id);
  if v_recipient_date < v_challenge.start_date or v_recipient_date > v_challenge.end_date then
    raise exception 'Die Challenge läuft heute nicht';
  end if;

  -- Gewohnheit muss beim Empfänger heute noch offen sein
  if exists (
    select 1
    from public.habit_entries he
    join public.daily_checkins dc on dc.id = he.checkin_id
    where dc.user_id = p_recipient_id
      and dc.challenge_id = v_challenge.id
      and dc.date = v_recipient_date
      and he.habit_id = p_habit_id
      and he.completed
  ) then
    raise exception 'Diese Gewohnheit ist heute bereits erledigt';
  end if;

  -- Ruhezeiten und Einstellungen des Empfängers respektieren
  if public.in_quiet_hours(p_recipient_id) then
    raise exception 'Ruhezeit: Die Person möchte gerade nicht gestört werden';
  end if;
  if exists (
    select 1 from public.notification_preferences
    where user_id = p_recipient_id
      and in_app = false and push = false and email = false
  ) then
    raise exception 'Die Person hat Benachrichtigungen deaktiviert';
  end if;

  -- Burst-Schutz: max. 1 Erinnerung pro Sender→Empfänger alle 10 Minuten
  if exists (
    select 1 from public.reminders
    where sender_id = v_sender
      and recipient_id = p_recipient_id
      and created_at > now() - interval '10 minutes'
  ) then
    raise exception 'Bitte warte kurz, bevor du erneut erinnerst';
  end if;

  begin
    insert into public.reminders (
      group_id, challenge_id, sender_id, recipient_id, habit_id,
      reminder_date, message
    )
    values (
      v_challenge.group_id, v_challenge.id, v_sender, p_recipient_id,
      p_habit_id, v_recipient_date, v_message
    );
  exception
    when unique_violation then
      raise exception 'Du hast heute bereits an diese Gewohnheit erinnert';
  end;

  select coalesce(nullif(display_name, ''), 'Jemand') into v_sender_name
  from public.profiles where id = v_sender;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_recipient_id,
    'reminder',
    v_sender_name || ' erinnert dich',
    coalesce(
      v_message,
      v_sender_name || ' erinnert dich an dein heutiges Ziel: ' || v_habit.name
    ),
    jsonb_build_object(
      'habit_id', p_habit_id,
      'habit_name', v_habit.name,
      'challenge_id', v_challenge.id,
      'sender_id', v_sender,
      'date', v_recipient_date,
      'url', '/today'
    )
  )
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;

-- ------------------------------------------------------------
-- mark_notifications_read: alle oder einzelne als gelesen markieren
-- ------------------------------------------------------------
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null
    and (p_ids is null or id = any (p_ids));
$$;

-- ------------------------------------------------------------
-- Rechte: anon darf keine der RPCs aufrufen
-- ------------------------------------------------------------
revoke execute on function public.user_local_date(uuid) from anon;
revoke execute on function public.in_quiet_hours(uuid) from anon;
revoke execute on function public.create_group(text) from anon;
revoke execute on function public.join_group(text) from anon;
revoke execute on function public.regenerate_invite_code(uuid) from anon;
revoke execute on function public.leave_group(uuid) from anon;
revoke execute on function public.send_reminder(uuid, uuid, text) from anon;
revoke execute on function public.mark_notifications_read(uuid[]) from anon;

-- >>>>>>>>>>>>>>>>>>>> migrations/0004_realtime.sql
-- ============================================================
-- GymPact – 0004: Realtime
-- Tabellen für Supabase Realtime (postgres_changes) freigeben.
-- RLS gilt auch für Realtime-Events – Nutzer erhalten nur Änderungen,
-- die sie laut Policies lesen dürfen.
-- ============================================================

alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.daily_checkins;
alter publication supabase_realtime add table public.habit_entries;

-- >>>>>>>>>>>>>>>>>>>> migrations/0005_admin.sql
-- ============================================================
-- GymPact – 0005: App-weiter Admin-Zugang
-- Bewusst getrennt von den Gruppen-Rollen (owner/member): ein Admin
-- ist ein Nutzer, der die gesamte App verwalten kann, unabhängig davon,
-- in welchen Gruppen er selbst Mitglied ist.
--
-- Admins werden NICHT über eine RPC vergeben, sondern ausschließlich
-- manuell im SQL-Editor (siehe README) – so gibt es keinen Codepfad in
-- der App, über den sich jemand selbst zum Admin machen könnte.
--
-- Umfang bewusst eingeschränkt: Admins sehen Gruppen, Mitgliedschaften,
-- Challenges, Gewohnheiten und Profile – NICHT die privaten Check-ins,
-- Notizen, Erinnerungen, Benachrichtigungen oder Push-Abos anderer
-- Nutzer. GymPact bleibt eine private App, kein Überwachungstool.
-- ============================================================

create table public.app_admins (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  granted_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_admins where user_id = auth.uid()
  );
$$;

revoke execute on function public.is_app_admin() from anon;

-- Nur Admins dürfen die Admin-Liste selbst einsehen. Es gibt bewusst
-- keine Insert/Update/Delete-Policy: Admin-Rechte werden ausschließlich
-- manuell im SQL-Editor vergeben oder entzogen.
create policy "app_admins: nur Admins lesen"
  on public.app_admins for select
  to authenticated
  using (public.is_app_admin());

-- ------------------------------------------------------------
-- Zusätzliche, rein lesende (bzw. bei Gruppen auch löschende)
-- Policies für Admins. RLS-Policies sind additiv (OR-verknüpft) –
-- bestehende Policies für normale Nutzer bleiben unverändert.
-- ------------------------------------------------------------

create policy "profiles: Admins lesen alle"
  on public.profiles for select
  to authenticated
  using (public.is_app_admin());

create policy "groups: Admins lesen alle"
  on public.groups for select
  to authenticated
  using (public.is_app_admin());

create policy "groups: Admins löschen (Moderation)"
  on public.groups for delete
  to authenticated
  using (public.is_app_admin());

create policy "group_members: Admins lesen alle"
  on public.group_members for select
  to authenticated
  using (public.is_app_admin());

create policy "challenges: Admins lesen alle"
  on public.challenges for select
  to authenticated
  using (public.is_app_admin());

create policy "habits: Admins lesen alle"
  on public.habits for select
  to authenticated
  using (public.is_app_admin());

-- >>>>>>>>>>>>>>>>>>>> migrations/0006_habit_targets.sql
-- ============================================================
-- GymPact – 0006: Persönliche Zielwerte je Gewohnheit
--
-- Das THEMA einer numerischen Gewohnheit (z. B. "Protein erreicht") ist
-- für die ganze Gruppe gleich, der ZIELWERT aber pro Person unterschied-
-- lich (die eine nimmt 180 g, der andere 160 g). habits.target_value
-- bleibt als Standard-/Vorschlagswert bestehen (den setzt der Owner beim
-- Anlegen der Challenge); jedes Mitglied kann ihn für sich überschreiben.
-- ============================================================

create table public.habit_targets (
  habit_id     uuid not null references public.habits (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  target_value numeric(10, 2) not null check (target_value > 0),
  updated_at   timestamptz not null default now(),
  primary key (habit_id, user_id)
);

create index idx_habit_targets_user on public.habit_targets (user_id);

alter table public.habit_targets enable row level security;

-- Nur numerische Gewohnheiten haben ein persönliches Ziel
create or replace function public.validate_habit_target()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.habits where id = new.habit_id and type = 'numeric'
  ) then
    raise exception 'Persönliche Ziele gibt es nur für numerische Gewohnheiten';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_habit_targets_validate
  before insert or update on public.habit_targets
  for each row execute function public.validate_habit_target();

create policy "habit_targets: nur eigene lesen"
  on public.habit_targets for select
  to authenticated
  using (user_id = auth.uid());

create policy "habit_targets: nur für Gewohnheiten der eigenen Gruppe setzen"
  on public.habit_targets for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.habits h
      where h.id = habit_id and public.can_access_challenge(h.challenge_id)
    )
  );

create policy "habit_targets: nur eigene ändern"
  on public.habit_targets for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "habit_targets: nur eigene löschen"
  on public.habit_targets for delete
  to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------------
-- compute_habit_entry_completed() ersetzen: nutzt jetzt das persönliche
-- Ziel des Check-in-Besitzers, fällt ohne eigenes Ziel auf den
-- Standardwert der Gewohnheit zurück.
-- ------------------------------------------------------------
create or replace function public.compute_habit_entry_completed()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  h record;
  v_checkin_user uuid;
  v_target numeric(10, 2);
begin
  select h1.type, h1.target_value, h1.challenge_id into h
  from public.habits h1 where h1.id = new.habit_id;

  if h is null then
    raise exception 'Gewohnheit nicht gefunden';
  end if;

  select dc.user_id into v_checkin_user
  from public.daily_checkins dc
  where dc.id = new.checkin_id and dc.challenge_id = h.challenge_id;

  if v_checkin_user is null then
    raise exception 'Gewohnheit gehört nicht zur Challenge des Check-ins';
  end if;

  if h.type = 'boolean' then
    new.value_numeric := null;
    new.completed := coalesce(new.value_boolean, false);
  else
    new.value_boolean := null;

    select target_value into v_target
    from public.habit_targets
    where habit_id = new.habit_id and user_id = v_checkin_user;

    if v_target is null then
      v_target := h.target_value; -- kein persönliches Ziel gesetzt → Standardwert
    end if;

    new.completed := coalesce(new.value_numeric, 0) >= v_target;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- >>>>>>>>>>>>>>>>>>>> migrations/0007_group_targets_email.sql
-- ============================================================
-- GymPact – 0007: Gruppen-Transparenz & E-Mail als Standard
--
-- 1) Persönliche Zielwerte (habit_targets) sind jetzt für alle
--    Mitglieder derselben Gruppe lesbar. Damit kann die Gruppen-
--    übersicht echte Werte zeigen, z. B. "Protein: 35 / 180 g".
--    Schreiben kann weiterhin nur der Besitzer selbst.
--
-- 2) E-Mail-Benachrichtigungen sind ab jetzt standardmäßig AN
--    (neue und bestehende Nutzer). Der Versand selbst passiert in
--    der Edge Function send-push (Secret BREVO_API_KEY oder
--    RESEND_API_KEY nötig, siehe README).
-- ============================================================

-- 1) Zielwerte für Gruppenmitglieder lesbar machen
create policy "habit_targets: Gruppenmitglieder lesen"
  on public.habit_targets for select
  to authenticated
  using (
    exists (
      select 1 from public.habits h
      where h.id = habit_id and public.can_access_challenge(h.challenge_id)
    )
  );

-- 2) E-Mail-Kanal standardmäßig aktivieren
alter table public.notification_preferences
  alter column email set default true;

update public.notification_preferences set email = true;

-- >>>>>>>>>>>>>>>>>>>> migrations/0008_test_push_email_off.sql
-- ============================================================
-- GymPact – 0008: Push-Diagnose & E-Mail wieder Opt-in
--
-- 1) RPC send_test_notification(): erzeugt eine Test-Benachrichtigung
--    an sich selbst. Zusammen mit der Edge Function send-push ergibt
--    das den "Test-Push senden"-Button in den Einstellungen – er zeigt
--    sofort, ob ein Gerät registriert ist und die Zustellung klappt.
--
-- 2) E-Mail-Kanal wieder standardmäßig AUS (Team-Entscheidung:
--    Fokus auf Web Push). Wer mag, kann ihn in den Einstellungen
--    weiterhin einzeln aktivieren.
-- ============================================================

-- 1) Test-Benachrichtigung an sich selbst
create or replace function public.send_test_notification()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet';
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    auth.uid(),
    'system',
    'Test-Benachrichtigung',
    'Wenn du das auf deinem Gerät siehst, funktioniert Push! 🎉',
    jsonb_build_object('url', '/settings', 'test', true)
  )
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;

revoke execute on function public.send_test_notification() from anon;

-- 2) E-Mail wieder Opt-in
alter table public.notification_preferences
  alter column email set default false;

update public.notification_preferences set email = false;

-- >>>>>>>>>>>>>>>>>>>> migrations/0009_tracker.sql
-- ============================================================
-- GymPact – 0009: Neuausrichtung zum persönlichen Tracker
--
-- GymPact dreht sich nicht mehr um Gruppen-Challenges, sondern um den
-- eigenen Fortschritt:
--   * Ernährung: Lebensmittel-Bibliothek, Einträge je Mahlzeit,
--     Tagesziele (kcal + Makros), Wasser und Körpergewicht.
--   * Training: Trainingsplan in Wochen → Einheiten → Übungen → Sätze.
--
-- Die alten Challenge-Tabellen bleiben unangetastet (keine Daten gehen
-- verloren), werden von der App aber nicht mehr verwendet.
--
-- Sicherheitsmodell wie bisher: RLS auf jeder Tabelle, jeder Nutzer
-- liest und schreibt ausschließlich seine eigenen Daten. Einzige
-- Ausnahme ist die Lebensmittel-Bibliothek (`foods`): Sie ist für alle
-- angemeldeten Nutzer lesbar, damit man angelegte Lebensmittel nicht
-- doppelt pflegen muss – ändern/löschen darf nur, wer sie angelegt hat.
-- ============================================================

-- ------------------------------------------------------------
-- Ernährungsziele – 1:1 zu profiles
-- ------------------------------------------------------------
create table if not exists public.nutrition_goals (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  calories   integer not null default 2500 check (calories between 500 and 10000),
  protein_g  integer not null default 160 check (protein_g between 0 and 1000),
  carbs_g    integer not null default 280 check (carbs_g between 0 and 2000),
  fat_g      integer not null default 80 check (fat_g between 0 and 1000),
  water_ml   integer not null default 3000 check (water_ml between 0 and 20000),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_nutrition_goals_updated_at on public.nutrition_goals;
create trigger trg_nutrition_goals_updated_at
  before update on public.nutrition_goals
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Lebensmittel-Bibliothek (Nährwerte je 100 g bzw. 100 ml)
-- ------------------------------------------------------------
create table if not exists public.foods (
  id                uuid primary key default gen_random_uuid(),
  created_by        uuid not null references public.profiles (id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 120),
  brand             text not null default '' check (char_length(brand) <= 80),
  kcal_100          numeric(7, 2) not null check (kcal_100 between 0 and 1000),
  protein_100       numeric(6, 2) not null default 0 check (protein_100 between 0 and 100),
  carbs_100         numeric(6, 2) not null default 0 check (carbs_100 between 0 and 100),
  fat_100           numeric(6, 2) not null default 0 check (fat_100 between 0 and 100),
  default_amount_g  numeric(7, 1) not null default 100 check (default_amount_g > 0 and default_amount_g <= 5000),
  barcode           text check (char_length(barcode) <= 32),
  created_at        timestamptz not null default now()
);

create index if not exists idx_foods_name on public.foods (lower(name));

-- ------------------------------------------------------------
-- Ernährungseinträge: absolute Werte, damit auch Schnell-Einträge
-- ohne Lebensmittel möglich sind und spätere Änderungen an einem
-- Lebensmittel alte Tage nicht rückwirkend verändern.
-- ------------------------------------------------------------
create table if not exists public.food_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  date       date not null,
  meal       text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  food_id    uuid references public.foods (id) on delete set null,
  name       text not null check (char_length(name) between 1 and 120),
  amount_g   numeric(7, 1) check (amount_g is null or (amount_g > 0 and amount_g <= 5000)),
  kcal       numeric(7, 1) not null check (kcal between 0 and 20000),
  protein_g  numeric(6, 1) not null default 0 check (protein_g between 0 and 2000),
  carbs_g    numeric(6, 1) not null default 0 check (carbs_g between 0 and 2000),
  fat_g      numeric(6, 1) not null default 0 check (fat_g between 0 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists idx_food_entries_user_date on public.food_entries (user_id, date);

-- ------------------------------------------------------------
-- Tageswerte: Wasser, Körpergewicht, Notiz
-- ------------------------------------------------------------
create table if not exists public.daily_logs (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  date           date not null,
  water_ml       integer not null default 0 check (water_ml between 0 and 20000),
  body_weight_kg numeric(5, 2) check (body_weight_kg is null or body_weight_kg between 20 and 400),
  note           text not null default '' check (char_length(note) <= 1000),
  updated_at     timestamptz not null default now(),
  primary key (user_id, date)
);

drop trigger if exists trg_daily_logs_updated_at on public.daily_logs;
create trigger trg_daily_logs_updated_at
  before update on public.daily_logs
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Training: Woche → Einheit → Übung → Satz
-- user_id wird auf jeder Ebene mitgeführt, damit RLS ohne Joins
-- auskommt; ein Trigger stellt sicher, dass er zum Elternteil passt.
-- ------------------------------------------------------------
create table if not exists public.training_weeks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  title      text not null default '' check (char_length(title) <= 80),
  notes      text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table if not exists public.workouts (
  id          uuid primary key default gen_random_uuid(),
  week_id     uuid not null references public.training_weeks (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  day_of_week smallint check (day_of_week between 1 and 7),
  position    integer not null default 0,
  notes       text not null default '' check (char_length(notes) <= 2000),
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_workouts_week on public.workouts (week_id, position);

create table if not exists public.workout_exercises (
  id         uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  -- Muskelgruppe für das 3D-Körpermodell (null = automatisch aus dem Namen erkannt)
  muscle_group text check (muscle_group in (
    'chest', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs',
    'back', 'traps', 'glutes', 'quads', 'hamstrings', 'calves'
  )),
  position   integer not null default 0,
  notes      text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists idx_workout_exercises_workout on public.workout_exercises (workout_id, position);
create index if not exists idx_workout_exercises_user_name on public.workout_exercises (user_id, lower(name));

create table if not exists public.exercise_sets (
  id          uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  position    integer not null default 0,
  weight_kg   numeric(6, 2) not null default 0 check (weight_kg between 0 and 1000),
  reps        integer not null default 0 check (reps between 0 and 1000),
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_exercise_sets_exercise on public.exercise_sets (exercise_id, position);

-- Konsistenz: user_id des Kindes muss dem des Elternteils entsprechen.
create or replace function public.enforce_training_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if tg_table_name = 'workouts' then
    select user_id into v_owner from public.training_weeks where id = new.week_id;
  elsif tg_table_name = 'workout_exercises' then
    select user_id into v_owner from public.workouts where id = new.workout_id;
  elsif tg_table_name = 'exercise_sets' then
    select user_id into v_owner from public.workout_exercises where id = new.exercise_id;
  end if;

  if v_owner is null or v_owner <> new.user_id then
    raise exception 'Ungültige Zuordnung';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_workouts_owner on public.workouts;
create trigger trg_workouts_owner
  before insert or update on public.workouts
  for each row execute function public.enforce_training_owner();

drop trigger if exists trg_workout_exercises_owner on public.workout_exercises;
create trigger trg_workout_exercises_owner
  before insert or update on public.workout_exercises
  for each row execute function public.enforce_training_owner();

drop trigger if exists trg_exercise_sets_owner on public.exercise_sets;
create trigger trg_exercise_sets_owner
  before insert or update on public.exercise_sets
  for each row execute function public.enforce_training_owner();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.nutrition_goals   enable row level security;
alter table public.foods             enable row level security;
alter table public.food_entries      enable row level security;
alter table public.daily_logs        enable row level security;
alter table public.training_weeks    enable row level security;
alter table public.workouts          enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.exercise_sets     enable row level security;

-- Eigene Daten: voller Zugriff, fremde: keiner.
do $$
declare
  t text;
begin
  foreach t in array array[
    'nutrition_goals', 'food_entries', 'daily_logs', 'training_weeks',
    'workouts', 'workout_exercises', 'exercise_sets'
  ]
  loop
    execute format('drop policy if exists "%1$s: nur eigene" on public.%1$I', t);
    execute format(
      'create policy "%1$s: nur eigene" on public.%1$I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
  end loop;
end;
$$;

drop policy if exists "foods: alle Angemeldeten lesen" on public.foods;
create policy "foods: alle Angemeldeten lesen"
  on public.foods for select to authenticated using (true);

drop policy if exists "foods: selbst anlegen" on public.foods;
create policy "foods: selbst anlegen"
  on public.foods for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "foods: eigene ändern" on public.foods;
create policy "foods: eigene ändern"
  on public.foods for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "foods: eigene löschen" on public.foods;
create policy "foods: eigene löschen"
  on public.foods for delete to authenticated using (created_by = auth.uid());

-- ------------------------------------------------------------
-- RPC: Trainingswoche kopieren (inkl. Einheiten, Übungen, Sätze).
-- SECURITY INVOKER → RLS gilt; man kann nur eigene Wochen kopieren.
-- Gewicht/Wiederholungen werden als Startwerte übernommen, "erledigt"
-- wird zurückgesetzt.
-- ------------------------------------------------------------
create or replace function public.copy_training_week(p_source_week uuid, p_target_start date)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_source public.training_weeks;
  w record;
  e record;
  v_new_workout uuid;
  v_new_exercise uuid;
begin
  if v_uid is null then
    raise exception 'Nicht angemeldet';
  end if;

  select * into v_source from public.training_weeks
   where id = p_source_week and user_id = v_uid;
  if not found then
    raise exception 'Quellwoche nicht gefunden';
  end if;

  insert into public.training_weeks (user_id, week_start, title, notes)
  values (v_uid, p_target_start, v_source.title, '')
  on conflict (user_id, week_start) do update set title = excluded.title
  returning id into v_target;

  for w in
    select * from public.workouts where week_id = v_source.id order by position, created_at
  loop
    insert into public.workouts (week_id, user_id, name, day_of_week, position, notes)
    values (v_target, v_uid, w.name, w.day_of_week, w.position, w.notes)
    returning id into v_new_workout;

    for e in
      select * from public.workout_exercises where workout_id = w.id order by position, created_at
    loop
      insert into public.workout_exercises (workout_id, user_id, name, muscle_group, position, notes)
      values (v_new_workout, v_uid, e.name, e.muscle_group, e.position, e.notes)
      returning id into v_new_exercise;

      insert into public.exercise_sets (exercise_id, user_id, position, weight_kg, reps, done)
      select v_new_exercise, v_uid, s.position, s.weight_kg, s.reps, false
        from public.exercise_sets s
       where s.exercise_id = e.id
       order by s.position, s.created_at;
    end loop;
  end loop;

  return v_target;
end;
$$;

revoke execute on function public.copy_training_week(uuid, date) from anon;

-- ------------------------------------------------------------
-- Admin: Übersicht aller Nutzer mit Aktivitäts-Kennzahlen.
-- Nur Zählwerte – keine Inhalte (Essen, Gewicht, Notizen) anderer.
-- ------------------------------------------------------------
create or replace function public.admin_user_overview()
returns table (
  user_id        uuid,
  display_name   text,
  avatar_url     text,
  created_at     timestamptz,
  is_admin       boolean,
  food_days      bigint,
  food_entries   bigint,
  workouts_done  bigint,
  training_weeks bigint,
  last_activity  timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Nur für Admins';
  end if;

  return query
  select
    p.id,
    p.display_name,
    p.avatar_url,
    p.created_at,
    exists (select 1 from public.app_admins a where a.user_id = p.id),
    (select count(distinct fe.date) from public.food_entries fe where fe.user_id = p.id),
    (select count(*) from public.food_entries fe where fe.user_id = p.id),
    (select count(*) from public.workouts wo where wo.user_id = p.id and wo.done_at is not null),
    (select count(*) from public.training_weeks tw where tw.user_id = p.id),
    greatest(
      (select max(fe.created_at) from public.food_entries fe where fe.user_id = p.id),
      (select max(es.created_at) from public.exercise_sets es where es.user_id = p.id),
      (select max(wo.done_at) from public.workouts wo where wo.user_id = p.id)
    )
  from public.profiles p
  order by p.created_at;
end;
$$;

revoke execute on function public.admin_user_overview() from anon;

-- ------------------------------------------------------------
-- Alte Challenge-Erinnerungen abschalten (falls der Cron-Job aus dem
-- README eingerichtet wurde). Schlägt still fehl, wenn pg_cron oder
-- der Job nicht existiert.
-- ------------------------------------------------------------
do $$
begin
  perform cron.unschedule('gympact-auto-reminders');
exception when others then
  null;
end;
$$;

-- >>>>>>>>>>>>>>>>>>>> migrations/0010_first_admin.sql
-- ============================================================
-- GymPact – 0010: Erster Nutzer wird automatisch Admin
--
-- Gibt es noch keinen einzigen Admin, bekommt das erste neu angelegte
-- Profil Admin-Rechte. Sobald ein Admin existiert, passiert nichts mehr –
-- weitere Nutzer (z. B. Familie, Freunde) bleiben normale Nutzer.
-- ============================================================

create or replace function public.make_first_user_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.app_admins) then
    insert into public.app_admins (user_id) values (new.id)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.make_first_user_admin() from anon, authenticated;

drop trigger if exists trg_first_user_admin on public.profiles;
create trigger trg_first_user_admin
  after insert on public.profiles
  for each row execute function public.make_first_user_admin();

-- Merken, welche Migrationen angewendet sind (für automatische Updates)
create schema if not exists gympact_meta;
revoke all on schema gympact_meta from public;
create table if not exists gympact_meta.migrations (name text primary key, applied_at timestamptz not null default now());
insert into gympact_meta.migrations (name) values
  ('0001_schema.sql'),
  ('0002_rls.sql'),
  ('0003_functions.sql'),
  ('0004_realtime.sql'),
  ('0005_admin.sql'),
  ('0006_habit_targets.sql'),
  ('0007_group_targets_email.sql'),
  ('0008_test_push_email_off.sql'),
  ('0009_tracker.sql'),
  ('0010_first_admin.sql')
on conflict do nothing;
