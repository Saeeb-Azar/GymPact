-- ============================================================
-- GymPact – 0012: Körperdaten im Profil
--
-- Größe, Geburtsjahr und Geschlecht werden einmal erfasst (Onboarding
-- bzw. Einstellungen) und für den Bedarfsrechner wiederverwendet.
-- Das aktuelle Gewicht lebt weiterhin pro Tag in daily_logs.
-- ============================================================

alter table public.profiles
  add column if not exists height_cm integer
    check (height_cm is null or height_cm between 100 and 250),
  add column if not exists birth_year integer
    check (birth_year is null or birth_year between 1920 and 2020),
  add column if not exists sex text
    check (sex is null or sex in ('male', 'female'));
