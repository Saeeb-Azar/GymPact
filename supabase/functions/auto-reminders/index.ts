// Edge Function: auto-reminders
//
// Wird per Cron (z. B. alle 15 Minuten) aufgerufen und erinnert Nutzer,
// deren konfigurierte Erinnerungszeit gerade erreicht wurde und die noch
// offene Gewohnheiten haben.
//
// Berücksichtigt:
//   * die Zeitzone des Nutzers (Profil)
//   * Ruhezeiten und Benachrichtigungseinstellungen
//   * nur aktive Challenges, deren Zeitraum den heutigen Tag umfasst
//   * bereits abgeschlossene Gewohnheiten (habit_entries.completed)
//   * nur Gewohnheiten mit auto_remind = true
//   * bereits versandte Auto-Erinnerungen (max. 1 pro Nutzer, Challenge, Tag)
//
// Einrichtung (Cron): siehe README → "Automatische Erinnerungen".
//
// Diese Datei ist in sich geschlossen (keine Shared-Imports), damit sie
// sich auch direkt im Supabase-Dashboard-Editor deployen lässt.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen");
  return createClient(url, key, { auth: { persistSession: false } });
}

let vapidConfigured = false;
function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<number> {
  if (!ensureVapid()) return 0;
  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (error) throw error;
  if (!subscriptions || subscriptions.length === 0) return 0;

  let delivered = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 12 },
      );
      delivered++;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        console.error(`Push an ${sub.id} fehlgeschlagen:`, err);
      }
    }
  }
  return delivered;
}

// E-Mail-Versand über Brevo (empfohlen, kostenlos ohne eigene Domain)
// oder Resend – je nachdem, welches Secret gesetzt ist.
function parseFrom(): { name: string; email: string } {
  const raw = Deno.env.get("EMAIL_FROM") ?? "GymPact <no-reply@example.com>";
  const match = raw.match(/^(.*?)\s*<(.+)>$/);
  if (match) return { name: match[1].trim() || "GymPact", email: match[2].trim() };
  return { name: "GymPact", email: raw.trim() };
}

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const brevoKey = Deno.env.get("BREVO_API_KEY");
  if (brevoKey) {
    const from = parseFrom();
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: from,
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
    });
    if (!res.ok) {
      console.error("Brevo-E-Mail fehlgeschlagen:", await res.text());
      return false;
    }
    return true;
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (resendKey) {
    const from = Deno.env.get("EMAIL_FROM") ?? "GymPact <onboarding@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!res.ok) {
      console.error("Resend-E-Mail fehlgeschlagen:", await res.text());
      return false;
    }
    return true;
  }

  console.warn("Kein BREVO_API_KEY/RESEND_API_KEY gesetzt – E-Mail übersprungen");
  return false;
}

