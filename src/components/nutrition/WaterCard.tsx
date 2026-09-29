import { motion } from 'framer-motion';
import type { DateString } from '@/lib/dates';
import { useDailyLog, useUpsertDailyLog } from '@/hooks/nutrition';
import { IconDrop } from '../icons';
import { AnimatedNumber } from '../ui/motion';

const GLASS = 250;

/** Wasser in 250-ml-Gläsern; Tippen auf ein Glas füllt bis dorthin. */
export function WaterCard({ date, goalMl }: { date: DateString; goalMl: number }) {
  const { data: log } = useDailyLog(date);
  const upsert = useUpsertDailyLog();
  const ml = log?.water_ml ?? 0;
  const glasses = Math.max(8, Math.ceil(goalMl / GLASS));
  const filled = Math.round(ml / GLASS);
  const set = (v: number) => upsert.mutate({ date, water_ml: Math.max(0, Math.min(20000, v)) });

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-water/15 text-water">
            <IconDrop size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold">Wasser</p>
            <p className="text-xs muted num">
              <AnimatedNumber value={ml / 1000} decimals={2} /> / {(goalMl / 1000).toLocaleString('de-DE')} l
            </p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => set(ml - GLASS)}
            disabled={ml <= 0}
            className="touch-target flex items-center justify-center rounded-xl bg-surface-100 text-lg font-bold disabled:opacity-30 dark:bg-white/[0.06]"
            aria-label="Ein Glas weniger"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => set(ml + GLASS)}
            className="touch-target flex items-center justify-center rounded-xl bg-water/20 px-3 text-sm font-bold text-sky-600 dark:text-water"
          >
            +250 ml
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {Array.from({ length: glasses }, (_, i) => {
          const full = i < filled;
          return (
            <motion.button
              key={i}
              type="button"
              whileTap={{ scale: 0.85 }}
              onClick={() => set((full && i === filled - 1 ? i : i + 1) * GLASS)}
              className="relative h-9 w-7 overflow-hidden rounded-b-lg rounded-t-sm border-2 border-water/40"
              aria-label={`${i + 1} Gläser`}
            >
              <motion.span
                className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-water to-water/70"
                initial={false}
                animate={{ height: full ? '100%' : '0%' }}
                transition={{ type: 'spring', stiffness: 200, damping: 20, delay: full ? i * 0.02 : 0 }}
              />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
