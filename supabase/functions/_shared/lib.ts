// Gemeinsame Helfer für die GymPact Edge Functions (Deno-Runtime).
// Läuft ausschließlich serverseitig mit dem Service-Role-Key –
// dieser Code (und der Key) erreicht niemals das Frontend.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen");
  }
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

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Sendet eine Web-Push-Nachricht an alle registrierten Geräte eines Nutzers.
 * Abgelaufene Abonnements (HTTP 404/410) werden automatisch entfernt.
 * Gibt die Anzahl erfolgreich erreichter Geräte zurück.
 */
export async function sendPushToUser(
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
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 12 },
      );
      delivered++;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Abo ist abgelaufen oder wurde widerrufen → aufräumen
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        console.error(`Push an ${sub.id} fehlgeschlagen:`, err);
      }
    }
  }
  return delivered;
}

/**
 * Optionaler E-Mail-Fallback über Resend. Wird nur genutzt, wenn
 * RESEND_API_KEY als Secret gesetzt ist.
 */
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return false;
  const from = Deno.env.get("EMAIL_FROM") ?? "GymPact <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!res.ok) {
    console.error("E-Mail-Versand fehlgeschlagen:", await res.text());
    return false;
  }
  return true;
}

/** Lokales Datum (YYYY-MM-DD) in einer IANA-Zeitzone. */
export function localDateString(timezone: string, date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Lokale Uhrzeit in Minuten seit Mitternacht in einer IANA-Zeitzone. */
export function localMinutes(timezone: string, date = new Date()): number {
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

/** "HH:MM[:SS]" → Minuten seit Mitternacht. */
export function timeToMinutes(time: string): number {
  const [h = "0", m = "0"] = time.split(":");
  return Number(h) * 60 + Number(m);
}

/** Prüft, ob die lokale Zeit in den Ruhezeiten liegt (Fenster darf über Mitternacht gehen). */
export function isInQuietHours(
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
