-- ============================================================
-- GymPact – 0013: Altlasten der früheren Gruppen-App entfernen
--
-- GymPact war ursprünglich eine Gruppen-Challenge-App. Seit dem Neustart
-- als persönlicher Tracker sind diese Tabellen/Funktionen ungenutzt –
-- kein Code referenziert sie mehr, die Tabellen sind in diesem Projekt
-- leer (die App hat nie in sie geschrieben). Weg damit.
--
-- Behalten werden: profiles, app_admins (+ is_app_admin,
-- make_first_user_admin, handle_new_user, set_updated_at) und alle
-- Tracker-Tabellen (nutrition_*, foods, food_entries, daily_logs,
-- training_*, workouts, workout_exercises, exercise_sets).
-- ============================================================

-- 1) handle_new_user zuerst neu definieren: schrieb bisher auch in
--    notification_preferences – ohne diesen Schritt würde das Droppen
--    der Tabelle JEDE neue Registrierung brechen.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(
      nullif(trim(v_meta ->> 'display_name'), ''),
      nullif(trim(v_meta ->> 'full_name'), ''),
      nullif(trim(v_meta ->> 'name'), ''),
      split_part(new.email, '@', 1)
    ), 60),
    nullif(coalesce(v_meta ->> 'avatar_url', v_meta ->> 'picture'), '')
  );
  return new;
end;
$$;

-- 2) Profil-Leserecht neu: hing bisher an shares_group_with() –
--    ohne Gruppen liest jede*r nur das eigene Profil (Admins alles,
--    über die bestehende separate Admin-Policy).
drop policy if exists "profiles: eigenes Profil und Gruppenmitglieder lesen" on public.profiles;
drop policy if exists "profiles: eigenes Profil lesen" on public.profiles;
create policy "profiles: eigenes Profil lesen"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

-- 3) Alte Tabellen entfernen (cascade räumt Policies/Trigger/Indizes mit ab)
drop table if exists public.habit_targets cascade;
drop table if exists public.habit_entries cascade;
drop table if exists public.daily_checkins cascade;
drop table if exists public.habits cascade;
drop table if exists public.challenges cascade;
drop table if exists public.reminders cascade;
drop table if exists public.group_members cascade;
drop table if exists public.groups cascade;
drop table if exists public.push_subscriptions cascade;
drop table if exists public.notifications cascade;
drop table if exists public.notification_preferences cascade;

-- 4) Alte Funktionen entfernen – über pg_proc, damit die genauen
--    Signaturen keine Rolle spielen. cascade entfernt abhängige Reste.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'create_group', 'join_group', 'leave_group', 'regenerate_invite_code',
        'send_reminder', 'mark_notifications_read', 'send_test_notification',
        'is_group_member', 'is_group_owner', 'shares_group_with',
        'can_access_challenge', 'user_local_date', 'in_quiet_hours',
        'compute_habit_entry_completed', 'validate_checkin',
        'validate_habit_target', 'validate_reminder'
      )
  loop
    execute format('drop function if exists %s cascade', fn.sig);
  end loop;
end $$;
