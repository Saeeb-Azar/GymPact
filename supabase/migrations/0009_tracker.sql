-- ============================================================
-- GymPact – 0009: Neuausrichtung zum persönlichen Tracker
--
-- GymPact dreht sich nicht mehr um Gruppen-Challenges, sondern um den
-- eigenen Fortschritt:
--   * Ernährung: Lebensmittel-Bibliothek, Einträge je Mahlzeit,
--     Tagesziele (kcal + Makros), Wasser und Körpergewicht.
--   * Training: Trainingsplan in Wochen → Einheiten → Übungen → Sätze.
--
-- Die alten Challenge-Tabellen bleiben unangetastet (keine Daten gehen
-- verloren), werden von der App aber nicht mehr verwendet.
--
-- Sicherheitsmodell wie bisher: RLS auf jeder Tabelle, jeder Nutzer
-- liest und schreibt ausschließlich seine eigenen Daten. Einzige
-- Ausnahme ist die Lebensmittel-Bibliothek (`foods`): Sie ist für alle
-- angemeldeten Nutzer lesbar, damit man angelegte Lebensmittel nicht
-- doppelt pflegen muss – ändern/löschen darf nur, wer sie angelegt hat.
-- ============================================================

-- ------------------------------------------------------------
-- Ernährungsziele – 1:1 zu profiles
-- ------------------------------------------------------------
create table if not exists public.nutrition_goals (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  calories   integer not null default 2500 check (calories between 500 and 10000),
  protein_g  integer not null default 160 check (protein_g between 0 and 1000),
  carbs_g    integer not null default 280 check (carbs_g between 0 and 2000),
  fat_g      integer not null default 80 check (fat_g between 0 and 1000),
  water_ml   integer not null default 3000 check (water_ml between 0 and 20000),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_nutrition_goals_updated_at on public.nutrition_goals;
create trigger trg_nutrition_goals_updated_at
  before update on public.nutrition_goals
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Lebensmittel-Bibliothek (Nährwerte je 100 g bzw. 100 ml)
-- ------------------------------------------------------------
create table if not exists public.foods (
  id                uuid primary key default gen_random_uuid(),
  created_by        uuid not null references public.profiles (id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 120),
  brand             text not null default '' check (char_length(brand) <= 80),
  kcal_100          numeric(7, 2) not null check (kcal_100 between 0 and 1000),
  protein_100       numeric(6, 2) not null default 0 check (protein_100 between 0 and 100),
  carbs_100         numeric(6, 2) not null default 0 check (carbs_100 between 0 and 100),
  fat_100           numeric(6, 2) not null default 0 check (fat_100 between 0 and 100),
  default_amount_g  numeric(7, 1) not null default 100 check (default_amount_g > 0 and default_amount_g <= 5000),
  barcode           text check (char_length(barcode) <= 32),
  created_at        timestamptz not null default now()
);

create index if not exists idx_foods_name on public.foods (lower(name));

-- ------------------------------------------------------------
-- Ernährungseinträge: absolute Werte, damit auch Schnell-Einträge
-- ohne Lebensmittel möglich sind und spätere Änderungen an einem
-- Lebensmittel alte Tage nicht rückwirkend verändern.
-- ------------------------------------------------------------
create table if not exists public.food_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  date       date not null,
  meal       text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  food_id    uuid references public.foods (id) on delete set null,
  name       text not null check (char_length(name) between 1 and 120),
  amount_g   numeric(7, 1) check (amount_g is null or (amount_g > 0 and amount_g <= 5000)),
  kcal       numeric(7, 1) not null check (kcal between 0 and 20000),
  protein_g  numeric(6, 1) not null default 0 check (protein_g between 0 and 2000),
  carbs_g    numeric(6, 1) not null default 0 check (carbs_g between 0 and 2000),
  fat_g      numeric(6, 1) not null default 0 check (fat_g between 0 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists idx_food_entries_user_date on public.food_entries (user_id, date);

-- ------------------------------------------------------------
-- Tageswerte: Wasser, Körpergewicht, Notiz
-- ------------------------------------------------------------
create table if not exists public.daily_logs (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  date           date not null,
  water_ml       integer not null default 0 check (water_ml between 0 and 20000),
  body_weight_kg numeric(5, 2) check (body_weight_kg is null or body_weight_kg between 20 and 400),
  note           text not null default '' check (char_length(note) <= 1000),
  updated_at     timestamptz not null default now(),
  primary key (user_id, date)
);

drop trigger if exists trg_daily_logs_updated_at on public.daily_logs;
create trigger trg_daily_logs_updated_at
  before update on public.daily_logs
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Training: Woche → Einheit → Übung → Satz
-- user_id wird auf jeder Ebene mitgeführt, damit RLS ohne Joins
-- auskommt; ein Trigger stellt sicher, dass er zum Elternteil passt.
-- ------------------------------------------------------------
create table if not exists public.training_weeks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  title      text not null default '' check (char_length(title) <= 80),
  notes      text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table if not exists public.workouts (
  id          uuid primary key default gen_random_uuid(),
  week_id     uuid not null references public.training_weeks (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  day_of_week smallint check (day_of_week between 1 and 7),
  position    integer not null default 0,
  notes       text not null default '' check (char_length(notes) <= 2000),
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_workouts_week on public.workouts (week_id, position);

create table if not exists public.workout_exercises (
  id         uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  -- Muskelgruppe für das 3D-Körpermodell (null = automatisch aus dem Namen erkannt)
  muscle_group text check (muscle_group in (
    'chest', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs',
    'back', 'traps', 'glutes', 'quads', 'hamstrings', 'calves'
  )),
  position   integer not null default 0,
  notes      text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists idx_workout_exercises_workout on public.workout_exercises (workout_id, position);
create index if not exists idx_workout_exercises_user_name on public.workout_exercises (user_id, lower(name));

create table if not exists public.exercise_sets (
  id          uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  position    integer not null default 0,
  weight_kg   numeric(6, 2) not null default 0 check (weight_kg between 0 and 1000),
  reps        integer not null default 0 check (reps between 0 and 1000),
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_exercise_sets_exercise on public.exercise_sets (exercise_id, position);

-- Konsistenz: user_id des Kindes muss dem des Elternteils entsprechen.
create or replace function public.enforce_training_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if tg_table_name = 'workouts' then
    select user_id into v_owner from public.training_weeks where id = new.week_id;
  elsif tg_table_name = 'workout_exercises' then
    select user_id into v_owner from public.workouts where id = new.workout_id;
  elsif tg_table_name = 'exercise_sets' then
    select user_id into v_owner from public.workout_exercises where id = new.exercise_id;
  end if;

  if v_owner is null or v_owner <> new.user_id then
    raise exception 'Ungültige Zuordnung';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_workouts_owner on public.workouts;
create trigger trg_workouts_owner
  before insert or update on public.workouts
  for each row execute function public.enforce_training_owner();

drop trigger if exists trg_workout_exercises_owner on public.workout_exercises;
create trigger trg_workout_exercises_owner
  before insert or update on public.workout_exercises
  for each row execute function public.enforce_training_owner();

drop trigger if exists trg_exercise_sets_owner on public.exercise_sets;
create trigger trg_exercise_sets_owner
  before insert or update on public.exercise_sets
  for each row execute function public.enforce_training_owner();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.nutrition_goals   enable row level security;
alter table public.foods             enable row level security;
alter table public.food_entries      enable row level security;
alter table public.daily_logs        enable row level security;
alter table public.training_weeks    enable row level security;
alter table public.workouts          enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.exercise_sets     enable row level security;

-- Eigene Daten: voller Zugriff, fremde: keiner.
do $$
declare
  t text;
begin
  foreach t in array array[
    'nutrition_goals', 'food_entries', 'daily_logs', 'training_weeks',
    'workouts', 'workout_exercises', 'exercise_sets'
  ]
  loop
    execute format('drop policy if exists "%1$s: nur eigene" on public.%1$I', t);
    execute format(
      'create policy "%1$s: nur eigene" on public.%1$I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
  end loop;
end;
$$;

drop policy if exists "foods: alle Angemeldeten lesen" on public.foods;
create policy "foods: alle Angemeldeten lesen"
  on public.foods for select to authenticated using (true);

drop policy if exists "foods: selbst anlegen" on public.foods;
create policy "foods: selbst anlegen"
  on public.foods for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "foods: eigene ändern" on public.foods;
create policy "foods: eigene ändern"
  on public.foods for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "foods: eigene löschen" on public.foods;
create policy "foods: eigene löschen"
  on public.foods for delete to authenticated using (created_by = auth.uid());

-- ------------------------------------------------------------
-- RPC: Trainingswoche kopieren (inkl. Einheiten, Übungen, Sätze).
-- SECURITY INVOKER → RLS gilt; man kann nur eigene Wochen kopieren.
-- Gewicht/Wiederholungen werden als Startwerte übernommen, "erledigt"
-- wird zurückgesetzt.
-- ------------------------------------------------------------
create or replace function public.copy_training_week(p_source_week uuid, p_target_start date)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_source public.training_weeks;
  w record;
  e record;
  v_new_workout uuid;
  v_new_exercise uuid;
begin
  if v_uid is null then
    raise exception 'Nicht angemeldet';
  end if;

  select * into v_source from public.training_weeks
   where id = p_source_week and user_id = v_uid;
  if not found then
    raise exception 'Quellwoche nicht gefunden';
  end if;

  insert into public.training_weeks (user_id, week_start, title, notes)
  values (v_uid, p_target_start, v_source.title, '')
  on conflict (user_id, week_start) do update set title = excluded.title
  returning id into v_target;

  for w in
    select * from public.workouts where week_id = v_source.id order by position, created_at
  loop
    insert into public.workouts (week_id, user_id, name, day_of_week, position, notes)
    values (v_target, v_uid, w.name, w.day_of_week, w.position, w.notes)
    returning id into v_new_workout;

    for e in
      select * from public.workout_exercises where workout_id = w.id order by position, created_at
    loop
      insert into public.workout_exercises (workout_id, user_id, name, muscle_group, position, notes)
      values (v_new_workout, v_uid, e.name, e.muscle_group, e.position, e.notes)
      returning id into v_new_exercise;

      insert into public.exercise_sets (exercise_id, user_id, position, weight_kg, reps, done)
      select v_new_exercise, v_uid, s.position, s.weight_kg, s.reps, false
        from public.exercise_sets s
       where s.exercise_id = e.id
       order by s.position, s.created_at;
    end loop;
  end loop;

  return v_target;
end;
$$;

revoke execute on function public.copy_training_week(uuid, date) from anon;

-- ------------------------------------------------------------
-- Admin: Übersicht aller Nutzer mit Aktivitäts-Kennzahlen.
-- Nur Zählwerte – keine Inhalte (Essen, Gewicht, Notizen) anderer.
-- ------------------------------------------------------------
create or replace function public.admin_user_overview()
returns table (
  user_id        uuid,
  display_name   text,
  avatar_url     text,
  created_at     timestamptz,
  is_admin       boolean,
  food_days      bigint,
  food_entries   bigint,
  workouts_done  bigint,
  training_weeks bigint,
  last_activity  timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Nur für Admins';
  end if;

  return query
  select
    p.id,
    p.display_name,
    p.avatar_url,
    p.created_at,
    exists (select 1 from public.app_admins a where a.user_id = p.id),
    (select count(distinct fe.date) from public.food_entries fe where fe.user_id = p.id),
    (select count(*) from public.food_entries fe where fe.user_id = p.id),
    (select count(*) from public.workouts wo where wo.user_id = p.id and wo.done_at is not null),
    (select count(*) from public.training_weeks tw where tw.user_id = p.id),
    greatest(
      (select max(fe.created_at) from public.food_entries fe where fe.user_id = p.id),
      (select max(es.created_at) from public.exercise_sets es where es.user_id = p.id),
      (select max(wo.done_at) from public.workouts wo where wo.user_id = p.id)
    )
  from public.profiles p
  order by p.created_at;
end;
$$;

revoke execute on function public.admin_user_overview() from anon;

-- ------------------------------------------------------------
-- Alte Challenge-Erinnerungen abschalten (falls der Cron-Job aus dem
-- README eingerichtet wurde). Schlägt still fehl, wenn pg_cron oder
-- der Job nicht existiert.
-- ------------------------------------------------------------
do $$
begin
  perform cron.unschedule('gympact-auto-reminders');
exception when others then
  null;
end;
$$;
