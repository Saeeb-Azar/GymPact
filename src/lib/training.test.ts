import { describe, expect, it } from 'vitest';
import { bestSet, estimateOneRepMax, exerciseKey, isoWeek, summarizeSets, totalVolume, weekRangeLabel } from './training';
import { guessMuscle, muscleOf } from './muscles';

describe('Training', () => {
  it('Volumen = Σ Gewicht × Wdh.', () => {
    expect(totalVolume([{ weight_kg: 80, reps: 8 }, { weight_kg: 80, reps: 6 }])).toBe(1120);
  });
  it('Epley-1RM', () => {
    expect(estimateOneRepMax({ weight_kg: 100, reps: 1 })).toBe(100);
    expect(estimateOneRepMax({ weight_kg: 100, reps: 10 })).toBe(133.3);
    expect(estimateOneRepMax({ weight_kg: 0, reps: 10 })).toBe(0);
  });
  it('bester Satz nach 1RM', () => {
    const b = bestSet([
      { weight_kg: 100, reps: 3 },
      { weight_kg: 90, reps: 8 },
      { weight_kg: 120, reps: 0 },
    ]);
    expect(b).toEqual({ weight_kg: 90, reps: 8 });
  });
  it('Satz-Zusammenfassung', () => {
    expect(summarizeSets([{ weight_kg: 80, reps: 8 }, { weight_kg: 80, reps: 8 }, { weight_kg: 80, reps: 8 }])).toBe('3 × 8 @ 80 kg');
    expect(summarizeSets([{ weight_kg: 80, reps: 8 }, { weight_kg: 82.5, reps: 6 }])).toBe('80×8 · 82,5×6');
    expect(summarizeSets([{ weight_kg: 0, reps: 12 }])).toBe('1 × 12');
    expect(summarizeSets([])).toBe('Keine Sätze');
  });
  it('ISO-Kalenderwoche', () => {
    expect(isoWeek('2026-09-28')).toBe(40);
    expect(isoWeek('2026-01-01')).toBe(1);
    expect(isoWeek('2027-01-01')).toBe(53);
  });
  it('Wochen-Label', () => {
    expect(weekRangeLabel('2026-09-21')).toBe('21.–27. Sept.');
    expect(weekRangeLabel('2026-09-28')).toMatch(/28\. Sept\. – 4\. Okt\./);
  });
  it('exerciseKey normalisiert', () => {
    expect(exerciseKey('  Bank   Drücken ')).toBe('bank drücken');
  });
});

describe('Muskelgruppen', () => {
  it.each([
    ['Bankdrücken', 'chest'],
    ['Schrägbankdrücken', 'chest'],
    ['Klimmzüge', 'back'],
    ['Rudern (Kabel)', 'back'],
    ['Kniebeugen', 'quads'],
    ['Rumänisches Kreuzheben', 'hamstrings'],
    ['Beinbeuger', 'hamstrings'],
    ['Hammercurls', 'biceps'],
    ['Trizepsdrücken (Kabel)', 'triceps'],
    ['Seitheben', 'shoulders'],
    ['Face Pulls', 'shoulders'],
    ['Wadenheben', 'calves'],
    ['Hip Thrust', 'glutes'],
    ['Plank', 'abs'],
    ['Shrugs', 'traps'],
  ])('%s → %s', (name, muscle) => {
    expect(guessMuscle(name)).toBe(muscle);
  });
  it('gespeicherte Gruppe hat Vorrang', () => {
    expect(muscleOf({ name: 'Bankdrücken', muscle_group: 'triceps' })).toBe('triceps');
    expect(guessMuscle('Irgendwas')).toBeNull();
  });
});
