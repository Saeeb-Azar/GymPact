# GymPact

**GymPact** ist eine private, mobile-first Progressive Web App für Paare und
kleine Freundesgruppen: Während einer zeitlich begrenzten Fitness-Challenge
trackt jedes Mitglied seine täglichen Gewohnheiten und sieht den Fortschritt
der anderen. Freundliche, niemals anonyme Erinnerungen halten alle bei der
Stange – ganz ohne Social-Media-Lärm und aggressive Gamification.

Die erste Challenge läuft vom **20. Juli 2026 bis 15. Oktober 2026**;
beliebige Zeiträume werden unterstützt.

---

## Architektur

**Entscheidung: „Thin Client, sicherer Kern in der Datenbank“.**
Das React-Frontend spricht direkt mit Supabase (PostgREST, Auth, Realtime,
Storage). Es gibt bewusst keinen eigenen API-Server – die Korrektheits- und
Sicherheitsgarantien liegen in der Datenbank:

- **Row Level Security auf jeder Tabelle** ist die einzige Wahrheit über
  Zugriffsrechte. Der Client kann nichts erzwingen, was RLS nicht erlaubt.
- **Alles Heikle läuft über SECURITY-DEFINER-RPCs** (`create_group`,
  `join_group`, `leave_group`, `send_reminder`, …). Dort sitzen Validierung,
  Cooldowns, Ruhezeiten-Checks – unabhängig von jeder Client-Validierung.
- **Abgeleitete Werte werden serverseitig berechnet**: `habit_entries.completed`
  setzt ein Trigger aus Typ + Zielwert; Datums-/Statusregeln für Check-ins
  prüft ein Trigger (`validate_checkin`).
- **Edge Functions nur für Dinge, die die DB nicht kann**: Web-Push-Versand
  (VAPID-Private-Key!) und der Cron-Job für automatische Erinnerungen.
  Der Service-Role-Key existiert ausschließlich dort.
- **Frontend-State**: TanStack Query als Cache über PostgREST, Supabase
  Realtime invalidiert gezielt (neue Benachrichtigungen, Gruppen-Check-ins).
  Check-ins speichern sofort (Booleans) bzw. mit kurzem Debounce (Zahlen,
  Gewicht, Notiz) – klassisches Autosave mit Statusanzeige.

**Zeitzonen-Modell:** Die App rechnet konsequent mit *lokalen Kalenderdaten*
(`YYYY-MM-DD`) in der Profil-Zeitzone des Nutzers – nie mit UTC-Mitternacht.
Serverseitig liefert `user_local_date()` dasselbe Datum für RPC-Prüfungen.

## Ordnerstruktur

