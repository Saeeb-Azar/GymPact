import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { FoodEntryRow, MealType } from '@/lib/database.types';
import { addDays, type DateString } from '@/lib/dates';
import { MEALS, groupByMeal, mealForHour, sumEntries } from '@/lib/nutrition';
import { useToday } from '@/hooks/useToday';
import {
  useCopyEntries,
  useDeleteFoodEntry,
  useFoodEntries,
  useNutritionGoals,
  useUpdateFoodEntry,
} from '@/hooks/nutrition';
import { errorMessage } from '@/hooks/queries';
import { DateSwitcher } from '@/components/DateSwitcher';
import { DaySummary } from '@/components/nutrition/DaySummary';
import { WaterCard } from '@/components/nutrition/WaterCard';
import { WeightCard } from '@/components/nutrition/WeightCard';
import { AddFoodSheet } from '@/components/nutrition/AddFoodSheet';
import { AmountPicker } from '@/components/nutrition/AmountPicker';
import { MealIcon } from '@/components/nutrition/MealIcon';
import { Button, PageTitle } from '@/components/ui/basics';
import { Sheet, listItem } from '@/components/ui/motion';
import { useToast } from '@/components/ui/toast';
import { IconCopy, IconPlus, IconTrash } from '@/components/icons';

export function NutritionPage() {
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? today;
  const setDate = (d: DateString) => setParams(d === today ? {} : { date: d }, { replace: true });

  const { data: goals } = useNutritionGoals();
  const { data: entries = [], isLoading, error } = useFoodEntries(date);
  const copy = useCopyEntries();
  const { showToast } = useToast();

  const [addMeal, setAddMeal] = useState<MealType | null>(null);
  const [editing, setEditing] = useState<FoodEntryRow | null>(null);

  const byMeal = groupByMeal(entries);
  const total = sumEntries(entries);

  const copyFromYesterday = async (meal?: MealType) => {
    try {
      const n = await copy.mutateAsync({ fromDate: addDays(date, -1), toDate: date, meal });
      showToast(n ? `${n} Einträge vom Vortag übernommen` : 'Am Vortag gibt es dazu keine Einträge', n ? 'success' : 'info');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  };

  return (
    <div className="space-y-4">
      <PageTitle eyebrow="Ernährung">Was isst du?</PageTitle>
      <DateSwitcher date={date} today={today} onChange={setDate} />

      {error && <p className="card p-4 text-sm text-rose-500">{errorMessage(error)}</p>}

      {goals ? <DaySummary total={total} goals={goals} /> : <div className="skeleton h-48" />}

      <div className="space-y-3">
        {MEALS.map((meal, idx) => {
          const list = byMeal[meal.id];
          const sum = sumEntries(list);
          return (
            <motion.section
              key={meal.id}
              className="card overflow-hidden"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * idx, type: 'spring', stiffness: 260, damping: 26 }}
            >
              <div className="flex items-center gap-3 p-4 pb-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-100 text-brand-600 dark:bg-white/[0.06] dark:text-brand-400">
                  <MealIcon meal={meal.id} size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg font-bold leading-tight">{meal.label}</h2>
                  <p className="text-xs muted num">
                    {list.length === 0 ? meal.hint : `${sum.kcal} kcal · ${sum.protein} g Protein`}
                  </p>
                </div>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setAddMeal(meal.id)}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-300 to-brand-500 text-surface-950 shadow-glow"
                  aria-label={`${meal.label}: Essen hinzufügen`}
                >
                  <IconPlus size={22} strokeWidth={2.4} />
                </motion.button>
              </div>

              {isLoading ? (
                <div className="px-4 pb-4">
                  <div className="skeleton h-10" />
                </div>
              ) : list.length > 0 ? (
                <ul className="border-t border-surface-200/70 dark:border-white/[0.05]">
                  <AnimatePresence initial={false}>
                    {list.map((e) => (
                      <motion.li key={e.id} layout {...listItem}>
                        <button
                          type="button"
                          disabled={e.id.startsWith('temp-')}
                          onClick={() => setEditing(e)}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-100/60 disabled:opacity-60 dark:hover:bg-white/[0.03]"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{e.name}</span>
                            <span className="block text-xs muted num">
                              {e.amount_g ? `${Number(e.amount_g)} g · ` : ''}P {Number(e.protein_g)} · K {Number(e.carbs_g)} · F {Number(e.fat_g)}
                            </span>
                          </span>
                          <span className="text-sm font-semibold num">{Math.round(Number(e.kcal))}</span>
                          <span className="text-[10px] muted">kcal</span>
                        </button>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              ) : (
                <div className="px-4 pb-3">
                  <button
                    type="button"
                    onClick={() => copyFromYesterday(meal.id)}
                    className="flex items-center gap-1.5 text-xs font-medium muted hover:text-brand-600 dark:hover:text-brand-400"
                  >
                    <IconCopy size={14} /> Wie gestern
                  </button>
                </div>
              )}
            </motion.section>
          );
        })}
      </div>

      {!isLoading && entries.length === 0 && (
        <Button variant="secondary" className="w-full" loading={copy.isPending} onClick={() => copyFromYesterday()}>
          <IconCopy size={18} /> Ganzen Vortag übernehmen
        </Button>
      )}

      <WaterCard date={date} goalMl={goals?.water_ml ?? 3000} />
      <WeightCard date={date} />

      <AddFoodSheet
        open={addMeal !== null}
        onClose={() => setAddMeal(null)}
        date={date}
        meal={addMeal ?? mealForHour(new Date().getHours())}
      />
      <EditEntrySheet entry={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function EditEntrySheet({ entry, onClose }: { entry: FoodEntryRow | null; onClose: () => void }) {
  const update = useUpdateFoodEntry();
  const del = useDeleteFoodEntry();
  const { showToast } = useToast();
  const amount = entry?.amount_g ? Number(entry.amount_g) : null;

  const remove = () => {
    if (!entry) return;
    del.mutate(entry, { onError: (err) => showToast(errorMessage(err), 'error') });
    onClose();
  };

  return (
    <Sheet open={!!entry} onClose={onClose} title="Eintrag bearbeiten">
      {entry && (
        <div className="space-y-5">
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
            {MEALS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() =>
                  entry.meal !== m.id &&
                  update.mutate(
                    { id: entry.id, meal: m.id },
                    { onSuccess: () => showToast(`Verschoben zu ${m.label}`, 'success') },
                  )
                }
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${
                  entry.meal === m.id
                    ? 'bg-surface-900 text-white dark:bg-white dark:text-surface-900'
                    : 'bg-surface-100 dark:bg-white/[0.06]'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <MealIcon meal={m.id} size={16} /> {m.label}
                </span>
              </button>
            ))}
          </div>

          {amount ? (
            <AmountPicker
              key={entry.id}
              food={{
                name: entry.name,
                kcal_100: (Number(entry.kcal) / amount) * 100,
                protein_100: Math.round((Number(entry.protein_g) / amount) * 1000) / 10,
                carbs_100: Math.round((Number(entry.carbs_g) / amount) * 1000) / 10,
                fat_100: Math.round((Number(entry.fat_g) / amount) * 1000) / 10,
              }}
              initialAmount={amount}
              submitLabel="Speichern"
              loading={update.isPending}
              onSubmit={(g, m) =>
                update.mutate(
                  { id: entry.id, amount_g: g, kcal: m.kcal, protein_g: m.protein, carbs_g: m.carbs, fat_g: m.fat },
                  {
                    onSuccess: () => {
                      showToast('Gespeichert', 'success');
                      onClose();
                    },
                    onError: (err) => showToast(errorMessage(err), 'error'),
                  },
                )
              }
            />
          ) : (
            <div className="rounded-2xl bg-surface-100 p-4 dark:bg-white/[0.04]">
              <p className="font-display text-lg font-bold">{entry.name}</p>
              <p className="text-sm muted num">
                {Math.round(Number(entry.kcal))} kcal · P {Number(entry.protein_g)} g · K {Number(entry.carbs_g)} g · F{' '}
                {Number(entry.fat_g)} g
              </p>
            </div>
          )}

          <Button variant="danger" className="w-full" onClick={remove}>
            <IconTrash size={18} /> Löschen
          </Button>
        </div>
      )}
    </Sheet>
  );
}
