import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateRange,
  diffDays,
  localDateString,
  parseDate,
  startOfWeek,
  toDateString,
  toTimeInputValue,
} from './dates';

describe('parse/format', () => {
  it('ist symmetrisch', () => {
    expect(toDateString(parseDate('2026-07-20'))).toBe('2026-07-20');
  });
});

describe('addDays', () => {
  it('addiert über Monatsgrenzen', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
  });
  it('subtrahiert über Jahresgrenzen', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('diffDays', () => {
  it('zählt ganze Tage', () => {
    expect(diffDays('2026-07-20', '2026-10-15')).toBe(87);
    expect(diffDays('2026-07-20', '2026-07-20')).toBe(0);
  });
  it('funktioniert über die Sommerzeit-Umstellung hinweg', () => {
    // Ende der Sommerzeit in Europa: 25.10.2026
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2);
  });
});

describe('dateRange', () => {
  it('liefert alle Tage inklusive der Grenzen', () => {
    expect(dateRange('2026-07-20', '2026-07-22')).toEqual([
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
    ]);
  });
  it('ist leer, wenn Ende vor Start liegt', () => {
    expect(dateRange('2026-07-22', '2026-07-20')).toEqual([]);
  });
});

describe('startOfWeek', () => {
  it('liefert den Montag der Woche', () => {
    expect(startOfWeek('2026-07-22')).toBe('2026-07-20'); // Mittwoch → Montag
    expect(startOfWeek('2026-07-20')).toBe('2026-07-20'); // Montag bleibt
    expect(startOfWeek('2026-07-26')).toBe('2026-07-20'); // Sonntag gehört zur Vorwoche
  });
});

describe('localDateString', () => {
  it('berücksichtigt die Zeitzone', () => {
    // 23:30 UTC am 20.07. ist in Tokio bereits der 21.07.
    const date = new Date('2026-07-20T23:30:00Z');
    expect(localDateString('Asia/Tokyo', date)).toBe('2026-07-21');
    expect(localDateString('Europe/Berlin', date)).toBe('2026-07-21'); // 01:30 am Folgetag
    expect(localDateString('America/Los_Angeles', date)).toBe('2026-07-20');
  });
});

describe('toTimeInputValue', () => {
  it('kürzt Sekunden weg', () => {
    expect(toTimeInputValue('18:00:00')).toBe('18:00');
    expect(toTimeInputValue('07:30')).toBe('07:30');
  });
});