```
GymPact/
├── index.html                  # Shell, Theme-Bootstrapping, PWA-Meta
├── public/
│   ├── manifest.webmanifest    # PWA-Manifest
│   ├── sw.js                   # Service Worker: App-Shell-Cache + Web Push
│   └── icons/                  # generierte App-Icons (npm run icons)
├── scripts/
│   └── generate-icons.mjs      # PNG-Icon-Generator (ohne Abhängigkeiten)
├── src/
│   ├── main.tsx                # Einstieg: Provider, SW-Registrierung
│   ├── App.tsx                 # Routen (öffentlich/geschützt)
│   ├── index.css               # Tailwind + Basis-Styles (Safe-Areas, Fokus)
│   ├── context/
│   │   └── AuthProvider.tsx    # Supabase-Session als React-Context
│   ├── hooks/
│   │   ├── queries.ts          # ALLE Daten-Hooks (TanStack Query + Realtime)
│   │   ├── useCheckinManager.ts# Autosave-Logik des Tages-Check-ins
│   │   ├── useActiveGroup.ts   # aktive Gruppe (persistiert)
│   │   ├── useToday.ts         # "heute" in der Nutzer-Zeitzone
│   │   └── useTheme.ts         # Light/Dark/System
│   ├── lib/
│   │   ├── supabase.ts         # typisierter Client
│   │   ├── database.types.ts   # handgepflegte Schema-Typen
│   │   ├── dates.ts            # Kalenderdatum-Helfer (getestet)
│   │   ├── stats.ts            # Serien, Quoten, Kennzahlen (getestet)
│   │   ├── push.ts             # Push-Abo-Registrierung, iOS-Erkennung
│   │   └── validation.ts       # Zod-Schemata aller Formulare
│   ├── components/
│   │   ├── AppLayout.tsx       # Header + Bottom-Navigation
│   │   ├── RequireAuth.tsx     # Routen-Schutz
│   │   ├── icons.tsx           # Inline-SVG-Icons
│   │   ├── ui/                 # Button, Input, Toggle, Ring, Avatar, Toast …
│   │   ├── checkin/            # HabitRow, SaveStatus, PersonalTargetsForm
│   │   └── charts/             # LineChart, WeekBars, CalendarGrid (SVG)
│   └── pages/
│       ├── auth/               # Login, Registrierung, Passwort-Reset
│       ├── TodayPage.tsx       # Dashboard + Tages-Check-in
│       ├── GroupPage.tsx       # Gruppe, Einladungen, Erinnerungen
│       ├── NewChallengePage.tsx# Challenge- & Gewohnheiten-Builder
│       ├── ProgressPage.tsx    # Kalender, Diagramme, Kennzahlen
│       ├── NotificationsPage.tsx
│       ├── SettingsPage.tsx    # Profil, Darstellung, Benachrichtigungen
│       ├── AdminPage.tsx       # App-weite Übersicht (nur für Admins)
│       └── JoinPage.tsx        # /join/:code
└── supabase/
    ├── migrations/
    │   ├── 0001_schema.sql     # Tabellen, Constraints, Trigger, Storage-Bucket
    │   ├── 0002_rls.sql        # RLS-Policies + Hilfsfunktionen
    │   ├── 0003_functions.sql  # RPCs (Gruppen, Reminder, Cooldowns)
    │   ├── 0004_realtime.sql   # Realtime-Publikationen
    │   ├── 0005_admin.sql      # App-weiter Admin-Zugang (app_admins, Policies)
    │   └── 0006_habit_targets.sql # persönliche Zielwerte je Nutzer
    └── functions/
        ├── _shared/lib.ts      # Service-Client, Web-Push, E-Mail, Zeit-Helfer
        ├── send-push/          # stellt eine Notification per Push/E-Mail zu
        └── auto-reminders/     # Cron: erinnert an offene Gewohnheiten
```

## Datenmodell (Kurzüberblick)

| Tabelle | Zweck | Wichtige Constraints |
| --- | --- | --- |
| `profiles` | Anzeigename, Avatar, Zeitzone | 1:1 zu `auth.users`, Auto-Anlage per Trigger |
| `groups` | private Gruppe | `invite_code` unique |
| `group_members` | Mitgliedschaft + Rolle | PK `(group_id, user_id)`, Rolle `owner/member` |
| `challenges` | Challenge einer Gruppe | **max. 1 aktive pro Gruppe** (partieller Unique-Index), `end >= start` |
| `habits` | konfigurierbare Gewohnheiten | boolesch ohne / numerisch mit Standard-Zielwert (`check`), sortierbar |
| `habit_targets` | persönlicher Zielwert je Nutzer | PK `(habit_id, user_id)`, überschreibt den Standardwert der Gewohnheit |
| `daily_checkins` | ein Eintrag pro Tag | **unique `(challenge_id, user_id, date)`**, Datum im Zeitraum (Trigger) |
| `habit_entries` | Werte je Gewohnheit | unique `(checkin_id, habit_id)`, `completed` per Trigger berechnet |
| `reminders` | manuelle Erinnerungen | unique `(sender, recipient, habit, date)` = Tages-Cooldown |
| `notifications` | In-App-Postfach | Quelle für Push-/E-Mail-Zustellung |
| `push_subscriptions` | Web-Push-Abo je Gerät | `endpoint` unique, nur Besitzer lesbar |
| `notification_preferences` | Kanäle, Ruhezeiten, Auto-Reminder | 1:1 zu `profiles` |

## Sicherheit

- RLS auf **jeder** Tabelle; Mitglieder lesen nur Daten der eigenen Gruppen,
  Check-ins/Einträge schreibt ausschließlich der Besitzer.
- Erinnerungen entstehen **nur** über `send_reminder`: prüft Mitgliedschaft
  beider Seiten, aktive Challenge, offene Gewohnheit, Ruhezeiten,
  Empfänger-Einstellungen, 10-Minuten-Burst-Schutz und den Tages-Cooldown.
