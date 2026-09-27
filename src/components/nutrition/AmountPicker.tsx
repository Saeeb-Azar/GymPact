import { useState } from 'react';
import { macrosForAmount, type Macros } from '@/lib/nutrition';
import { Button, Input } from '../ui/basics';
import { AnimatedNumber } from '../ui/motion';

export interface Per100 {
  name: string;
  brand?: string;
  kcal_100: number;
  protein_100: number;
  carbs_100: number;
  fat_100: number;
  default_amount_g?: number | null;
}

/** Menge wählen mit Live-Nährwerten. */
export function AmountPicker({
  food,
  initialAmount,
  submitLabel = 'Hinzufügen',
  loading,
  onSubmit,
  onBack,
}: {
  food: Per100;
  initialAmount?: number;
  submitLabel?: string;
  loading?: boolean;
  onSubmit: (amount: number, macros: Macros) => void;
  onBack?: () => void;
}) {
  const [amount, setAmount] = useState(String(initialAmount ?? food.default_amount_g ?? 100));
  const n = Math.max(0, Number(amount.replace(',', '.')) || 0);
  const m = macrosForAmount(food, n);
  const chips = [...new Set([food.default_amount_g ?? 100, 50, 100, 150, 200, 250].map(Number))].slice(0, 6);

  return (
    <div className="space-y-5">
      <div>
        <p className="font-display text-xl font-bold leading-tight">{food.name}</p>
        {food.brand && <p className="text-sm muted">{food.brand}</p>}
        <p className="mt-1 text-xs muted num">
          pro 100 g: {Math.round(food.kcal_100)} kcal · P {food.protein_100} · K {food.carbs_100} · F {food.fat_100}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onFocus={(e) => e.target.select()}
            className="pr-10 text-center font-display text-3xl font-bold"
            aria-label="Menge in Gramm"
            autoFocus
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 muted">g</span>
        </div>
      </div>
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setAmount(String(c))}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              n === c
                ? 'border-brand-500 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-surface-200 dark:border-white/10'
            }`}
          >
            {c} g
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <MacroTile label="kcal" value={m.kcal} color="#0fcb84" />
        <MacroTile label="Protein" value={m.protein} color="#8b5cf6" decimals={1} />
        <MacroTile label="Kohlenh." value={m.carbs} color="#d97706" decimals={1} />
        <MacroTile label="Fett" value={m.fat} color="#ec4899" decimals={1} />
      </div>

      <div className="flex gap-2">
        {onBack && (
          <Button variant="secondary" onClick={onBack} className="flex-1">
            Zurück
          </Button>
        )}
        <Button onClick={() => onSubmit(n, m)} disabled={n <= 0} loading={loading} className="flex-[2]">
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function MacroTile({
  label,
  value,
  color,
  decimals = 0,
}: {
  label: string;
  value: number;
  color: string;
  decimals?: number;
}) {
  return (
    <div className="rounded-2xl bg-surface-100 px-1 py-2.5 dark:bg-white/[0.04]">
      <div className="mx-auto mb-1 h-1 w-6 rounded-full" style={{ background: color }} />
      <AnimatedNumber value={value} decimals={decimals} className="block text-base font-bold" />
      <span className="text-[10px] muted">{label}</span>
    </div>
  );
}
