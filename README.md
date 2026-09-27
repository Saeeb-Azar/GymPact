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
  **Körper 3D**: interaktives three.js-Modell mit Muskelgruppen – antippen,
  die Figur dreht sich, die Gruppe wird rot markiert und daneben erscheinen
  deine Übungen dafür. Grün eingefärbt = viel trainiert (4 Wochen).
- **Statistik** – Ernährung (3D-Balken Kalorien, Proteinverlauf,
  3D-Makro-Donut, Mahlzeiten, Tracking-Kalender), Training (Volumen je
  Woche, Kraftentwicklung je Übung, Bestleistungen, Muskelgruppen,
  Trainingstage) und Körper (Gewicht, Wasser). 7/30/90 Tage.
- **Profil** – Name, Avatar, Zeitzone, Ernährungsziele mit Bedarfsrechner
  (Mifflin-St Jeor), Hell/Dunkel.
- **Admin** – Nutzerübersicht mit Aktivitäts-Zählwerten (keine Inhalte).

## Update auf die Tracker-Version (Migration 0009)

**Pflicht nach dem Deploy:** `supabase/migrations/0009_tracker.sql` einmal
im Supabase-SQL-Editor ausführen (oder `supabase db push`). Sie legt die
neuen Tabellen samt RLS an, die RPCs `copy_training_week` und
`admin_user_overview` und schaltet den alten Erinnerungs-Cron ab. Die
alten Challenge-Tabellen bleiben unverändert erhalten, werden aber nicht
mehr genutzt. Ohne diese Migration zeigt die App einen Hinweis statt Daten.

---

## Architektur

**„Thin Client, sicherer Kern in der Datenbank“.** Das React-Frontend
(Vite, TypeScript, Tailwind, TanStack Query, framer-motion, three.js)
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
│   ├── body/              # 3D-Körper: BodyScene (three.js, lazy geladen), BodyView
│   ├── charts/            # Ring, MacroBar, Bars3D (CSS-3D), LineChart, Donut3D, Heatmap
│   ├── nutrition/         # AddFoodSheet, AmountPicker, DaySummary, Water/WeightCard
│   ├── training/          # ExerciseCard, AddExerciseSheet, AddWorkoutSheet
│   └── ui/                # basics, motion (Sheet, Segmented, AnimatedNumber, Tilt, Konfetti)
├── hooks/                 # nutrition.ts, training.ts, queries.ts (Profil/Admin)
└── lib/                   # nutrition.ts, training.ts, muscles.ts, openFoodFacts.ts, dates.ts (+ Tests)
supabase/migrations/0009_tracker.sql   # Tracker-Schema
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
