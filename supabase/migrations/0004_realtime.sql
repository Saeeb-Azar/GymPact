-- ============================================================
-- GymPact – 0004: Realtime
-- Tabellen für Supabase Realtime (postgres_changes) freigeben.
-- RLS gilt auch für Realtime-Events – Nutzer erhalten nur Änderungen,
-- die sie laut Policies lesen dürfen.
-- ============================================================

alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.daily_checkins;
alter publication supabase_realtime add table public.habit_entries;