- Push-Endpunkte/Schlüssel: RLS `user_id = auth.uid()`, kein öffentlicher Zugriff.
- Keine Service-Role-Keys im Frontend; Secrets nur als Edge-Function-Secrets.
- Validierung doppelt: Zod im Client, Constraints/Trigger/RPCs im Server.
- XSS: React-Escaping, keine `dangerouslySetInnerHTML`. CSRF: tokenbasierte
  Auth (Bearer JWT, kein Cookie-Implicit-Trust). Spam: serverseitige Cooldowns.

---

## Lokale Entwicklung

```bash
npm install
cp .env.example .env        # Supabase-URL, Anon-Key, VAPID-Public-Key eintragen
npm run dev                 # http://localhost:5173
npm test                    # Unit-Tests (Statistik/Datum)
npm run build               # Typecheck + Produktions-Build
npm run icons               # App-Icons neu generieren
```

## Supabase einrichten

1. Projekt auf [supabase.com](https://supabase.com) anlegen.
2. Migrationen ausführen (Reihenfolge beachten):
   ```bash
   supabase link --project-ref <ref>
   supabase db push          # führt supabase/migrations/*.sql aus
   ```
   Alternativ die vier Dateien nacheinander im SQL-Editor ausführen.
3. **Auth**: E-Mail/Passwort-Provider aktivieren. Unter *URL Configuration*
   die Site-URL (Produktion) und `http://localhost:5173` als Redirect-URL
   eintragen (für Passwort-Reset und E-Mail-Bestätigung).
4. `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` in `.env` übernehmen.

## Web Push einrichten

1. VAPID-Schlüsselpaar erzeugen:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Public Key ins Frontend: `VITE_VAPID_PUBLIC_KEY` in `.env`.
3. Beide Schlüssel als Edge-Function-Secrets:
   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
     VAPID_SUBJECT=mailto:du@example.com
   ```
4. Edge Functions deployen:
   ```bash
   supabase functions deploy send-push
   supabase functions deploy auto-reminders
   ```
5. Optional (empfohlen): **Database Webhook** anlegen –
   *Database → Webhooks → neue Hook* auf `INSERT` in `public.notifications`,
   Ziel: die `send-push`-Function. Dann wird jede Notification automatisch
   zugestellt, auch wenn der Client den Aufruf nicht macht.

**iOS-Hinweis:** Safari erlaubt Web Push nur für installierte PWAs. Die App
erklärt das in den Einstellungen: *Teilen → „Zum Home-Bildschirm“*, danach
lässt sich Push aktivieren.

## Automatische Erinnerungen (Cron)

Die Function `auto-reminders` prüft alle Nutzer mit aktivierter
Auto-Erinnerung: Zeitzone, konfigurierte Uhrzeit (15-Minuten-Fenster),
Ruhezeiten, aktive Challenge, offene `auto_remind`-Gewohnheiten und ob heute
schon erinnert wurde. Zeitplan per `pg_cron` + `pg_net` (SQL-Editor):

```sql
select cron.schedule(
  'gympact-auto-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/auto-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SUPABASE_ANON_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

## Persönliche Zielwerte

Numerische Gewohnheiten (z. B. „Protein erreicht“) haben ein gemeinsames
**Thema** für die ganze Gruppe, aber einen **persönlichen Zielwert** je
Nutzer – die eine nimmt 180 g Protein, der andere 160 g. `habits.target_value`
ist dabei der Standard-/Vorschlagswert, den der Owner beim Anlegen der
Challenge setzt; `habit_targets` überschreibt ihn pro Nutzer.

Sobald ein Mitglied eine aktive Challenge mit numerischen Gewohnheiten sieht,
für die es noch kein eigenes Ziel eingetragen hat (z. B. direkt nach dem
Beitritt über den Einladungslink), zeigt „Heute“ statt des Check-ins zuerst
ein Formular zum Eintragen der persönlichen Ziele – der Check-in selbst bleibt
so lange gesperrt. Ziele lassen sich danach jederzeit unter *Einstellungen →
Meine Ziele* anpassen.

## Admin-Bereich einrichten

GymPact kennt neben den Gruppen-Rollen `owner`/`member` optional einen
**App-weiten Admin-Zugang** (Migration `0005_admin.sql`): Admins sehen unter
`/admin` (Link erscheint automatisch in den Einstellungen) alle Gruppen,
Mitgliederzahlen und Challenges gruppenübergreifend und können Gruppen
löschen. Bewusst **nicht** einsehbar: private Check-ins, Notizen, Gewicht,
Erinnerungen, Benachrichtigungen und Push-Abos anderer Nutzer.

Admin-Rechte werden aus Sicherheitsgründen **nicht** über die App vergeben,
sondern nur manuell im SQL-Editor – dafür gibt es keine RPC, also keinen
Codepfad, über den sich jemand selbst zum Admin machen könnte:

```sql
-- Erst nachdem sich die Person mit dieser E-Mail-Adresse registriert hat:
insert into public.app_admins (user_id)
select id from auth.users where email = 'deine-email@example.com'
on conflict (user_id) do nothing;
```

Admin-Rechte entziehen: `delete from public.app_admins where user_id = '<uuid>';`

## E-Mail-Fallback (optional)

Über [Resend](https://resend.com): `supabase secrets set RESEND_API_KEY=... EMAIL_FROM="GymPact <noreply@deine-domain.de>"`.
E-Mails gehen nur raus, wenn der Nutzer den Kanal aktiviert hat **und** kein
Gerät per Push erreichbar war.

## Deployment (Frontend)

Statisches SPA – z. B. Vercel, Netlify, Cloudflare Pages oder Hostinger:

1. Build-Command `npm run build`, Output `dist/`.
2. Umgebungsvariablen `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `VITE_VAPID_PUBLIC_KEY` setzen.
3. SPA-Fallback aktivieren (alle Pfade → `/index.html`).
   - Netlify: `/_redirects` mit `/* /index.html 200`
   - Vercel: erkennt Vite automatisch
4. HTTPS ist Pflicht (Service Worker + Push funktionieren nur über HTTPS).
5. Produktions-URL in Supabase unter *Auth → URL Configuration* eintragen.

### Deployment auf Hostinger

Wichtig: `VITE_*`-Variablen werden **beim Build** in den JS-Code eingebacken,
nicht zur Laufzeit vom Server gelesen. Bei Hostinger-Webhosting (Shared/Cloud,
Apache/LiteSpeed) läuft kein Node-Prozess für die App – es genügt aber ein
statischer Build:

1. `.env` lokal mit den echten Werten befüllen (siehe oben) und bauen:
   ```bash
   npm run build
   ```
2. Den **Inhalt** von `dist/` (nicht den Ordner selbst) per hPanel-Dateimanager
   oder FTP/SFTP nach `public_html` hochladen (bzw. `public_html/<unterordner>`,
   falls die App nicht auf der Domain-Wurzel laufen soll).
3. `public/.htaccess` wird beim Build automatisch mit nach `dist/` kopiert und
   sorgt für SPA-Routing (kein 404 bei Reload auf `/progress` etc.), korrekte
   Cache-Header für den Service Worker und HTTPS-Erzwingung.
4. Kostenloses SSL in hPanel aktivieren (Websites → SSL), falls nicht schon
   automatisch aktiv.
5. Produktions-Domain in Supabase unter *Auth → URL Configuration* als
   Site-URL/Redirect-URL eintragen (sonst schlagen Passwort-Reset und
   E-Mail-Bestätigung fehl).
6. Bei jeder Änderung: neu bauen und `dist/` erneut hochladen – es gibt kein
   automatisches CI/CD, außer du richtest z. B. eine GitHub Action ein, die
   per FTP/SFTP nach Hostinger deployt.

Falls du stattdessen einen Hostinger-VPS mit eigenem Nginx/Node betreibst,
gilt das gleiche Prinzip (statischer Build + Reverse Proxy mit SPA-Fallback);
dann lassen sich Env-Variablen auch in einer Build-Pipeline auf dem VPS setzen.

## Tests & Fehlerbehandlung

- `npm test`: Vitest-Suite für die kritische Fachlogik (Tagesquoten, Serien,
  Wochenstatistik, Zeitzonen-Datumslogik) – 23 Tests.
- Fehlerpfade: Formulare zeigen Feld- und Serverfehler; Autosave hat einen
  sichtbaren Status (Speichert…/Gespeichert/Fehler); RPC-Fehlermeldungen
  (z. B. Cooldown, Ruhezeit) erscheinen als Toast; abgelaufene Push-Abos
  werden serverseitig aufgeräumt.
