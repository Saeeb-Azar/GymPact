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
