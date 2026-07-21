// Edge Function: send-push  (EIGENSTÄNDIG – ohne Shared-Imports)
//
// Stellt eine bereits erzeugte Notification per Web Push (und optional
// E-Mail) zu. Die Notification selbst entsteht ausschließlich über die
// validierenden RPCs (z. B. send_reminder) – diese Funktion liefert nur aus.
//
// Diese Datei ist absichtlich in sich geschlossen, damit sie sich auch
// direkt im Supabase-Dashboard-Editor (Edge Functions → Deploy a new
// function) einfügen und deployen lässt – ganz ohne CLI.
//
// Body: { "notification_id": "<uuid>" }  oder Database-Webhook { record: { id } }
//
// Benötigte Secrets (Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...)
//   optional: RESEND_API_KEY, EMAIL_FROM   (für E-Mail-Fallback)
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase automatisch bereit.

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
  if (!ensureVapid()) {
    console.warn("VAPID-Schlüssel nicht konfiguriert – Push übersprungen");
    return 0;
  }
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
        // Abo abgelaufen/widerrufen → aufräumen
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
// EMAIL_FROM im Format:  GymPact <deine-adresse@gmail.com>
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const notificationId: string | undefined =
      body.notification_id ?? body.record?.id;
    if (!notificationId) return jsonResponse({ error: "notification_id fehlt" }, 400);

    const supabase = getServiceClient();

    const { data: notification, error } = await supabase
      .from("notifications")
      .select("id, user_id, type, title, body, data, push_sent_at, email_sent_at")
      .eq("id", notificationId)
      .maybeSingle();
    if (error) throw error;
    if (!notification) return jsonResponse({ error: "Notification nicht gefunden" }, 404);
    if (notification.push_sent_at) return jsonResponse({ status: "already_sent" });

    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("push, email, quiet_hours_start, quiet_hours_end")
      .eq("user_id", notification.user_id)
      .maybeSingle();

    const { data: recipientProfile } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("id", notification.user_id)
      .maybeSingle();

    const timezone = recipientProfile?.timezone ?? "Europe/Berlin";
    const quiet = prefs
      ? isInQuietHours(timezone, prefs.quiet_hours_start, prefs.quiet_hours_end)
      : false;

    let pushed = 0;
    if (prefs?.push && !quiet) {
      pushed = await sendPushToUser(supabase, notification.user_id, {
        title: notification.title,
        body: notification.body,
        url: (notification.data as { url?: string })?.url ?? "/",
        tag: `gympact-${notification.type}-${notification.id}`,
      });
    }

    // E-Mail wird unabhängig vom Push-Ergebnis verschickt, sobald der
    // Kanal aktiviert ist (Standard: an) – Push gilt als Bonus.
    let emailed = false;
    if (prefs?.email && !quiet && !notification.email_sent_at) {
      const { data: userData } = await supabase.auth.admin.getUserById(
        notification.user_id,
      );
      const email = userData?.user?.email;
      if (email) {
        emailed = await sendEmail(
          email,
          `GymPact: ${notification.title}`,
          `${notification.body}\n\nÖffne GymPact, um deinen Check-in zu machen.`,
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

    return jsonResponse({ status: "ok", pushed, emailed, quiet });
  } catch (err) {
    console.error("send-push Fehler:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
