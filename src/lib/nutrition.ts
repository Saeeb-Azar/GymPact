// Ernährungs-Fachlogik: Mahlzeiten, Makro-Berechnung, Tagessummen,
// Bedarfsrechner. Rein funktional und getestet (nutrition.test.ts).

import type { FoodEntryRow, FoodRow, MealType, NutritionGoalsRow } from './database.types';
import type { DateString } from './dates';

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const EMPTY_MACROS: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export const MEALS: { id: MealType; label: string; emoji: string; hint: string }[] = [
  { id: 'breakfast', label: 'Frühstück', emoji: '🥣', hint: 'Guter Start in den Tag' },
  { id: 'lunch', label: 'Mittagessen', emoji: '🍛', hint: 'Energie für den Nachmittag' },
  { id: 'dinner', label: 'Abendessen', emoji: '🥩', hint: 'Regeneration über Nacht' },
  { id: 'snack', label: 'Snacks', emoji: '🍌', hint: 'Shakes, Riegel, Obst …' },
];

export const MEAL_LABEL: Record<MealType, string> = Object.fromEntries(
  MEALS.map((m) => [m.id, m.label]),
) as Record<MealType, string>;

/** Vorschlag für die Mahlzeit nach Uhrzeit. */
export function mealForHour(hour: number): MealType {
  if (hour >= 4 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snack';
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Nährwerte eines Lebensmittels für eine Menge in Gramm. */
export function macrosForAmount(
  food: Pick<FoodRow, 'kcal_100' | 'protein_100' | 'carbs_100' | 'fat_100'>,
  amountG: number,
): Macros {
  const f = Math.max(0, amountG) / 100;
  return {
    kcal: Math.round(Number(food.kcal_100) * f),
    protein: round1(Number(food.protein_100) * f),
    carbs: round1(Number(food.carbs_100) * f),
    fat: round1(Number(food.fat_100) * f),
  };
}

export function entryMacros(
  e: Pick<FoodEntryRow, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'>,
): Macros {
  return {
    kcal: Number(e.kcal),
    protein: Number(e.protein_g),
    carbs: Number(e.carbs_g),
    fat: Number(e.fat_g),
  };
}

export function sumMacros(list: Macros[]): Macros {
  const total = list.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
    }),
    { ...EMPTY_MACROS },
  );
  return {
    kcal: Math.round(total.kcal),
    protein: round1(total.protein),
    carbs: round1(total.carbs),
    fat: round1(total.fat),
  };
}

export function sumEntries(
  entries: Pick<FoodEntryRow, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'>[],
): Macros {
  return sumMacros(entries.map(entryMacros));
}

/** Einträge nach Mahlzeit gruppieren (alle vier Mahlzeiten immer vorhanden). */
export function groupByMeal<T extends Pick<FoodEntryRow, 'meal'>>(
  entries: T[],
): Record<MealType, T[]> {
  const result: Record<MealType, T[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
  for (const e of entries) result[e.meal].push(e);
  return result;
}

/** Tagessummen je Datum für einen Zeitraum (Tage ohne Einträge = 0). */
export function dailyTotals(
  entries: Pick<FoodEntryRow, 'date' | 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'>[],
  days: DateString[],
): { date: DateString; macros: Macros; logged: boolean }[] {
  const byDate = new Map<DateString, Macros[]>();
  for (const e of entries) {
    const list = byDate.get(e.date) ?? [];
    list.push(entryMacros(e));
    byDate.set(e.date, list);
  }
  return days.map((date) => {
    const list = byDate.get(date);
    return { date, macros: list ? sumMacros(list) : { ...EMPTY_MACROS }, logged: !!list };
  });
}

/** Kalorienanteile der Makros (Protein/Kohlenhydrate 4 kcal/g, Fett 9 kcal/g). */
export function macroEnergySplit(m: Macros): { protein: number; carbs: number; fat: number } {
  const p = m.protein * 4;
  const c = m.carbs * 4;
  const f = m.fat * 9;
  const total = p + c + f;
  if (total <= 0) return { protein: 0, carbs: 0, fat: 0 };
  return { protein: p / total, carbs: c / total, fat: f / total };
}

/** Ziel erreicht = innerhalb ±10 % der Kalorien und Protein mind. 90 %. */
export function isOnTarget(m: Macros, goals: Pick<NutritionGoalsRow, 'calories' | 'protein_g'>) {
  if (m.kcal <= 0) return false;
  const kcalOk = Math.abs(m.kcal - goals.calories) <= goals.calories * 0.1;
  const proteinOk = m.protein >= goals.protein_g * 0.9;
  return kcalOk && proteinOk;
}

/** Aufeinanderfolgende Tage mit Einträgen, rückwärts ab heute (heute darf noch leer sein). */
export function loggingStreak(loggedDates: Set<DateString>, days: DateString[]): number {
  // days: aufsteigend sortiert, letzter Eintrag = heute
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (loggedDates.has(days[i])) streak++;
    else if (i === days.length - 1) continue;
    else break;
  }
  return streak;
}

// ---------------------------------------------------------------- Bedarfsrechner
export type Sex = 'male' | 'female';
export type GoalType = 'cut' | 'maintain' | 'bulk';

export const ACTIVITY_LEVELS = [
  { factor: 1.2, label: 'Kaum aktiv', hint: 'Bürojob, wenig Bewegung' },
  { factor: 1.375, label: 'Leicht aktiv', hint: '1–3× Training/Woche' },
  { factor: 1.55, label: 'Aktiv', hint: '3–5× Training/Woche' },
  { factor: 1.725, label: 'Sehr aktiv', hint: '6–7× Training/Woche' },
  { factor: 1.9, label: 'Extrem aktiv', hint: 'Körperliche Arbeit + Training' },
] as const;

export interface CalculatorInput {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: number;
  goal: GoalType;
}

/** Mifflin-St-Jeor-Grundumsatz × Aktivität, angepasst ans Ziel; Makros daraus. */
export function suggestGoals(input: CalculatorInput): Omit<NutritionGoalsRow, 'user_id' | 'updated_at'> {
  const bmr =
    10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + (input.sex === 'male' ? 5 : -161);
  const tdee = bmr * input.activity;
  const adjust = input.goal === 'cut' ? 0.8 : input.goal === 'bulk' ? 1.1 : 1;
  const calories = Math.round((tdee * adjust) / 10) * 10;
  const protein = Math.round(input.weightKg * (input.goal === 'cut' ? 2.2 : 2.0));
  const fat = Math.round(input.weightKg * 0.9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  const water = Math.round((input.weightKg * 35) / 250) * 250;
  return { calories, protein_g: protein, carbs_g: carbs, fat_g: fat, water_ml: water };
}

export const DEFAULT_GOALS: Omit<NutritionGoalsRow, 'user_id' | 'updated_at'> = {
  calories: 2500,
  protein_g: 160,
  carbs_g: 280,
  fat_g: 80,
  water_ml: 3000,
};
