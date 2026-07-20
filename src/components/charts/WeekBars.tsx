// Balken für die Tageserfüllung der letzten Tage (0–100 %).

import { formatDateShort } from '@/lib/dates';
import type { DayCompletion } from '@/lib/stats';

export function WeekBars({ days }: { days: DayCompletion[] }) {
  if (days.length === 0) return null;
  return (
    <div className="flex items-end justify-between gap-1.5" role="img" aria-label="Tageserfüllung der letzten Tage">
      {days.map((day) => (
        <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[10px] tabular-nums text-surface-900/50 dark:text-surface-100/50">
            {Math.round(day.ratio * 100)}
          </span>
          <div className="flex h-24 w-full items-end overflow-hidden rounded-md bg-surface-100 dark:bg-surface-800">
            <div
              className={`w-full rounded-md transition-[height] duration-300 ${
                day.isFull ? 'bg-brand-500' : 'bg-brand-300 dark:bg-brand-700'
              }`}
              style={{ height: `${Math.max(day.ratio * 100, day.hasCheckin ? 4 : 0)}%` }}
            />
          </div>
          <span className="text-[10px] text-surface-900/50 dark:text-surface-100/50">
            {formatDateShort(day.date).split(',')[0]}
          </span>
        </div>
      ))}
    </div>
  );
}
