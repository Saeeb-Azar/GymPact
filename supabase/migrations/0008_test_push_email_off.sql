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
