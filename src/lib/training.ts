// Trainings-Fachlogik: Volumen, 1RM-Schätzung, Bestwerte, Wochen-Labels.
// Rein funktional und getestet (training.test.ts).

import type { ExerciseSetRow } from './database.types';
import { addDays, parseDate, type DateString } from './dates';

export type SetLike = Pick<ExerciseSetRow, 'weight_kg' | 'reps'>;

export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;
export const WEEKDAYS_LONG = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
] as const;

/** Volumen = Summe (Gewicht × Wiederholungen). */
export function setVolume(s: SetLike): number {
  return Number(s.weight_kg) * Number(s.reps);
}

export function totalVolume(sets: SetLike[]): number {
  return Math.round(sets.reduce((sum, s) => sum + setVolume(s), 0));
}

/** Geschätztes 1RM nach Epley; bei 1 Wiederholung = Gewicht. */
export function estimateOneRepMax(s: SetLike): number {
  const w = Number(s.weight_kg);
  const r = Number(s.reps);
  if (w <= 0 || r <= 0) return 0;
  if (r === 1) return w;
  return Math.round(w * (1 + r / 30) * 10) / 10;
}

/** Bester Satz = höchstes geschätztes 1RM (bei Gleichstand mehr Gewicht). */
export function bestSet<T extends SetLike>(sets: T[]): T | null {
  let best: T | null = null;
  for (const s of sets) {
    if (Number(s.reps) <= 0) continue;
    if (
      !best ||
      estimateOneRepMax(s) > estimateOneRepMax(best) ||
      (estimateOneRepMax(s) === estimateOneRepMax(best) && Number(s.weight_kg) > Number(best.weight_kg))
    ) {
      best = s;
    }
  }
  return best;
}

/** "3 × 8 @ 80 kg" bzw. kompakte Zusammenfassung unterschiedlicher Sätze. */
export function summarizeSets(sets: SetLike[]): string {
  const valid = sets.filter((s) => Number(s.reps) > 0);
  if (valid.length === 0) return 'Keine Sätze';
  const allSame = valid.every(
    (s) => Number(s.reps) === Number(valid[0].reps) && Number(s.weight_kg) === Number(valid[0].weight_kg),
  );
  if (allSame) {
    const w = Number(valid[0].weight_kg);
    return `${valid.length} × ${valid[0].reps}${w > 0 ? ` @ ${formatKg(w)} kg` : ''}`;
  }
  return valid
    .map((s) => (Number(s.weight_kg) > 0 ? `${formatKg(Number(s.weight_kg))}×${s.reps}` : `${s.reps}`))
    .join(' · ');
}

export function formatKg(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

/** Normalisierter Übungsname für Vergleiche über Wochen hinweg. */
export function exerciseKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** ISO-Kalenderwoche eines Datums. */
export function isoWeek(dateStr: DateString): number {
  const d = parseDate(dateStr);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNr = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round((diff / 86_400_000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
}

/** "22.–28. Sep." für eine Woche ab Montag. */
export function weekRangeLabel(weekStart: DateString): string {
  const start = parseDate(weekStart);
  const end = parseDate(addDays(weekStart, 6));
  const fmtDay = new Intl.DateTimeFormat('de-DE', { day: 'numeric' });
  const fmtFull = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' });
  if (start.getMonth() === end.getMonth()) {
    return `${fmtDay.format(start)}.–${fmtFull.format(end)}`;
  }
  return `${fmtFull.format(start)} – ${fmtFull.format(end)}`;
}

/** Häufige Übungen als Vorschläge beim Anlegen. */
export const COMMON_EXERCISES = [
  'Bankdrücken',
  'Schrägbankdrücken',
  'Kurzhantel-Bankdrücken',
  'Butterfly',
  'Dips',
  'Liegestütze',
  'Kniebeugen',
  'Frontkniebeugen',
  'Beinpresse',
  'Ausfallschritte',
  'Bulgarian Split Squats',
  'Beinstrecker',
  'Beinbeuger',
  'Rumänisches Kreuzheben',
  'Kreuzheben',
  'Hip Thrust',
  'Wadenheben',
  'Klimmzüge',
  'Latziehen',
  'Rudern (Langhantel)',
  'Rudern (Kabel)',
  'Kurzhantelrudern',
  'Face Pulls',
  'Schulterdrücken',
  'Military Press',
  'Seitheben',
  'Reverse Butterfly',
  'Bizepscurls',
  'Hammercurls',
  'Trizepsdrücken (Kabel)',
  'French Press',
  'Crunches',
  'Beinheben',
  'Plank',
];

export const WORKOUT_TEMPLATES: { name: string; exercises: string[] }[] = [
  { name: 'Push', exercises: ['Bankdrücken', 'Schulterdrücken', 'Schrägbankdrücken', 'Seitheben', 'Trizepsdrücken (Kabel)'] },
  { name: 'Pull', exercises: ['Klimmzüge', 'Rudern (Langhantel)', 'Latziehen', 'Face Pulls', 'Bizepscurls'] },
  { name: 'Beine', exercises: ['Kniebeugen', 'Rumänisches Kreuzheben', 'Beinpresse', 'Beinbeuger', 'Wadenheben'] },
  { name: 'Oberkörper', exercises: ['Bankdrücken', 'Rudern (Kabel)', 'Schulterdrücken', 'Latziehen', 'Bizepscurls', 'French Press'] },
  { name: 'Unterkörper', exercises: ['Kniebeugen', 'Kreuzheben', 'Ausfallschritte', 'Beinstrecker', 'Wadenheben'] },
  { name: 'Ganzkörper', exercises: ['Kniebeugen', 'Bankdrücken', 'Rudern (Langhantel)', 'Schulterdrücken', 'Plank'] },
];
