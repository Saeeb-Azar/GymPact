-- ============================================================
-- GymPact – 0006: Persönliche Zielwerte je Gewohnheit
--
-- Das THEMA einer numerischen Gewohnheit (z. B. "Protein erreicht") ist
-- für die ganze Gruppe gleich, der ZIELWERT aber pro Person unterschied-
-- lich (die eine nimmt 180 g, der andere 160 g). habits.target_value
-- bleibt als Standard-/Vorschlagswert bestehen (den setzt der Owner beim
-- Anlegen der Challenge); jedes Mitglied kann ihn für sich überschreiben.
-- ============================================================

create table public.habit_targets (
  habit_id     uuid not null references public.habits (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  target_value numeric(10, 2) not null check (target_value > 0),
  updated_at   timestamptz not null default now(),
  primary key (habit_id, user_id)
);

create index idx_habit_targets_user on public.habit_targets (user_id);

alter table public.habit_targets enable row level security;

-- Nur numerische Gewohnheiten haben ein persönliches Ziel
create or replace function public.validate_habit_target()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.habits where id = new.habit_id and type = 'numeric'
  ) then
    raise exception 'Persönliche Ziele gibt es nur für numerische Gewohnheiten';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_habit_targets_validate
  before insert or update on public.habit_targets
  for each row execute function public.validate_habit_target();

create policy "habit_targets: nur eigene lesen"
  on public.habit_targets for select
  to authenticated
  using (user_id = auth.uid());

create policy "habit_targets: nur für Gewohnheiten der eigenen Gruppe setzen"
  on public.habit_targets for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.habits h
      where h.id = habit_id and public.can_access_challenge(h.challenge_id)
    )
  );

create policy "habit_targets: nur eigene ändern"
  on public.habit_targets for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "habit_targets: nur eigene löschen"
  on public.habit_targets for delete
  to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------------
-- compute_habit_entry_completed() ersetzen: nutzt jetzt das persönliche
-- Ziel des Check-in-Besitzers, fällt ohne eigenes Ziel auf den
-- Standardwert der Gewohnheit zurück.
-- ------------------------------------------------------------
create or replace function public.compute_habit_entry_completed()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  h record;
  v_checkin_user uuid;
  v_target numeric(10, 2);
begin
  select h1.type, h1.target_value, h1.challenge_id into h
  from public.habits h1 where h1.id = new.habit_id;

  if h is null then
    raise exception 'Gewohnheit nicht gefunden';
  end if;

  select dc.user_id into v_checkin_user
  from public.daily_checkins dc
  where dc.id = new.checkin_id and dc.challenge_id = h.challenge_id;

  if v_checkin_user is null then
    raise exception 'Gewohnheit gehört nicht zur Challenge des Check-ins';
  end if;

  if h.type = 'boolean' then
    new.value_numeric := null;
    new.completed := coalesce(new.value_boolean, false);
  else
    new.value_boolean := null;

    select target_value into v_target
    from public.habit_targets
    where habit_id = new.habit_id and user_id = v_checkin_user;

    if v_target is null then
      v_target := h.target_value; -- kein persönliches Ziel gesetzt → Standardwert
    end if;

    new.completed := coalesce(new.value_numeric, 0) >= v_target;
  end if;

  new.updated_at := now();
  return new;
end;
$$;
