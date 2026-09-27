import { motion } from 'framer-motion';
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays, dateRange, formatDateShort, parseDate, startOfWeek, type DateString } from '@/lib/dates';
import {
  MEALS,
  dailyTotals,
  entryMacros,
  isOnTarget,
  loggingStreak,
  macroEnergySplit,
  sumMacros,
} from '@/lib/nutrition';
import {
  WEEKDAYS,
  bestSet,
  estimateOneRepMax,
  exerciseKey,
  formatKg,
  isoWeek,
  totalVolume,
} from '@/lib/training';
import { MUSCLES, muscleOf } from '@/lib/muscles';
import type { MuscleGroup } from '@/lib/database.types';
import { useToday } from '@/hooks/useToday';
import { useDailyLogsRange, useFoodEntriesRange, useNutritionGoals } from '@/hooks/nutrition';
import { useTrainingHistory } from '@/hooks/training';
import { Bars3D } from '@/components/charts/Bars3D';
import { LineChart } from '@/components/charts/LineChart';
import { Donut3D } from '@/components/charts/Donut3D';
import { Heatmap } from '@/components/charts/Heatmap';
import { PageTitle, Select } from '@/components/ui/basics';
import { AnimatedNumber, Segmented, Stagger, staggerChild } from '@/components/ui/motion';
import { IconTrophy } from '@/components/icons';

type Tab = 'food' | 'training' | 'body';
type Range = '7' | '30' | '90';

