import { motion } from 'framer-motion';

/** Makro-Zeile: Name, Wert/Ziel und animierter Balken. */
export function MacroBar({
  label,
  value,
  goal,
  color,
  unit = 'g',
  compact = false,
}: {
  label: string;
  value: number;
  goal: number;
  color: string;
  unit?: string;
  compact?: boolean;
}) {
  const ratio = goal > 0 ? value / goal : 0;
  const pct = Math.min(100, ratio * 100);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`font-medium ${compact ? 'text-xs' : 'text-sm'}`}>{label}</span>
        <span className={`num muted ${compact ? 'text-[11px]' : 'text-xs'}`}>
          <span className="font-semibold text-surface-900 dark:text-surface-100">
            {Math.round(value)}
          </span>
          /{goal}
          {unit}
        </span>
      </div>
      <div
        className={`mt-1.5 overflow-hidden rounded-full bg-surface-200 dark:bg-white/[0.07] ${compact ? 'h-1.5' : 'h-2'}`}
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemax={goal}
        aria-label={label}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: color, boxShadow: `0 0 12px ${color}88` }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}
