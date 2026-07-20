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

import {
  corsHeaders,
  getServiceClient,
  isInQuietHours,
  jsonResponse,
  localDateString,
  localMinutes,
  sendEmail,
  sendPushToUser,
  timeToMinutes,
} from "../_shared/lib.ts";

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

        let emailed = false;
        if (prefs.email && pushed === 0) {
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
