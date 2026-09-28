import { useState } from 'react';
import { addDays, formatDateShort, startOfWeek, type DateString } from '@/lib/dates';
import { WEEKDAYS } from '@/lib/training';

/**
 * Kalender-Heatmap (Wochen × Wochentage). Intensität 0..1 → eine Farbe,
 * hell → kräftig (sequenziell). Tippen zeigt den Tag darüber an.
 */
export function Heatmap({
  from,
  to,
  values,
  color = '#4d9e73',
  describe,
}: {
  from: DateString;
  to: DateString;
  values: Map<DateString, number>;
  color?: string;
  describe: (date: DateString, value: number) => string;
}) {
  const [sel, setSel] = useState<DateString | null>(null);
  const start = startOfWeek(from);
  const weeks: DateString[][] = [];
  for (let w = start; w <= to; w = addDays(w, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
  }
  const max = Math.max(1, ...values.values());

  return (
    <div>
      <p className="mb-2 min-h-[18px] text-xs muted">
        {sel ? describe(sel, values.get(sel) ?? 0) : 'Tippe auf einen Tag'}
      </p>
      <div className="flex gap-1.5">
        <div className="flex flex-col gap-1.5 pr-1">
          {WEEKDAYS.map((d, i) => (
            <span key={d} className="flex h-4 items-center text-[9px] muted">
              {i % 2 === 0 ? d : ''}
            </span>
          ))}
        </div>
        <div className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto">
          {weeks.map((week) => (
            <div key={week[0]} className="flex flex-col gap-1.5">
              {week.map((d) => {
                const v = values.get(d) ?? 0;
                const out = d < from || d > to;
                const t = v / max;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={out}
                    onClick={() => setSel(d)}
                    title={`${formatDateShort(d)}: ${describe(d, v)}`}
                    className={`h-4 w-4 rounded-[5px] transition-transform hover:scale-125 ${
                      out ? 'opacity-0' : v === 0 ? 'bg-surface-200 dark:bg-white/[0.06]' : ''
                    } ${sel === d ? 'ring-2 ring-surface-900 dark:ring-white' : ''}`}
                    style={
                      !out && v > 0
                        ? {
                            background: color,
                            opacity: 0.35 + t * 0.65,
                            boxShadow: t > 0.7 ? `0 0 8px ${color}99` : undefined,
                          }
                        : undefined
                    }
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
