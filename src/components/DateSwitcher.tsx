import { motion } from 'framer-motion';
import { addDays, diffDays, formatDateShort, type DateString } from '@/lib/dates';
import { IconChevronLeft, IconChevronRight } from './icons';

export function relativeDayLabel(date: DateString, today: DateString): string {
  const d = diffDays(today, date);
  if (d === 0) return 'Heute';
  if (d === -1) return 'Gestern';
  if (d === 1) return 'Morgen';
  return formatDateShort(date);
}

/** Tag vor/zurück; nach rechts wischen = Vortag. */
export function DateSwitcher({
  date,
  today,
  onChange,
}: {
  date: DateString;
  today: DateString;
  onChange: (d: DateString) => void;
}) {
  return (
    <motion.div
      className="card flex items-center justify-between p-1.5"
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.25}
      onDragEnd={(_e, info) => {
        if (info.offset.x > 60) onChange(addDays(date, -1));
        else if (info.offset.x < -60 && date < today) onChange(addDays(date, 1));
      }}
    >
      <button
        type="button"
        onClick={() => onChange(addDays(date, -1))}
        className="touch-target flex items-center justify-center rounded-2xl hover:bg-surface-100 dark:hover:bg-white/5"
        aria-label="Vorheriger Tag"
      >
        <IconChevronLeft />
      </button>
      <button
        type="button"
        onClick={() => onChange(today)}
        className="flex flex-col items-center"
      >
        <span className="font-display text-base font-bold">{relativeDayLabel(date, today)}</span>
        {date !== today && <span className="text-[11px] text-brand-600 dark:text-brand-400">zurück zu heute</span>}
      </button>
      <button
        type="button"
        onClick={() => onChange(addDays(date, 1))}
        disabled={date >= today}
        className="touch-target flex items-center justify-center rounded-2xl hover:bg-surface-100 disabled:opacity-25 dark:hover:bg-white/5"
        aria-label="Nächster Tag"
      >
        <IconChevronRight />
      </button>
    </motion.div>
  );
}
