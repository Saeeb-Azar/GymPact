// Edge Function: send-push
//
// Stellt eine bereits erzeugte Notification per Web Push (und optional
// E-Mail) zu. Die Notification selbst entsteht ausschließlich über die
// validierenden RPCs (z. B. send_reminder) – diese Funktion liefert nur aus.
//
// Aufrufer:
//   * das Frontend direkt nach einem erfolgreichen send_reminder-RPC
//   * optional ein Supabase Database Webhook auf INSERT in notifications
//
// Body: { "notification_id": "<uuid>" }
// verify_jwt bleibt aktiviert – nur angemeldete Nutzer (oder der Webhook
// mit Service-Key) können die Zustellung anstoßen. Doppelzustellung wird
// über push_sent_at verhindert.

import {
  corsHeaders,
  getServiceClient,
  isInQuietHours,
  jsonResponse,
  sendEmail,
  sendPushToUser,
} from "../_shared/lib.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    // Direkter Aufruf {notification_id} oder Database-Webhook {record:{id}}
    const notificationId: string | undefined =
      body.notification_id ?? body.record?.id;

    if (!notificationId) {
      return jsonResponse({ error: "notification_id fehlt" }, 400);
    }

    const supabase = getServiceClient();

    const { data: notification, error } = await supabase
      .from("notifications")
      .select("id, user_id, type, title, body, data, push_sent_at, email_sent_at")
      .eq("id", notificationId)
      .maybeSingle();

    if (error) throw error;
    if (!notification) {
      return jsonResponse({ error: "Notification nicht gefunden" }, 404);
    }
    if (notification.push_sent_at) {
      return jsonResponse({ status: "already_sent" });
    }

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

    // E-Mail-Fallback: nur wenn aktiviert und kein Gerät erreicht wurde
    let emailed = false;
    if (prefs?.email && pushed === 0 && !quiet && !notification.email_sent_at) {
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
