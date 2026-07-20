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
