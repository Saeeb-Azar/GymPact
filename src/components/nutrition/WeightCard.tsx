import { useEffect, useState } from 'react';
import { formatDate, type DateString } from '@/lib/dates';
import { useDailyLog, useLatestWeight, useUpsertDailyLog } from '@/hooks/nutrition';
import { IconCheck, IconEdit, IconScale } from '../icons';
import { useToast } from '../ui/toast';

/**
 * Körpergewicht des Tages: ein Wert pro Datum. Nach dem Eintragen zeigt
 * die Karte Wert + Datum und sperrt das Feld – Korrigieren geht bewusst
 * nur über den Stift (einmal am Tag wiegen, Tippfehler bleiben fixbar).
 */
export function WeightCard({ date }: { date: DateString }) {
  const { data: log } = useDailyLog(date);
  const { data: latest } = useLatestWeight();
  const upsert = useUpsertDailyLog();
  const { showToast } = useToast();
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState(false);

  const saved = log?.body_weight_kg != null ? Number(log.body_weight_kg) : null;

  useEffect(() => {
    setValue(saved != null ? String(saved).replace('.', ',') : '');
    setEditing(false);
  }, [saved, date]);

  const save = () => {
    const trimmed = value.trim();
    const n = trimmed ? Number(trimmed.replace(',', '.')) : null;
    if (n !== null && (!Number.isFinite(n) || n < 20 || n > 400)) {
      showToast('Bitte ein Gewicht zwischen 20 und 400 kg eingeben', 'error');
      return;
    }
    if (n === saved) {
      setEditing(false);
      return;
    }
    upsert.mutate(
      { date, body_weight_kg: n },
      {
        onSuccess: () => {
          setEditing(false);
          if (n !== null) showToast(`Gewicht für ${formatDate(date)} gespeichert`, 'success');
        },
      },
    );
  };

  const locked = saved != null && !editing;

  return (
    <div className="card flex items-center gap-3 p-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#7a7fd1]/15 text-[#7a7fd1]">
        <IconScale size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Körpergewicht</p>
        <p className="text-xs muted">
          {locked
            ? `Eingetragen am ${formatDate(date)}`
            : latest && latest.date !== date
              ? `Zuletzt ${latest.kg.toLocaleString('de-DE')} kg am ${formatDate(latest.date)}`
              : 'Morgens nüchtern wiegen – 1× pro Tag'}
        </p>
      </div>

      {locked ? (
        <div className="flex items-center gap-2">
          <p className="font-display text-xl font-bold num">
            {saved.toLocaleString('de-DE')}
            <span className="ml-1 text-xs font-medium muted">kg</span>
          </p>
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white dark:bg-brand-500 dark:text-surface-950">
            <IconCheck size={12} strokeWidth={3} />
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Gewicht korrigieren"
            className="touch-target -mr-2 flex items-center justify-center rounded-full muted hover:text-surface-900 dark:hover:text-surface-100"
          >
            <IconEdit size={16} />
          </button>
        </div>
      ) : (
        <div className="relative w-28">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            inputMode="decimal"
            placeholder="–"
            autoFocus={editing}
            aria-label="Körpergewicht in kg"
            className="w-full rounded-xl border border-surface-200 bg-transparent py-2 pl-3 pr-9 text-right font-display text-lg font-bold num dark:border-white/10"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs muted">kg</span>
        </div>
      )}
    </div>
  );
}
