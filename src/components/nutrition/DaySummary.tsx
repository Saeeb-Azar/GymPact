import type { Goals } from '@/hooks/nutrition';
import type { Macros } from '@/lib/nutrition';
import { MacroBar } from '../charts/MacroBar';
import { Ring } from '../charts/Ring';
import { AnimatedNumber, TiltCard } from '../ui/motion';

/** Kalorienring + Makro-Balken für einen Tag. */
export function DaySummary({ total, goals }: { total: Macros; goals: Goals }) {
  const remaining = goals.calories - total.kcal;
  const over = remaining < 0;
  return (
    <TiltCard className="card overflow-hidden p-5" max={6}>
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-400/20 blur-3xl"
      />
      <div className="flex items-center gap-5">
        <Ring value={total.kcal} max={goals.calories} size={150} stroke={14} label="Kalorien heute">
          <AnimatedNumber
            value={Math.abs(remaining)}
            className={`font-display text-3xl font-bold ${over ? 'text-rose-500' : ''}`}
          />
          <span className="text-[11px] muted">{over ? 'kcal drüber' : 'kcal übrig'}</span>
        </Ring>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <span className="block text-[11px] muted">Gegessen / Ziel</span>
            <span className="block whitespace-nowrap text-sm font-semibold num">
              {total.kcal.toLocaleString('de-DE')}
              <span className="font-normal muted"> / {goals.calories.toLocaleString('de-DE')} kcal</span>
            </span>
          </div>
          <MacroBar label="Protein" value={total.protein} goal={goals.protein_g} color="#8b5cf6" compact />
          <MacroBar label="Kohlenhydrate" value={total.carbs} goal={goals.carbs_g} color="#d97706" compact />
          <MacroBar label="Fett" value={total.fat} goal={goals.fat_g} color="#ec4899" compact />
        </div>
      </div>
    </TiltCard>
  );
}
