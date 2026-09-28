-- ============================================================
-- GymPact – 0011: Profil aus Google-Anmeldung übernehmen
--
-- Bei "Mit Google anmelden" liefert Supabase Name und Profilbild in
-- raw_user_meta_data (full_name/name, avatar_url/picture). Diese Werte
-- werden beim ersten Login ins Profil übernommen.
-- ============================================================

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
  insert into public.notification_preferences (user_id) values (new.id);
  return new;
end;
$$;
