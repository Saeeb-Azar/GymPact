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
