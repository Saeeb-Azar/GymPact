// Reine Statistik-Funktionen für Dashboard und Fortschrittsseite.
// Bewusst ohne Abhängigkeiten und vollständig getestet (stats.test.ts).

import { addDays, dateRange, startOfWeek, type DateString } from './dates';

export interface HabitLite {
  id: string;
  type: 'boolean' | 'numeric';
  target_value: number | null;
}

export interface EntryLite {
  habit_id: string;
  completed: boolean;
  value_boolean: boolean | null;
  value_numeric: number | null;
}

export interface DayCompletion {
  date: DateString;
  completed: number;
  total: number;
  /** 0..1 */
  ratio: number;
  /** Alle Gewohnheiten erledigt */
  isFull: boolean;
  hasCheckin: boolean;
}

/** Erfüllung eines einzelnen Tages. */
export function computeDayCompletion(
  date: DateString,
  habits: HabitLite[],
  entries: EntryLite[] | undefined,
): DayCompletion {
  const total = habits.length;
  const completedIds = new Set(
    (entries ?? []).filter((e) => e.completed).map((e) => e.habit_id),
  );
  const completed = habits.filter((h) => completedIds.has(h.id)).length;
  return {
    date,
    completed,
    total,
    ratio: total === 0 ? 0 : completed / total,
    isFull: total > 0 && completed === total,
    hasCheckin: entries !== undefined && entries.length > 0,
  };
}

/**
 * Erfüllung aller Challenge-Tage von start bis einschließlich `until`
 * (in der Regel: heute bzw. das Challenge-Ende, falls früher).
 */
export function computeDayCompletions(
  start: DateString,
  until: DateString,
  habits: HabitLite[],
  entriesByDate: Map<DateString, EntryLite[]>,
): DayCompletion[] {
  if (until < start) return [];
  return dateRange(start, until).map((date) =>
    computeDayCompletion(date, habits, entriesByDate.get(date)),
  );
}

/**
 * Aktuelle Serie vollständiger Tage.
 * Ein noch unvollständiger heutiger Tag bricht die Serie nicht ab –
 * gezählt wird dann bis gestern.
 */
export function currentStreak(days: DayCompletion[], today: DateString): number {
  const fullByDate = new Map(days.map((d) => [d.date, d.isFull]));
  let streak = 0;
  let cursor = today;
  if (!fullByDate.get(cursor)) {
    cursor = addDays(cursor, -1); // heute zählt erst, wenn vollständig
  }
  while (fullByDate.get(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Längste Serie vollständiger Tage im gesamten Zeitraum. */
export function longestStreak(days: DayCompletion[]): number {
  let longest = 0;
  let run = 0;
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    run = day.isFull ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  return longest;
}

/** Durchschnittliche Erfüllungsquote der aktuellen Woche (Mo–heute), 0..1. */
export function weekCompletionRate(days: DayCompletion[], today: DateString): number {
  const weekStart = startOfWeek(today);
  const relevant = days.filter((d) => d.date >= weekStart && d.date <= today);
  if (relevant.length === 0) return 0;
  const sum = relevant.reduce((acc, d) => acc + d.ratio, 0);
  return sum / relevant.length;
}

/** Anzahl vollständiger Tage. */
export function fullDayCount(days: DayCompletion[]): number {
  return days.filter((d) => d.isFull).length;
}

export interface HabitStat {
  habitId: string;
  /** Boolesche Gewohnheit: Anzahl erledigter Tage. */
  completedCount: number;
  /** Numerische Gewohnheit: Durchschnittswert über Tage mit Eintrag, sonst null. */
  average: number | null;
}

/** Kennzahlen je Gewohnheit (z. B. Trainingsanzahl, Protein-Durchschnitt). */
export function computeHabitStats(
  habits: HabitLite[],
  entriesByDate: Map<DateString, EntryLite[]>,
): Map<string, HabitStat> {
  const result = new Map<string, HabitStat>();
  for (const habit of habits) {
    let completedCount = 0;
    let sum = 0;
    let valueDays = 0;
    for (const entries of entriesByDate.values()) {
      const entry = entries.find((e) => e.habit_id === habit.id);
      if (!entry) continue;
      if (entry.completed) completedCount++;
      if (habit.type === 'numeric' && entry.value_numeric !== null) {
        sum += entry.value_numeric;
        valueDays++;
      }
    }
    result.set(habit.id, {
      habitId: habit.id,
      completedCount,
      average: habit.type === 'numeric' && valueDays > 0 ? sum / valueDays : null,
    });
  }
  return result;
}

/** Motivierender Status für das Dashboard – ruhig statt marktschreierisch. */
export function motivationalStatus(
  todayRatio: number,
  streak: number,
  remainingDays: number,
): string {
  if (remainingDays <= 0) return 'Challenge geschafft – stark durchgezogen!';
  if (todayRatio >= 1) {
    return streak >= 3
      ? `Alles erledigt – Tag ${streak} deiner Serie.`
      : 'Alles erledigt für heute. Sauber.';
  }
  if (todayRatio >= 0.5) return 'Guter Lauf – nur noch wenige Punkte offen.';
  if (streak >= 3) return `Deine ${streak}-Tage-Serie wartet auf dich.`;
  return 'Ein Schritt nach dem anderen – starte mit einem Haken.';
}
