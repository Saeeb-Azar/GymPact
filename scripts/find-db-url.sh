#!/usr/bin/env bash
# Ermittelt aus Projekt-Ref + Datenbank-Passwort eine funktionierende
# Verbindung über den Supabase-Session-Pooler (IPv4, von GitHub erreichbar).
# Probiert alle Regionen durch, da der Pooler-Host regional ist.
#
#   SUPABASE_DB_PASSWORD=... scripts/find-db-url.sh <projekt-ref>   → gibt die URL aus
set -euo pipefail
REF="${1:?Projekt-Ref fehlt}"
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD fehlt}"
PW=$(python3 -c 'import os,urllib.parse;print(urllib.parse.quote(os.environ["SUPABASE_DB_PASSWORD"], safe=""))')

REGIONS="eu-central-1 eu-central-2 eu-west-1 eu-west-2 eu-west-3 eu-north-1 us-east-1 us-east-2 us-west-1 us-west-2 ca-central-1 sa-east-1 ap-south-1 ap-southeast-1 ap-southeast-2 ap-northeast-1 ap-northeast-2"
for prefix in aws-0 aws-1; do
  for region in $REGIONS; do
    url="postgresql://postgres.${REF}:${PW}@${prefix}-${region}.pooler.supabase.com:5432/postgres?sslmode=require&connect_timeout=6"
    if out=$(psql "$url" -X -q -t -A -c "select 1" 2>&1); then
      echo "Pooler gefunden: ${prefix}-${region}" >&2
      echo "$url"
      exit 0
    fi
    case "$out" in
      *"password authentication failed"*)
        echo "Pooler ${prefix}-${region} gefunden, aber das Passwort ist falsch." >&2
        exit 2 ;;
    esac
  done
done
echo "Kein Pooler gefunden – bitte SUPABASE_DB_URL (Connect → Session pooler) als Secret setzen." >&2
exit 1
