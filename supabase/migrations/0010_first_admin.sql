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
