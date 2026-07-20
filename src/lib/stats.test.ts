import { describe, expect, it } from 'vitest';
import {
  computeDayCompletion,
  computeDayCompletions,
  computeHabitStats,
  currentStreak,
  fullDayCount,
  longestStreak,
  motivationalStatus,
  overallCompletionRate,
  weekCompletionRate,
  type EntryLite,
  type HabitLite,
} from './stats';

const habits: HabitLite[] = [
  { id: 'training', type: 'boolean', target_value: null },
  { id: 'protein', type: 'numeric', target_value: 180 },
];

const entry = (
  habitId: string,
  completed: boolean,
  valueNumeric: number | null = null,
): EntryLite => ({
  habit_id: habitId,
  completed,
  value_boolean: valueNumeric === null ? completed : null,
  value_numeric: valueNumeric,
});

describe('computeDayCompletion', () => {
  it('zählt nur erledigte Gewohnheiten', () => {
    const day = computeDayCompletion('2026-07-20', habits, [
      entry('training', true),
      entry('protein', false, 120),
    ]);
    expect(day.completed).toBe(1);
    expect(day.total).toBe(2);
    expect(day.ratio).toBe(0.5);
    expect(day.isFull).toBe(false);
    expect(day.hasCheckin).toBe(true);
  });

  it('ist vollständig, wenn alle erledigt sind', () => {
    const day = computeDayCompletion('2026-07-20', habits, [
      entry('training', true),
      entry('protein', true, 200),
    ]);
    expect(day.isFull).toBe(true);
    expect(day.ratio).toBe(1);
  });

  it('behandelt fehlende Einträge als offen', () => {
    const day = computeDayCompletion('2026-07-20', habits, undefined);
    expect(day.completed).toBe(0);
    expect(day.hasCheckin).toBe(false);
  });

  it('ignoriert Einträge zu unbekannten Gewohnheiten', () => {
    const day = computeDayCompletion('2026-07-20', habits, [
      entry('geloescht', true),
    ]);
    expect(day.completed).toBe(0);
  });
});

describe('Serien', () => {
  const fullDay = (date: string): [string, EntryLite[]] => [
    date,
    [entry('training', true), entry('protein', true, 200)],
  ];
  const partialDay = (date: string): [string, EntryLite[]] => [
    date,
    [entry('training', true), entry('protein', false, 100)],
  ];

  it('zählt die aktuelle Serie bis heute', () => {
    const entriesByDate = new Map<string, EntryLite[]>([
      fullDay('2026-07-20'),
      fullDay('2026-07-21'),
      fullDay('2026-07-22'),
    ]);
    const days = computeDayCompletions('2026-07-20', '2026-07-22', habits, entriesByDate);
    expect(currentStreak(days, '2026-07-22')).toBe(3);
  });

  it('bricht die Serie nicht ab, wenn heute noch unvollständig ist', () => {
    const entriesByDate = new Map<string, EntryLite[]>([
      fullDay('2026-07-20'),
      fullDay('2026-07-21'),
      partialDay('2026-07-22'),
    ]);
    const days = computeDayCompletions('2026-07-20', '2026-07-22', habits, entriesByDate);
    expect(currentStreak(days, '2026-07-22')).toBe(2);
  });

  it('setzt die Serie nach einem verpassten Tag zurück', () => {
    const entriesByDate = new Map<string, EntryLite[]>([
      fullDay('2026-07-20'),
      // 21. fehlt komplett
      fullDay('2026-07-22'),
    ]);
    const days = computeDayCompletions('2026-07-20', '2026-07-22', habits, entriesByDate);
    expect(currentStreak(days, '2026-07-22')).toBe(1);
    expect(longestStreak(days)).toBe(1);
  });

  it('findet die längste Serie in der Mitte des Zeitraums', () => {
    const entriesByDate = new Map<string, EntryLite[]>([
      fullDay('2026-07-21'),
      fullDay('2026-07-22'),
      fullDay('2026-07-23'),
      partialDay('2026-07-24'),
      fullDay('2026-07-25'),
    ]);
    const days = computeDayCompletions('2026-07-20', '2026-07-25', habits, entriesByDate);
    expect(longestStreak(days)).toBe(3);
    expect(fullDayCount(days)).toBe(4);
  });
});

describe('overallCompletionRate', () => {
  it('mittelt die Erfüllung über alle Tage des Zeitraums', () => {
    const entriesByDate = new Map<string, EntryLite[]>([
      ['2026-07-20', [entry('training', true), entry('protein', true, 200)]], // 1.0
      ['2026-07-21', [entry('training', true), entry('protein', false, 90)]], // 0.5
      // 2026-07-22 kein Eintrag → 0.0
    ]);
    const days = computeDayCompletions('2026-07-20', '2026-07-22', habits, entriesByDate);
    expect(overallCompletionRate(days)).toBeCloseTo(0.5);
  });
  it('ist 0 ohne Tage', () => {
    expect(overallCompletionRate([])).toBe(0);
  });
});

describe('weekCompletionRate', () => {
  it('mittelt nur Tage der aktuellen Woche bis heute', () => {
    // 2026-07-22 ist ein Mittwoch, Wochenstart Montag 2026-07-20
    const entriesByDate = new Map<string, EntryLite[]>([
      ['2026-07-20', [entry('training', true), entry('protein', true, 200)]],
      ['2026-07-21', [entry('training', true), entry('protein', false, 90)]],
      ['2026-07-22', []],
    ]);
    const days = computeDayCompletions('2026-07-13', '2026-07-22', habits, entriesByDate);
    // (1 + 0.5 + 0) / 3
    expect(weekCompletionRate(days, '2026-07-22')).toBeCloseTo(0.5);
  });
});

describe('computeHabitStats', () => {
  it('liefert Anzahl und Durchschnitt je Gewohnheit', () => {
    const entriesByDate = new Map<string, EntryLite[]>([
      ['2026-07-20', [entry('training', true), entry('protein', true, 200)]],
      ['2026-07-21', [entry('training', false), entry('protein', false, 100)]],
      ['2026-07-22', [entry('training', true)]],
    ]);
    const stats = computeHabitStats(habits, entriesByDate);
    expect(stats.get('training')?.completedCount).toBe(2);
    expect(stats.get('training')?.average).toBeNull();
    expect(stats.get('protein')?.completedCount).toBe(1);
    expect(stats.get('protein')?.average).toBe(150);
  });
});

describe('motivationalStatus', () => {
  it('würdigt einen komplett erledigten Tag', () => {
    expect(motivationalStatus(1, 1, 30)).toContain('erledigt');
  });
  it('erwähnt die Serie bei laufender Streak', () => {
    expect(motivationalStatus(1, 5, 30)).toContain('5');
  });
  it('feiert das Challenge-Ende', () => {
    expect(motivationalStatus(0.4, 0, 0)).toContain('geschafft');
  });
});
