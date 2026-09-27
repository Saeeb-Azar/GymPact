import { describe, expect, it } from 'vitest';
import {
  dailyTotals,
  groupByMeal,
  isOnTarget,
  loggingStreak,
  macroEnergySplit,
  macrosForAmount,
  mealForHour,
  suggestGoals,
  sumEntries,
} from './nutrition';

const e = (date: string, meal: 'breakfast' | 'lunch' | 'dinner' | 'snack', kcal: number, p = 0) => ({
  date,
  meal,
  kcal,
  protein_g: p,
  carbs_g: 0,
  fat_g: 0,
});

describe('macrosForAmount', () => {
  it('rechnet von 100 g auf die Menge um', () => {
    const food = { kcal_100: 350, protein_100: 13.5, carbs_100: 58.7, fat_100: 7 };
    expect(macrosForAmount(food, 80)).toEqual({ kcal: 280, protein: 10.8, carbs: 47, fat: 5.6 });
  });
  it('negative Mengen zählen als 0', () => {
    expect(macrosForAmount({ kcal_100: 100, protein_100: 1, carbs_100: 1, fat_100: 1 }, -5).kcal).toBe(0);
  });
});

describe('sumEntries & groupByMeal', () => {
  it('summiert und rundet', () => {
    expect(sumEntries([e('2026-09-01', 'lunch', 100.4, 10.05), e('2026-09-01', 'dinner', 200.3, 5.1)])).toEqual({
      kcal: 301,
      protein: 15.2,
      carbs: 0,
      fat: 0,
    });
  });
  it('liefert immer alle vier Mahlzeiten', () => {
    const g = groupByMeal([e('2026-09-01', 'snack', 1)]);
    expect(Object.keys(g)).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
    expect(g.snack).toHaveLength(1);
  });
});

describe('dailyTotals', () => {
  it('füllt Tage ohne Einträge mit 0', () => {
    const t = dailyTotals([e('2026-09-02', 'lunch', 500)], ['2026-09-01', '2026-09-02']);
    expect(t[0]).toMatchObject({ logged: false, macros: { kcal: 0 } });
    expect(t[1]).toMatchObject({ logged: true, macros: { kcal: 500 } });
  });
});

describe('Ziele & Serien', () => {
  it('isOnTarget: ±10 % kcal und ≥90 % Protein', () => {
    const goals = { calories: 2000, protein_g: 150 };
    expect(isOnTarget({ kcal: 2150, protein: 140, carbs: 0, fat: 0 }, goals)).toBe(true);
    expect(isOnTarget({ kcal: 2300, protein: 160, carbs: 0, fat: 0 }, goals)).toBe(false);
    expect(isOnTarget({ kcal: 2000, protein: 120, carbs: 0, fat: 0 }, goals)).toBe(false);
  });
  it('loggingStreak ignoriert einen noch leeren heutigen Tag', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'];
    expect(loggingStreak(new Set(['2026-09-02', '2026-09-03']), days)).toBe(2);
    expect(loggingStreak(new Set(['2026-09-03', '2026-09-04']), days)).toBe(2);
    expect(loggingStreak(new Set(['2026-09-01']), days)).toBe(0);
  });
  it('macroEnergySplit rechnet mit 4/4/9 kcal', () => {
    const s = macroEnergySplit({ kcal: 0, protein: 100, carbs: 100, fat: 0 });
    expect(s.protein).toBeCloseTo(0.5);
    expect(macroEnergySplit({ kcal: 0, protein: 0, carbs: 0, fat: 0 }).fat).toBe(0);
  });
  it('mealForHour', () => {
    expect(mealForHour(8)).toBe('breakfast');
    expect(mealForHour(12)).toBe('lunch');
    expect(mealForHour(19)).toBe('dinner');
    expect(mealForHour(16)).toBe('snack');
  });
  it('suggestGoals liefert plausible Werte', () => {
    const g = suggestGoals({ sex: 'male', age: 30, heightCm: 180, weightKg: 80, activity: 1.55, goal: 'maintain' });
    expect(g.calories).toBe(2760);
    expect(g.protein_g).toBe(160);
    expect(g.fat_g).toBe(72);
    expect(g.carbs_g * 4 + g.protein_g * 4 + g.fat_g * 9).toBeLessThanOrEqual(g.calories + 4);
    const cut = suggestGoals({ sex: 'male', age: 30, heightCm: 180, weightKg: 80, activity: 1.55, goal: 'cut' });
    expect(cut.calories).toBeLessThan(g.calories);
  });
});
