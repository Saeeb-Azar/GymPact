// Datums-Helfer. Die App rechnet konsequent mit lokalen Kalenderdaten
// ("YYYY-MM-DD") in der Zeitzone des Nutzers – nie mit UTC-Mitternacht.

export type DateString = string; // "YYYY-MM-DD"

/** Lokales Datum in einer IANA-Zeitzone als "YYYY-MM-DD". */
export function localDateString(timezone: string, date: Date = new Date()): DateString {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    // Unbekannte Zeitzone → Gerätezeit als Fallback
    return new Intl.DateTimeFormat('en-CA').format(date);
  }
}

/** "YYYY-MM-DD" → Date (lokale Mitternacht des Geräts, nur für Rechnungen). */
export function parseDate(dateStr: DateString): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toDateString(date: Date): DateString {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(dateStr: DateString, days: number): DateString {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

/** Ganze Tage von a bis b (b − a). */
export function diffDays(a: DateString, b: DateString): number {
  const ms = parseDate(b).getTime() - parseDate(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** Alle Tage von start bis end (inklusive). */
export function dateRange(start: DateString, end: DateString): DateString[] {
  const result: DateString[] = [];
  let current = start;
  while (current <= end) {
    result.push(current);
    current = addDays(current, 1);
  }
  return result;
}

/** Montag der Woche, in der dateStr liegt. */
export function startOfWeek(dateStr: DateString): DateString {
  const d = parseDate(dateStr);
  const day = d.getDay(); // 0 = Sonntag
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toDateString(d);
}

/** "20. Juli" bzw. "20. Juli 2026". */
export function formatDate(dateStr: DateString, withYear = false): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(parseDate(dateStr));
}

/** "Mo., 20.07." */
export function formatDateShort(dateStr: DateString): string {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(parseDate(dateStr));
}

/** Relative Zeit für Aktivitätslisten: "gerade eben", "vor 5 Min.", "vor 2 Std.", sonst Datum. */
export function formatRelativeTime(isoTimestamp: string): string {
  const then = new Date(isoTimestamp).getTime();
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'gestern';
  if (days < 7) return `vor ${days} Tagen`;
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(
    new Date(isoTimestamp),
  );
}

/** "HH:MM:SS" oder "HH:MM" → "HH:MM" (für <input type="time">). */
export function toTimeInputValue(time: string): string {
  return time.slice(0, 5);
}

/** Zeitzonenliste für das Profil-Formular. */
export function availableTimezones(): string[] {
  if (typeof Intl.supportedValuesOf === 'function') {
    return Intl.supportedValuesOf('timeZone');
  }
  return [
    'Europe/Berlin',
    'Europe/Vienna',
    'Europe/Zurich',
    'Europe/London',
    'Europe/Paris',
    'Europe/Madrid',
    'America/New_York',
    'America/Los_Angeles',
    'Asia/Dubai',
    'Asia/Tokyo',
    'Australia/Sydney',
    'UTC',
  ];
}

/** Zeitzone des Geräts. */
export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin';
}
