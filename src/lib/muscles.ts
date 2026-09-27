// Muskelgruppen für das 3D-Körpermodell: Namen, Seite, automatische
// Erkennung aus dem Übungsnamen und Übungsideen je Gruppe.

import type { MuscleGroup } from './database.types';

export interface MuscleInfo {
  id: MuscleGroup;
  label: string;
  /** Welche Seite der Figur zeigt den Muskel am besten? */
  side: 'front' | 'back';
  ideas: string[];
}

export const MUSCLES: MuscleInfo[] = [
  { id: 'chest', label: 'Brust', side: 'front', ideas: ['Bankdrücken', 'Schrägbankdrücken', 'Kurzhantel-Bankdrücken', 'Butterfly', 'Dips', 'Liegestütze'] },
  { id: 'shoulders', label: 'Schultern', side: 'front', ideas: ['Schulterdrücken', 'Military Press', 'Seitheben', 'Frontheben', 'Arnold Press'] },
  { id: 'biceps', label: 'Bizeps', side: 'front', ideas: ['Bizepscurls', 'Hammercurls', 'Scottcurls', 'Kabelcurls'] },
  { id: 'forearms', label: 'Unterarme', side: 'front', ideas: ['Unterarmcurls', 'Farmer’s Walk', 'Reverse Curls'] },
  { id: 'abs', label: 'Bauch', side: 'front', ideas: ['Crunches', 'Beinheben', 'Plank', 'Cable Crunches', 'Russian Twists'] },
  { id: 'quads', label: 'Beinstrecker', side: 'front', ideas: ['Kniebeugen', 'Beinpresse', 'Beinstrecker', 'Ausfallschritte', 'Bulgarian Split Squats', 'Frontkniebeugen'] },
  { id: 'calves', label: 'Waden', side: 'back', ideas: ['Wadenheben', 'Wadenheben sitzend'] },
  { id: 'traps', label: 'Nacken', side: 'back', ideas: ['Shrugs', 'Face Pulls', 'Aufrechtes Rudern'] },
  { id: 'back', label: 'Rücken', side: 'back', ideas: ['Klimmzüge', 'Latziehen', 'Rudern (Langhantel)', 'Rudern (Kabel)', 'Kurzhantelrudern', 'Kreuzheben'] },
  { id: 'triceps', label: 'Trizeps', side: 'back', ideas: ['Trizepsdrücken (Kabel)', 'French Press', 'Dips', 'Overhead Extensions'] },
  { id: 'glutes', label: 'Po', side: 'back', ideas: ['Hip Thrust', 'Glute Bridge', 'Rumänisches Kreuzheben', 'Kickbacks'] },
  { id: 'hamstrings', label: 'Beinbeuger', side: 'back', ideas: ['Beinbeuger', 'Rumänisches Kreuzheben', 'Nordic Curls'] },
];

export const MUSCLE_BY_ID: Record<MuscleGroup, MuscleInfo> = Object.fromEntries(
  MUSCLES.map((m) => [m.id, m]),
) as Record<MuscleGroup, MuscleInfo>;

// Reihenfolge zählt: spezifische Muster vor allgemeinen.
const RULES: [RegExp, MuscleGroup][] = [
  [/waden|calf|calves/, 'calves'],
  [/shrug|nacken|trap|aufrechtes rudern|upright/, 'traps'],
  [/face ?pull|reverse butterfly|reverse fly|rear delt/, 'shoulders'],
  [/trizeps|tricep|french|skull|overhead ext|kickback.*(arm|trizeps)|pushdown|dips/, 'triceps'],
  [/hammer|bizeps|bicep|curl(?!.*(bein|leg|nordic))|scott/, 'biceps'],
  [/unterarm|forearm|wrist|farmer/, 'forearms'],
  [/beinbeuger|leg curl|hamstring|nordic|rumänisch|romanian|rdl|stiff/, 'hamstrings'],
  [/hip ?thrust|glute|po\b|kickback|bridge/, 'glutes'],
  [/kniebeug|squat|beinpresse|leg press|beinstrecker|leg ext|ausfallschritt|lunge|split|step ?up|hack/, 'quads'],
  [/bank|bench|brust|chest|butterfly|fly|flys|liegestütz|push ?up|pec/, 'chest'],
  [/schulter|shoulder|military|overhead press|ohp|seitheben|lateral|frontheben|arnold|delt/, 'shoulders'],
  [/klimmz|pull ?up|chin|lat|rudern|row|rücken|back|kreuzheben|deadlift|hyperext/, 'back'],
  [/bauch|crunch|plank|sit ?up|beinheben|leg raise|twist|abs|core|ab wheel/, 'abs'],
];

/** Muskelgruppe aus dem Übungsnamen raten (null = unbekannt). */
export function guessMuscle(name: string): MuscleGroup | null {
  const n = name.toLowerCase();
  for (const [re, m] of RULES) if (re.test(n)) return m;
  return null;
}

/** Gespeicherte Gruppe hat Vorrang, sonst automatische Erkennung. */
export function muscleOf(e: { name: string; muscle_group?: MuscleGroup | null }): MuscleGroup | null {
  return e.muscle_group ?? guessMuscle(e.name);
}
