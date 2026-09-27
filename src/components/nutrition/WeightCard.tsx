import { useEffect, useState } from 'react';
import type { DateString } from '@/lib/dates';
import { useDailyLog, useLatestWeight, useUpsertDailyLog } from '@/hooks/nutrition';
import { IconScale } from '../icons';
import { useToast } from '../ui/toast';

/** Körpergewicht des Tages (optional). */
export function WeightCard({ date }: { date: DateString }) {
  const { data: log } = useDailyLog(date);
  const { data: latest } = useLatestWeight();
  const upsert = useUpsertDailyLog();
  const { showToast } = useToast();
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue(log?.body_weight_kg != null ? String(log.body_weight_kg).replace('.', ',') : '');
  }, [log?.body_weight_kg, date]);

  const save = () => {
    const trimmed = value.trim();
    const n = trimmed ? Number(trimmed.replace(',', '.')) : null;
    if (n !== null && (!Number.isFinite(n) || n < 20 || n > 400)) {
      showToast('Bitte ein Gewicht zwischen 20 und 400 kg eingeben', 'error');
      return;
    }
    if (n === (log?.body_weight_kg ?? null)) return;
    upsert.mutate(
      { date, body_weight_kg: n },
      { onSuccess: () => n !== null && showToast('Gewicht gespeichert', 'success') },
    );
  };

  return (
    <div className="card flex items-center gap-3 p-4">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/15 text-violet-500">
        <IconScale size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Körpergewicht</p>
        <p className="text-xs muted">
          {latest && latest.date !== date
            ? `Zuletzt ${latest.kg.toLocaleString('de-DE')} kg`
            : 'Morgens nüchtern wiegen'}
        </p>
      </div>
      <div className="relative w-28">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          inputMode="decimal"
          placeholder="–"
          aria-label="Körpergewicht in kg"
          className="w-full rounded-xl border border-surface-200 bg-transparent py-2 pl-3 pr-9 text-right font-display text-lg font-bold num dark:border-white/10"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs muted">kg</span>
      </div>
    </div>
  );
}
