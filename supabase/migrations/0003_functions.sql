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
