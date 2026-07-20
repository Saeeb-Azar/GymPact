// Kalenderansicht der täglichen Erfüllung über den Challenge-Zeitraum.
// Farbe = Erfüllungsquote des Tages.

import { parseDate, toDateString, type DateString } from '@/lib/dates';
import type { DayCompletion } from '@/lib/stats';

interface CalendarGridProps {
  start: DateString;
  end: DateString;
  today: DateString;
  days: DayCompletion[];
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function cellClasses(day: DayCompletion | undefined, isFuture: boolean, isToday: boolean) {
  const ring = isToday ? ' ring-2 ring-brand-500 ring-offset-1 ring-offset-white dark:ring-offset-surface-850' : '';
  if (isFuture || !day) {
    return `bg-surface-100 dark:bg-surface-800${ring}`;
  }
  if (day.isFull) return `bg-brand-600 text-white${ring}`;
  if (day.ratio >= 0.5) return `bg-brand-400 text-white${ring}`;
  if (day.ratio > 0) return `bg-brand-200 dark:bg-brand-800${ring}`;
  return `bg-surface-200 dark:bg-surface-800${ring}`;
}

export function CalendarGrid({ start, end, today, days }: CalendarGridProps) {
  const byDate = new Map(days.map((d) => [d.date, d]));

  // Monate im Zeitraum ermitteln
  const months: { year: number; month: number }[] = [];
  const cursor = parseDate(start);
  cursor.setDate(1);
  const endDate = parseDate(end);
  while (cursor <= endDate) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return (
    <div className="space-y-5">
      {months.map(({ year, month }) => {
        const firstOfMonth = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        // Montag = 0
        const offset = (firstOfMonth.getDay() + 6) % 7;
        const monthLabel = new Intl.DateTimeFormat('de-DE', {
          month: 'long',
          year: 'numeric',
        }).format(firstOfMonth);

        return (
          <div key={`${year}-${month}`}>
            <h3 className="mb-2 text-sm font-semibold">{monthLabel}</h3>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((wd) => (
                <span
                  key={wd}
                  className="text-center text-[10px] font-medium text-surface-900/40 dark:text-surface-100/40"
                >
                  {wd}
                </span>
              ))}
              {Array.from({ length: offset }).map((_, i) => (
                <span key={`pad-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dateStr = toDateString(new Date(year, month, i + 1));
                const inRange = dateStr >= start && dateStr <= end;
                if (!inRange) {
                  return <span key={dateStr} className="aspect-square" />;
                }
                const day = byDate.get(dateStr);
                const isFuture = dateStr > today;
                const label = day
                  ? `${dateStr}: ${Math.round(day.ratio * 100)} % erfüllt`
                  : `${dateStr}: kein Eintrag`;
                return (
                  <span
                    key={dateStr}
                    title={label}
                    aria-label={label}
                    className={`flex aspect-square items-center justify-center rounded-lg text-[10px] font-medium tabular-nums ${cellClasses(day, isFuture, dateStr === today)}`}
                  >
                    {i + 1}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-3 text-[10px] text-surface-900/50 dark:text-surface-100/50">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-surface-200 dark:bg-surface-800" /> 0 %
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-brand-200 dark:bg-brand-800" /> teilweise
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-brand-400" /> ≥ 50 %
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-brand-600" /> 100 %
        </span>
      </div>
    </div>
  );
}
