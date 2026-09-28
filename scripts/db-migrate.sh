#!/usr/bin/env bash
# Spielt alle noch nicht angewendeten Migrationen aus supabase/migrations
# in die Supabase-Datenbank ein (idempotent, jede Migration in einer Transaktion).
#
#   SUPABASE_DB_URL="postgresql://postgres.<ref>:<passwort>@<pooler-host>:5432/postgres" \
#     scripts/db-migrate.sh
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL fehlt}"
cd "$(dirname "$0")/.."
PSQL=(psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -X -q -t -A)

"${PSQL[@]}" <<'SQL'
create schema if not exists gympact_meta;
revoke all on schema gympact_meta from public;
create table if not exists gympact_meta.migrations (
  name       text primary key,
  applied_at timestamptz not null default now()
);
SQL

# Wurde die DB schon von Hand (setup.sql) eingerichtet, die vorhandenen
# Migrationen als angewendet markieren statt sie erneut auszuführen.
count=$("${PSQL[@]}" -c "select count(*) from gympact_meta.migrations")
if [ "$count" = "0" ]; then
  has_base=$("${PSQL[@]}" -c "select to_regclass('public.profiles') is not null")
  has_tracker=$("${PSQL[@]}" -c "select to_regclass('public.food_entries') is not null")
  has_first_admin=$("${PSQL[@]}" -c "select exists (select 1 from pg_trigger where tgname = 'trg_first_user_admin')")
  has_oauth=$("${PSQL[@]}" -c "select exists (select 1 from pg_proc where proname = 'handle_new_user' and prosrc like '%full_name%')")
  for f in supabase/migrations/*.sql; do
    name=$(basename "$f")
    mark=false
    case "$name" in
      000[1-8]_*) [ "$has_base" = "t" ] && mark=true ;;
      0009_*) [ "$has_tracker" = "t" ] && mark=true ;;
      0010_*) [ "$has_first_admin" = "t" ] && mark=true ;;
      0011_*) [ "$has_oauth" = "t" ] && mark=true ;;
    esac
    if $mark; then
      "${PSQL[@]}" -c "insert into gympact_meta.migrations (name) values ('$name') on conflict do nothing"
      echo "✔ bereits vorhanden: $name"
    fi
  done
fi

for f in supabase/migrations/*.sql; do
  name=$(basename "$f")
  applied=$("${PSQL[@]}" -c "select exists (select 1 from gympact_meta.migrations where name = '$name')")
  if [ "$applied" = "t" ]; then
    continue
  fi
  echo "→ wende an: $name"
  { cat "$f"; echo; echo "insert into gympact_meta.migrations (name) values ('$name');"; } \
    | psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -X -q -1
done

# Optional: festgelegte Admin-E-Mail (sobald registriert) zum Admin machen
if [ -n "${ADMIN_EMAIL:-}" ]; then
  "${PSQL[@]}" -v email="$ADMIN_EMAIL" <<'SQL'
insert into public.app_admins (user_id)
select id from auth.users where lower(email) = lower(:'email')
on conflict (user_id) do nothing;
SQL
fi

echo "Datenbank ist aktuell."