function localDateString(timezone: string, date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function localMinutes(timezone: string, date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function timeToMinutes(time: string): number {
  const [h = "0", m = "0"] = time.split(":");
  return Number(h) * 60 + Number(m);
}

function isInQuietHours(
  timezone: string,
  quietStart: string,
  quietEnd: string,
  date = new Date(),
): boolean {
  const nowMin = localMinutes(timezone, date);
  const start = timeToMinutes(quietStart);
  const end = timeToMinutes(quietEnd);
  if (start === end) return false;
  if (start < end) return nowMin >= start && nowMin < end;
  return nowMin >= start || nowMin < end;
}

// Muss zum Cron-Intervall passen: Fenster, in dem eine Erinnerungszeit
// als "gerade erreicht" gilt.
const WINDOW_MINUTES = 15;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = getServiceClient();
    const now = new Date();

    // Alle Nutzer mit aktivierten automatischen Erinnerungen
    const { data: candidates, error } = await supabase
      .from("notification_preferences")
      .select(
        "user_id, push, email, in_app, quiet_hours_start, quiet_hours_end, auto_reminder_time, profiles:user_id (timezone, display_name)",
      )
      .eq("auto_reminders", true);

    if (error) throw error;

    let remindersSent = 0;
    const details: Array<Record<string, unknown>> = [];

    for (const prefs of candidates ?? []) {
      const profile = prefs.profiles as unknown as {
        timezone: string;
        display_name: string;
      } | null;
      const timezone = profile?.timezone ?? "Europe/Berlin";

      // Ist die Erinnerungszeit im aktuellen Fenster erreicht?
      const nowMin = localMinutes(timezone, now);
      const targetMin = timeToMinutes(prefs.auto_reminder_time);
      const inWindow =
        nowMin >= targetMin && nowMin < targetMin + WINDOW_MINUTES;
      if (!inWindow) continue;

      // Ruhezeiten respektieren
      if (
        isInQuietHours(
          timezone,
          prefs.quiet_hours_start,
          prefs.quiet_hours_end,
          now,
        )
      ) {
        continue;
      }

      const localDate = localDateString(timezone, now);
      const userId = prefs.user_id as string;

      // Gruppen des Nutzers
      const { data: memberships } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", userId);
      const groupIds = (memberships ?? []).map((m) => m.group_id);
      if (groupIds.length === 0) continue;

      // Aktive Challenges, deren Zeitraum heute (lokal) umfasst
      const { data: challenges } = await supabase
        .from("challenges")
        .select("id, name, group_id")
        .in("group_id", groupIds)
        .eq("status", "active")
        .lte("start_date", localDate)
        .gte("end_date", localDate);

      for (const challenge of challenges ?? []) {
        // Höchstens eine Auto-Erinnerung pro Nutzer, Challenge und Tag
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", userId)
          .eq("type", "auto_reminder")
          .eq("data->>date", localDate)
          .eq("data->>challenge_id", challenge.id)
          .limit(1);
        if (existing && existing.length > 0) continue;

        // Erinnerbare Gewohnheiten der Challenge
        const { data: habits } = await supabase
          .from("habits")
          .select("id, name")
          .eq("challenge_id", challenge.id)
          .eq("auto_remind", true)
          .order("sort_order");
        if (!habits || habits.length === 0) continue;

        // Bereits erledigte Gewohnheiten des Tages ermitteln
        const { data: checkin } = await supabase
          .from("daily_checkins")
          .select("id")
          .eq("challenge_id", challenge.id)
          .eq("user_id", userId)
          .eq("date", localDate)
          .maybeSingle();

        let completedIds = new Set<string>();
        if (checkin) {
          const { data: entries } = await supabase
            .from("habit_entries")
            .select("habit_id, completed")
            .eq("checkin_id", checkin.id);
          completedIds = new Set(
            (entries ?? []).filter((e) => e.completed).map((e) => e.habit_id),
          );
        }

        const openHabits = habits.filter((h) => !completedIds.has(h.id));
        if (openHabits.length === 0) continue;

        const habitNames = openHabits.map((h) => h.name);
        const listed = habitNames.slice(0, 3).join(", ");
        const more =
          habitNames.length > 3 ? ` und ${habitNames.length - 3} weitere` : "";
        const title =
          openHabits.length === 1
            ? "Eine Gewohnheit ist noch offen"
            : `${openHabits.length} Gewohnheiten sind noch offen`;
        const body = `Für heute noch offen: ${listed}${more}. Du schaffst das!`;

        const { data: notification, error: insertError } = await supabase
          .from("notifications")
          .insert({
            user_id: userId,
            type: "auto_reminder",
            title,
            body,
            data: {
              date: localDate,
              challenge_id: challenge.id,
              open_habit_ids: openHabits.map((h) => h.id),
              url: "/today",
            },
          })
          .select("id")
          .single();
        if (insertError) {
          console.error("Notification-Insert fehlgeschlagen:", insertError);
          continue;
        }

        let pushed = 0;
        if (prefs.push) {
          pushed = await sendPushToUser(supabase, userId, {
            title,
            body,
            url: "/today",
            tag: `gympact-auto-${challenge.id}-${localDate}`,
          });
        }

        // E-Mail unabhängig vom Push-Ergebnis, sobald der Kanal an ist
        let emailed = false;
        if (prefs.email) {
          const { data: userData } = await supabase.auth.admin.getUserById(
            userId,
          );
          const email = userData?.user?.email;
          if (email) {
            emailed = await sendEmail(
              email,
              `GymPact: ${title}`,
              `${body}\n\nÖffne GymPact für deinen Check-in: /today`,
            );
          }
        }

        await supabase
          .from("notifications")
          .update({
            push_sent_at: new Date().toISOString(),
            ...(emailed ? { email_sent_at: new Date().toISOString() } : {}),
          })
          .eq("id", notification.id);

        remindersSent++;
        details.push({
          user_id: userId,
          challenge_id: challenge.id,
          open: openHabits.length,
          pushed,
          emailed,
        });
      }
    }

    return jsonResponse({ status: "ok", remindersSent, details });
  } catch (err) {
    console.error("auto-reminders Fehler:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