export function StatsPage() {
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const tab = (['food', 'training', 'body'].includes(params.get('tab') ?? '') ? params.get('tab') : 'food') as Tab;
  const [range, setRange] = useState<Range>('30');
  const days = Number(range);
  const from = addDays(today, -(days - 1));

  return (
    <div className="space-y-4">
      <PageTitle eyebrow="Statistik">Dein Fortschritt</PageTitle>
      <Segmented
        value={tab}
        onChange={(t) => setParams(t === 'food' ? {} : { tab: t }, { replace: true })}
        options={[
          { value: 'food', label: '🍽️ Essen' },
          { value: 'training', label: '🏋️ Training' },
          { value: 'body', label: '⚖️ Körper' },
        ]}
      />
      <Segmented
        size="sm"
        value={range}
        onChange={setRange}
        options={[
          { value: '7', label: '7 Tage' },
          { value: '30', label: '30 Tage' },
          { value: '90', label: '90 Tage' },
        ]}
      />
      <motion.div key={`${tab}-${range}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {tab === 'food' && <FoodStats from={from} today={today} days={days} />}
        {tab === 'training' && <TrainingStats from={from} today={today} />}
        {tab === 'body' && <BodyStats from={from} today={today} />}
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------- Bausteine
function Kpi({ label, value, decimals = 0, suffix, hint }: { label: string; value: number; decimals?: number; suffix?: string; hint?: string }) {
  return (
    <motion.div variants={staggerChild} className="card p-4">
      <p className="text-xs font-medium muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">
        <AnimatedNumber value={value} decimals={decimals} />
        {suffix && <span className="ml-0.5 text-sm font-semibold muted">{suffix}</span>}
      </p>
      {hint && <p className="text-[11px] muted">{hint}</p>}
    </motion.div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <motion.section variants={staggerChild} className="card p-4">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {subtitle && <p className="text-xs muted">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </motion.section>
  );
}

const shortDay = (d: DateString) => `${parseDate(d).getDate()}.`;
const weekdayShort = (d: DateString) => WEEKDAYS[(parseDate(d).getDay() + 6) % 7];

/** Tage zu Wochen bündeln (Montag als Schlüssel). */
function weeksIn(from: DateString, to: DateString): DateString[] {
  const result: DateString[] = [];
  for (let w = startOfWeek(from); w <= to; w = addDays(w, 7)) result.push(w);
  return result;
}

// ---------------------------------------------------------------- Ernährung
function FoodStats({ from, today, days }: { from: DateString; today: DateString; days: number }) {
  const { data: goals } = useNutritionGoals();
  const { data: entries = [], isLoading } = useFoodEntriesRange(from, today);
  const { data: streakEntries = [] } = useFoodEntriesRange(addDays(today, -120), today);

  const range = dateRange(from, today);
  const totals = dailyTotals(entries, range);
  const logged = totals.filter((t) => t.logged);
  const avg = logged.length ? sumMacros(logged.map((t) => t.macros)) : null;
  const avgMacros = avg
    ? { kcal: avg.kcal / logged.length, protein: avg.protein / logged.length, carbs: avg.carbs / logged.length, fat: avg.fat / logged.length }
    : { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const onTarget = goals ? logged.filter((t) => isOnTarget(t.macros, goals)).length : 0;
  const streak = loggingStreak(new Set(streakEntries.map((e) => e.date)), dateRange(addDays(today, -120), today));
  const split = macroEnergySplit(avgMacros);

  const bars =
    days <= 7
      ? totals.map((t) => ({ key: t.date, label: weekdayShort(t.date), title: formatDateShort(t.date), value: t.macros.kcal }))
      : weeksIn(from, today).map((w) => {
          const inWeek = logged.filter((t) => t.date >= w && t.date <= addDays(w, 6));
          const avgK = inWeek.length ? inWeek.reduce((s, t) => s + t.macros.kcal, 0) / inWeek.length : 0;
          return { key: w, label: `KW${isoWeek(w)}`, title: `Ø KW ${isoWeek(w)} (${inWeek.length} Tage)`, value: avgK };
        });

  const mealAvg = MEALS.map((m) => {
    const kcal = entries.filter((e) => e.meal === m.id).reduce((s, e) => s + entryMacros(e).kcal, 0);
    return { ...m, kcal: logged.length ? kcal / logged.length : 0 };
  });
  const mealMax = Math.max(1, ...mealAvg.map((m) => m.kcal));

  if (isLoading) return <div className="skeleton h-96" />;

  return (
    <Stagger className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Ø Kalorien" value={avgMacros.kcal} suffix=" kcal" hint={goals ? `Ziel ${goals.calories}` : undefined} />
        <Kpi label="Ø Protein" value={avgMacros.protein} suffix=" g" hint={goals ? `Ziel ${goals.protein_g} g` : undefined} />
        <Kpi label="Tage im Ziel" value={onTarget} suffix={`/${logged.length}`} hint="±10 % kcal, ≥90 % Protein" />
        <Kpi label="Serie 🔥" value={streak} suffix=" Tage" hint="Tage in Folge getrackt" />
      </div>

      <ChartCard title="Kalorien" subtitle={days <= 7 ? 'pro Tag' : 'Ø pro Woche (getrackte Tage)'}>
        <Bars3D data={bars} goal={goals?.calories} unit="kcal" color="#0fcb84" />
      </ChartCard>

      <ChartCard title="Protein" subtitle="pro Tag, Linie = Ziel">
        <LineChart
          data={totals.map((t) => ({
            key: t.date,
            label: days <= 7 ? weekdayShort(t.date) : shortDay(t.date),
            title: formatDateShort(t.date),
            value: t.logged ? t.macros.protein : null,
          }))}
          goal={goals?.protein_g}
          color="#8b5cf6"
          unit="g"
        />
      </ChartCard>

      <ChartCard title="Makroverteilung" subtitle="Anteil an den Kalorien (Ø)">
        <Donut3D
          centerTop={Math.round(avgMacros.kcal).toLocaleString('de-DE')}
          centerBottom="Ø kcal"
          slices={[
            { key: 'p', label: 'Protein', value: split.protein, color: '#8b5cf6', detail: `${Math.round(avgMacros.protein)} g` },
            { key: 'c', label: 'Kohlenhydrate', value: split.carbs, color: '#d97706', detail: `${Math.round(avgMacros.carbs)} g` },
            { key: 'f', label: 'Fett', value: split.fat, color: '#ec4899', detail: `${Math.round(avgMacros.fat)} g` },
          ]}
        />
      </ChartCard>

      <ChartCard title="Mahlzeiten" subtitle="Ø Kalorien je Mahlzeit">
        <div className="space-y-3">
          {mealAvg.map((m, i) => (
            <div key={m.id} className="flex items-center gap-3">
              <span className="w-32 shrink-0 whitespace-nowrap text-sm">
                {m.emoji} {m.label}
              </span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-200 dark:bg-white/[0.07]">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-brand-300 to-brand-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${(m.kcal / mealMax) * 100}%` }}
                  transition={{ delay: 0.2 + i * 0.08, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <span className="w-12 text-right text-sm font-semibold num">{Math.round(m.kcal)}</span>
            </div>
          ))}
        </div>
      </ChartCard>

      <ChartCard title="Tracking-Kalender" subtitle="Je kräftiger, desto mehr Kalorien">
        <Heatmap
          from={from}
          to={today}
          values={new Map(totals.map((t) => [t.date, t.macros.kcal]))}
          describe={(d, v) => `${formatDateShort(d)} · ${v ? `${Math.round(v)} kcal` : 'nichts getrackt'}`}
        />
      </ChartCard>
    </Stagger>
  );
}

