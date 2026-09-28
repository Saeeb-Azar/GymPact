# GymPact

**GymPact** ist eine private, mobile-first Progressive Web App, um den
**eigenen Fortschritt** zu tracken – Ernährung, Training und Statistiken an
einem Ort. Mehrere Nutzer (z. B. Geschwister, Freunde) können die App
gemeinsam verwenden; jeder sieht ausschließlich seine eigenen Daten.

## Bereiche

- **Heute** – Dashboard: Kalorienring, Makros, heutige Trainingseinheit,
  7-Tage-Kalorien, Gewichtstrend, Wasser.
- **Essen** – Einträge je Mahlzeit (Frühstück, Mittagessen, Abendessen,
  Snacks) mit Kalorien, Protein, Kohlenhydraten und Fett. Lebensmittel aus
  der gemeinsamen Bibliothek, der **Open-Food-Facts**-Datenbank (online,
  ohne API-Key) oder als Schnell-Eintrag. „Zuletzt gegessen“, Mahlzeit bzw.
  ganzen Tag vom Vortag übernehmen, Wasser-Tracker, Körpergewicht.
- **Training** – Trainingsplan **in Wochen** (KW): Einheiten → Übungen →
  Sätze mit Gewicht und Wiederholungen. „Vorwoche übernehmen“ kopiert den
  kompletten Plan inkl. Gewichten; jede Übung zeigt „Letztes Mal“, erkennt
  neue Bestleistungen (PR) und schätzt das 1RM.
  **Körper 3D**: realistische anatomische Illustration (Vorder-/Rückseite,
  Mann/Frau) mit anklickbaren Muskeln – wischen dreht die Figur in 3D,
  ein Muskel antippen → Figur dreht sich zur richtigen Seite, zoomt auf den
  Muskel, er pulsiert rot und daneben erscheinen deine Übungen dafür.
  Grün eingefärbt = viel trainiert (4 Wochen). Illustrationen & Masken:
  [js-rich-body-highlighter](https://github.com/crmapache/js-rich-body-highlighter) (MIT).
- **Statistik** – Ernährung (3D-Balken Kalorien, Proteinverlauf,
  3D-Makro-Donut, Mahlzeiten, Tracking-Kalender), Training (Volumen je
  Woche, Kraftentwicklung je Übung, Bestleistungen, Muskelgruppen,
  Trainingstage) und Körper (Gewicht, Wasser). 7/30/90 Tage.
- **Profil** – Name, Avatar, Zeitzone, Ernährungsziele mit Bedarfsrechner
  (Mifflin-St Jeor), Hell/Dunkel.
- **Admin** – Nutzerübersicht mit Aktivitäts-Zählwerten (keine Inhalte).

## Automatisches Deployment (GitHub Actions)

Bei jedem Push auf `claude/neues-projekt-q6ro6k` läuft `.github/workflows/deploy.yml`:
Tests → Build → **Datenbank-Migrationen in Supabase** → **Website nach Hostinger**.
Einmalig unter *GitHub → Repository → Settings → Secrets and variables → Actions*
diese Secrets anlegen (fehlende Secrets = Schritt wird übersprungen):

| Secret | Woher | Wofür |
| --- | --- | --- |
| `SUPABASE_DB_PASSWORD` | das Datenbank-Passwort, das du beim Anlegen des Supabase-Projekts vergeben hast | Tabellen anlegen/aktualisieren (Server wird automatisch gefunden) |
| `SUPABASE_DB_URL` (Alternative) | Supabase → **Connect** → *Session pooler* → URI | statt Passwort, falls die automatische Suche scheitert |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → **Access Tokens** | Website-URL + „ohne Bestätigungsmail“ setzen (optional) |
| `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` | Hostinger → Website → **Dateien → FTP-Konten** | Upload nach `public_html` |
| `FTP_DIR` (optional) | – | Zielordner, Standard `public_html/` |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SENDER` (optional) | z. B. Brevo → *SMTP & API*: Host `smtp-relay.brevo.com`, Login, SMTP-Key, verifizierte Absender-Adresse | eigener Mailversand für „Passwort vergessen“ (Supabase selbst schickt nur an Team-Mitglieder und max. wenige Mails/Stunde) |
| `ADMIN_EMAIL` (optional) | – | diese E-Mail nach der Registrierung zum Admin machen |

Wichtig: Falls du `SUPABASE_DB_URL` nutzt, den **Session pooler** nehmen (nicht
„Direct connection“ `db.<ref>.supabase.co` – die ist nur per IPv6 erreichbar).

Ohne FTP geht es auch: Der Workflow legt die fertige Website immer in den
Branch **`hostinger-build`**. In Hostinger unter *Website → Erweitert → Git*
dieses Repo mit Branch `hostinger-build` und Ordner `public_html` verbinden
und „Automatisches Deployment“ aktivieren.

### Google-Login einschalten (optional)

1. [console.cloud.google.com](https://console.cloud.google.com) → Projekt anlegen →
   *APIs & Dienste → OAuth-Zustimmungsbildschirm* (Extern, App-Name, E-Mail) →
   *Anmeldedaten → Anmeldedaten erstellen → OAuth-Client-ID* → Typ **Webanwendung**.
2. Bei *Autorisierte Weiterleitungs-URIs* eintragen:
   `https://<projekt-ref>.supabase.co/auth/v1/callback`
3. Client-ID + Clientschlüssel in Supabase unter *Authentication → Providers → Google*
   eintragen (oder als Secrets `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, dann macht es
   der Workflow – braucht zusätzlich `SUPABASE_ACCESS_TOKEN`).
4. In `.env.production` `VITE_GOOGLE_LOGIN=true` setzen → Button erscheint.

Der **erste Nutzer**, der sich registriert, wird automatisch Admin
(Migration `0010_first_admin.sql`).

## Neues Supabase-Projekt aufsetzen (Schritt für Schritt)

1. Auf [supabase.com](https://supabase.com) → **New project** (Region z. B.
   Frankfurt), Datenbank-Passwort notieren.
2. **SQL Editor → New query**: den kompletten Inhalt von
   **`supabase/setup.sql`** einfügen → **Run**. Das legt in einem Rutsch
   alle Tabellen, Sicherheitsregeln (RLS) und Funktionen an.
3. **Project Settings → API**: *Project URL* und den *anon/public key*
   kopieren.
4. **Authentication → URL Configuration**: *Site URL* = deine Domain
   (z. B. `https://gympact.deinedomain.de`), bei *Redirect URLs*
   `https://gympact.deinedomain.de/**` ergänzen. Optional unter
   **Authentication → Providers → Email** „Confirm email“ ausschalten, dann
   kann man sich ohne Bestätigungsmail sofort anmelden.
5. Lokal eine `.env` anlegen:
   ```
   VITE_SUPABASE_URL=https://<dein-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```
   dann `npm install && npm run build` und den **Inhalt** von `dist/` nach
   Hostinger (`public_html`) hochladen. (Baut Hostinger selbst aus Git, die
   beiden Variablen dort als Umgebungsvariablen eintragen.)
6. In der App registrieren – der erste Nutzer wird automatisch Admin.

Zeigt die App beim Anmelden „Server nicht erreichbar“, ist das Projekt
pausiert (Dashboard → *Restore project*) oder der Build enthält eine
falsche `VITE_SUPABASE_URL`.

**Bestehendes Projekt aktualisieren:** nur `supabase/migrations/0009_tracker.sql`
ausführen (die alten Challenge-Tabellen bleiben unverändert).

---

## Architektur

**„Thin Client, sicherer Kern in der Datenbank“.** Das React-Frontend
(Vite, TypeScript, Tailwind, TanStack Query, framer-motion)
spricht direkt mit Supabase. Row Level Security auf jeder Tabelle ist die
einzige Wahrheit über Zugriffsrechte; jede Zeile gehört genau einem Nutzer
(`user_id = auth.uid()`). Ausnahme: die Lebensmittel-Bibliothek `foods`
ist für alle angemeldeten Nutzer lesbar (gemeinsam gepflegt), ändern darf
nur, wer den Eintrag angelegt hat.

**Zeitzonen-Modell:** Die App rechnet mit lokalen Kalenderdaten
(`YYYY-MM-DD`) in der Profil-Zeitzone – nie mit UTC-Mitternacht.

## Ordnerstruktur (Auszug)

```
src/
├── pages/                 # Home, Nutrition, Training, Workout, Stats, Settings, Admin, auth/
├── components/
│   ├── body/              # Körper: RealisticBody (Illustration + Muskelmasken, 3D-Drehung), BodyView
│   ├── charts/            # Ring, MacroBar, Bars3D (CSS-3D), LineChart, Donut3D, Heatmap
│   ├── nutrition/         # AddFoodSheet, AmountPicker, DaySummary, Water/WeightCard
│   ├── training/          # ExerciseCard, AddExerciseSheet, AddWorkoutSheet
│   └── ui/                # basics, motion (Sheet, Segmented, AnimatedNumber, Tilt, Konfetti)
├── hooks/                 # nutrition.ts, training.ts, queries.ts (Profil/Admin)
└── lib/                   # nutrition.ts, training.ts, muscles.ts, openFoodFacts.ts, dates.ts (+ Tests)
supabase/setup.sql                     # Komplett-Setup für ein neues Projekt
supabase/migrations/0009_tracker.sql   # Tracker-Schema (Update bestehender Projekte)
```

## Datenmodell (Tracker)

| Tabelle | Zweck |
| --- | --- |
| `nutrition_goals` | Tagesziele kcal/Makros/Wasser (1:1 Nutzer) |
| `foods` | gemeinsame Lebensmittel-Bibliothek, Nährwerte je 100 g |
| `food_entries` | Einträge je Tag + Mahlzeit, absolute Werte |
| `daily_logs` | Wasser, Körpergewicht, Notiz je Tag |
| `training_weeks` | Trainingswoche (Montag, unique je Nutzer) |
| `workouts` | Einheit einer Woche (Name, Wochentag, erledigt) |
| `workout_exercises` | Übung (Name, Muskelgruppe) |
| `exercise_sets` | Satz: Gewicht, Wiederholungen, erledigt |

## Sicherheit

- RLS auf **jeder** Tabelle; alle Tracker-Daten sind strikt pro Nutzer.
  Ein Trigger stellt sicher, dass Einheiten/Übungen/Sätze nur unter eigene
  Wochen gehängt werden können.
- `copy_training_week` läuft als SECURITY INVOKER (RLS greift),
  `admin_user_overview` prüft `is_app_admin()` und liefert nur Zählwerte.
- Keine Service-Role-Keys im Frontend. Validierung doppelt: Client + DB-Checks.
- Die Edge Functions `send-push`/`auto-reminders` aus der Challenge-Zeit
  werden von der App nicht mehr verwendet und können gelöscht werden.

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

## Admin-Bereich einrichten

GymPact kennt neben den Gruppen-Rollen `owner`/`member` optional einen
**App-weiten Admin-Zugang** (Migration `0005_admin.sql`): Admins sehen unter
`/admin` (Link erscheint automatisch im Profil) alle Nutzer mit
Aktivitäts-Zählwerten (getrackte Tage, Trainingswochen, Workouts). Bewusst
**nicht** einsehbar: Essen, Gewicht, Notizen oder Trainingsinhalte anderer.

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

## Deployment (Frontend)

Statisches SPA – z. B. Vercel, Netlify, Cloudflare Pages oder Hostinger:

1. Build-Command `npm run build`, Output `dist/`.
2. Umgebungsvariablen `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   ggf. `VITE_VAPID_PUBLIC_KEY` setzen.
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

- `npm test`: Vitest-Suite für die Fachlogik (Makro-Berechnung, Tagessummen,
  Ziele/Serien, Bedarfsrechner, Volumen/1RM/Bestwerte, Kalenderwochen,
  Muskelgruppen-Erkennung, Datumslogik) – 43 Tests.
- Fehlerpfade: Formulare validieren im Client, Serverfehler erscheinen als
  Toast; fehlt Migration 0009, zeigt die App einen klaren Hinweis.
  Optimistische Updates (Einträge, Sätze, Wasser) sorgen für sofortiges
  Feedback und werden nach dem Speichern mit dem Server abgeglichen.