// ---------------------------------------------------------------- Training
function TrainingStats({ from, today }: { from: DateString; today: DateString }) {
  const { data: weeks = [], isLoading } = useTrainingHistory(startOfWeek(from));
  const { data: allWeeks = [] } = useTrainingHistory(addDays(startOfWeek(today), -7 * 104));

  const workouts = weeks.flatMap((w) => w.workouts.map((wo) => ({ ...wo, week_start: w.week_start })));
  const done = workouts.filter((w) => w.done_at);
  const allSets = workouts.flatMap((w) => w.workout_exercises.flatMap((e) => e.exercise_sets.filter((s) => s.reps > 0)));
  const volume = totalVolume(allSets);

  // Übungsverlauf über alle Wochen (für Fortschritt & PRs)
  const exerciseStats = useMemo(() => {
    const map = new Map<string, { name: string; points: Map<DateString, number>; best: number; bestLabel: string; count: number }>();
    for (const w of allWeeks) {
      for (const wo of w.workouts) {
        for (const e of wo.workout_exercises) {
          const b = bestSet(e.exercise_sets.filter((s) => s.reps > 0));
          if (!b) continue;
          const k = exerciseKey(e.name);
          const cur = map.get(k) ?? { name: e.name, points: new Map(), best: 0, bestLabel: '', count: 0 };
          const orm = estimateOneRepMax(b);
          cur.points.set(w.week_start, Math.max(cur.points.get(w.week_start) ?? 0, orm));
          cur.count++;
          if (orm > cur.best) {
            cur.best = orm;
            cur.bestLabel = `${formatKg(Number(b.weight_kg))} kg × ${b.reps}`;
          }
          map.set(k, cur);
        }
      }
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [allWeeks]);

  const [exKey, setExKey] = useState<string>('');
  const selectedKey = exKey || exerciseStats[0]?.[0] || '';
  const selected = exerciseStats.find(([k]) => k === selectedKey)?.[1];

  const weekList = weeksIn(from, today);
  const volBars = weekList.map((w) => {
    const wk = weeks.find((x) => x.week_start === w);
    const v = wk ? totalVolume(wk.workouts.flatMap((wo) => wo.workout_exercises.flatMap((e) => e.exercise_sets))) : 0;
    return { key: w, label: `KW${isoWeek(w)}`, title: `KW ${isoWeek(w)} · ${wk?.workouts.filter((x) => x.done_at).length ?? 0} Einheiten`, value: v / 1000 };
  });

  const trainingDays = new Map<DateString, number>();
  for (const w of done) {
    const d = new Intl.DateTimeFormat('en-CA').format(new Date(w.done_at!));
    trainingDays.set(d, (trainingDays.get(d) ?? 0) + totalVolume(w.workout_exercises.flatMap((e) => e.exercise_sets)) + 1);
  }

  const muscleSets = new Map<MuscleGroup, number>();
  for (const w of workouts)
    for (const e of w.workout_exercises) {
      const m = muscleOf(e);
      if (m) muscleSets.set(m, (muscleSets.get(m) ?? 0) + e.exercise_sets.filter((s) => s.reps > 0).length);
    }
  const muscleMax = Math.max(1, ...muscleSets.values());

  if (isLoading) return <div className="skeleton h-96" />;

  return (
    <Stagger className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Einheiten erledigt" value={done.length} suffix={`/${workouts.length}`} />
        <Kpi label="Volumen" value={volume / 1000} decimals={1} suffix=" t" hint="Gewicht × Wiederholungen" />
        <Kpi label="Sätze" value={allSets.length} />
        <Kpi label="Übungen" value={new Set(workouts.flatMap((w) => w.workout_exercises.map((e) => exerciseKey(e.name)))).size} hint="verschiedene" />
      </div>

      <ChartCard title="Volumen pro Woche" subtitle="in Tonnen">
        <Bars3D
          data={volBars}
          unit="t"
          color="#8b5cf6"
          format={(v) => v.toLocaleString('de-DE', { maximumFractionDigits: 1 })}
          emptyLabel="Noch keine Trainingsdaten"
        />
      </ChartCard>

      <ChartCard title="Kraftentwicklung" subtitle="Geschätztes 1RM pro Woche (bester Satz)">
        {exerciseStats.length === 0 ? (
          <p className="py-6 text-center text-sm muted">Sobald du Sätze einträgst, siehst du hier deinen Fortschritt.</p>
        ) : (
          <>
            <Select value={selectedKey} onChange={(e) => setExKey(e.target.value)} className="mb-3 py-2.5 text-sm">
              {exerciseStats.map(([k, s]) => (
                <option key={k} value={k}>
                  {s.name}
                </option>
              ))}
            </Select>
            {selected && (
              <LineChart
                data={[...selected.points.entries()]
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .slice(-16)
                  .map(([w, v]) => ({ key: w, label: `KW${isoWeek(w)}`, title: `KW ${isoWeek(w)}`, value: v }))}
                color="#0fcb84"
                unit="kg"
                decimals={1}
              />
            )}
          </>
        )}
      </ChartCard>

      {exerciseStats.length > 0 && (
        <ChartCard title="Bestleistungen" subtitle="Höchstes geschätztes 1RM je Übung">
          <ul className="space-y-2">
            {[...exerciseStats]
              .sort((a, b) => b[1].best - a[1].best)
              .slice(0, 6)
              .map(([k, s], i) => (
                <motion.li
                  key={k}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  className="flex items-center gap-3 rounded-2xl bg-surface-100 px-3 py-2.5 dark:bg-white/[0.04]"
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                      i === 0 ? 'bg-amber-400/25 text-amber-500' : 'bg-surface-200 muted dark:bg-white/[0.06]'
                    }`}
                  >
                    <IconTrophy size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{s.name}</span>
                    <span className="block text-xs muted">{s.bestLabel}</span>
                  </span>
                  <span className="font-display text-lg font-bold num">
                    {formatKg(s.best)}
                    <span className="text-xs font-medium muted"> kg</span>
                  </span>
                </motion.li>
              ))}
          </ul>
        </ChartCard>
      )}

      <ChartCard title="Muskelgruppen" subtitle="Sätze im Zeitraum">
        <div className="space-y-2.5">
          {MUSCLES.filter((m) => muscleSets.has(m.id))
            .sort((a, b) => (muscleSets.get(b.id) ?? 0) - (muscleSets.get(a.id) ?? 0))
            .map((m, i) => (
              <div key={m.id} className="flex items-center gap-3">
                <span className="w-24 truncate text-sm">{m.label}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-200 dark:bg-white/[0.07]">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-violet-400 to-violet-600"
                    initial={{ width: 0 }}
                    animate={{ width: `${((muscleSets.get(m.id) ?? 0) / muscleMax) * 100}%` }}
                    transition={{ delay: 0.2 + i * 0.05, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
                <span className="w-8 text-right text-sm font-semibold num">{muscleSets.get(m.id)}</span>
              </div>
            ))}
          {muscleSets.size === 0 && <p className="py-4 text-center text-sm muted">Noch keine Daten.</p>}
        </div>
      </ChartCard>

      <ChartCard title="Trainingstage" subtitle="Abgeschlossene Einheiten">
        <Heatmap
          from={from}
          to={today}
          color="#8b5cf6"
          values={trainingDays}
          describe={(d, v) => `${formatDateShort(d)} · ${v ? 'trainiert 💪' : 'kein Training'}`}
        />
      </ChartCard>
    </Stagger>
  );
}

// ---------------------------------------------------------------- Körper
function BodyStats({ from, today }: { from: DateString; today: DateString }) {
  const { data: logs = [], isLoading } = useDailyLogsRange(from, today);
  const { data: goals } = useNutritionGoals();
  const weights = logs.filter((l) => l.body_weight_kg != null);
  const first = weights[0];
  const last = weights[weights.length - 1];
  const delta = first && last ? Number(last.body_weight_kg) - Number(first.body_weight_kg) : 0;
  const waterDays = logs.filter((l) => l.water_ml > 0);
  const avgWater = waterDays.length ? waterDays.reduce((s, l) => s + l.water_ml, 0) / waterDays.length : 0;
  const range = dateRange(from, today);
  const byDate = new Map(logs.map((l) => [l.date, l]));

  if (isLoading) return <div className="skeleton h-96" />;

  return (
    <Stagger className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Aktuell" value={last ? Number(last.body_weight_kg) : 0} decimals={1} suffix=" kg" />
        <Kpi label="Veränderung" value={delta} decimals={1} suffix=" kg" hint={first ? `seit ${formatDateShort(first.date)}` : 'keine Daten'} />
        <Kpi label="Ø Wasser" value={avgWater / 1000} decimals={1} suffix=" l" hint={goals ? `Ziel ${(goals.water_ml / 1000).toLocaleString('de-DE')} l` : undefined} />
        <Kpi label="Wiegungen" value={weights.length} hint="im Zeitraum" />
      </div>

      <ChartCard title="Körpergewicht" subtitle="kg">
        <LineChart
          data={range.map((d) => ({
            key: d,
            label: shortDay(d),
            title: formatDateShort(d),
            value: byDate.get(d)?.body_weight_kg != null ? Number(byDate.get(d)!.body_weight_kg) : null,
          }))}
          color="#8b5cf6"
          unit="kg"
          decimals={1}
          emptyLabel="Trag dein Gewicht unter „Essen“ ein"
        />
      </ChartCard>

      <ChartCard title="Wasser" subtitle="Liter pro Tag">
        <Bars3D
          data={(range.length > 14 ? range.slice(-14) : range).map((d) => ({
            key: d,
            label: range.length > 7 ? shortDay(d) : weekdayShort(d),
            title: formatDateShort(d),
            value: (byDate.get(d)?.water_ml ?? 0) / 1000,
          }))}
          goal={goals ? goals.water_ml / 1000 : undefined}
          unit="l"
          color="#38bdf8"
          format={(v) => v.toLocaleString('de-DE', { maximumFractionDigits: 2 })}
        />
      </ChartCard>
    </Stagger>
  );
}
