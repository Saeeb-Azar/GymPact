import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addDays, dateRange, formatDate, parseDate, startOfWeek } from '@/lib/dates';
import { dailyTotals, mealForHour, sumEntries } from '@/lib/nutrition';
import { WEEKDAYS, isoWeek, totalVolume } from '@/lib/training';
import { useToday } from '@/hooks/useToday';
import { useProfile } from '@/hooks/queries';
import {
  useDailyLogsRange,
  useFoodEntries,
  useFoodEntriesRange,
  useNutritionGoals,
} from '@/hooks/nutrition';
import { useTrainingWeek } from '@/hooks/training';
import { DaySummary } from '@/components/nutrition/DaySummary';
import { WaterCard } from '@/components/nutrition/WaterCard';
import { Stagger, staggerChild } from '@/components/ui/motion';
import { IconBody, IconCheck, IconChevronRight, IconDumbbell, IconFood } from '@/components/icons';

function greeting(hour: number) {
  if (hour < 5) return 'Noch wach';
  if (hour < 11) return 'Guten Morgen';
  if (hour < 17) return 'Hey';
  if (hour < 22) return 'Guten Abend';
  return 'Gute Nacht';
}

export function HomePage() {
  const today = useToday();
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { data: goals } = useNutritionGoals();
  const { data: entries = [] } = useFoodEntries(today);
  const weekStart = startOfWeek(today);
  const { data: week } = useTrainingWeek(weekStart);
  const from = addDays(today, -6);
  const { data: rangeEntries = [] } = useFoodEntriesRange(from, today);
  const { data: logs = [] } = useDailyLogsRange(addDays(today, -29), today);

  const hour = new Date().getHours();
  const name = profile?.display_name?.split(' ')[0] ?? '';
  const total = sumEntries(entries);
  const days = dailyTotals(rangeEntries, dateRange(from, today));
  const maxKcal = Math.max(goals?.calories ?? 1, ...days.map((d) => d.macros.kcal));
  const weekdayIdx = (parseDate(today).getDay() + 6) % 7 + 1;

  const workouts = week?.workouts ?? [];
  const todays =
    workouts.find((w) => w.day_of_week === weekdayIdx && !w.done_at) ??
    workouts.find((w) => !w.done_at && (w.day_of_week ?? 8) >= weekdayIdx) ??
    workouts.find((w) => !w.done_at);
  const doneCount = workouts.filter((w) => w.done_at).length;
  const weekVol = totalVolume(workouts.flatMap((w) => w.workout_exercises.flatMap((e) => e.exercise_sets)));

  const weights = logs.filter((l) => l.body_weight_kg != null);
  const lastWeight = weights[weights.length - 1];
  const firstWeight = weights[0];
  const weightDelta =
    lastWeight && firstWeight && lastWeight !== firstWeight
      ? Number(lastWeight.body_weight_kg) - Number(firstWeight.body_weight_kg)
      : null;

  return (
    <Stagger className="space-y-4">
      <motion.div variants={staggerChild}>
        <p className="text-sm muted">{formatDate(today)}</p>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {greeting(hour)}
          {name && (
            <>
              , <span className="text-gradient">{name}</span>
            </>
          )}
        </h1>
      </motion.div>

      <motion.div variants={staggerChild}>
        <Link to="/nutrition" className="block">
          {goals ? <DaySummary total={total} goals={goals} /> : <div className="skeleton h-48" />}
        </Link>
      </motion.div>

      <motion.div variants={staggerChild} className="grid grid-cols-2 gap-3">
        <QuickAction
          to={`/nutrition`}
          icon={<IconFood size={22} />}
          title="Essen eintragen"
          sub={`Als ${{ breakfast: 'Frühstück', lunch: 'Mittagessen', dinner: 'Abendessen', snack: 'Snack' }[mealForHour(hour)]}`}
          gradient="from-amber-400/25 to-pink-500/20"
        />
        <QuickAction
          to="/training?view=body"
          icon={<IconBody size={22} />}
          title="Muskelkarte"
          sub="Muskeln & Übungen"
          gradient="from-violet-500/25 to-sky-400/20"
        />
      </motion.div>

      <motion.div variants={staggerChild}>
        <button
          type="button"
          onClick={() => navigate(todays ? `/training/workout/${todays.id}` : '/training')}
          className="card relative block w-full overflow-hidden p-5 text-left"
        >
          <div aria-hidden className="pointer-events-none absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="relative flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400 to-violet-600 text-white shadow-lg shadow-violet-500/30">
              <IconDumbbell size={28} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-500">
                KW {isoWeek(today)} · {doneCount}/{workouts.length} erledigt
              </p>
              <p className="truncate font-display text-xl font-bold">
                {todays ? todays.name : workouts.length ? 'Alle Einheiten erledigt' : 'Plan für diese Woche anlegen'}
              </p>
              <p className="truncate text-sm muted">
                {todays
                  ? `${todays.day_of_week ? WEEKDAYS[todays.day_of_week - 1] + ' · ' : ''}${todays.workout_exercises.length} Übungen`
                  : weekVol > 0
                    ? `${weekVol.toLocaleString('de-DE')} kg Volumen bewegt`
                    : 'Übernimm deine letzte Woche mit einem Tipp'}
              </p>
            </div>
            <IconChevronRight className="muted" />
          </div>
          {workouts.length > 0 && (
            <div className="relative mt-4 flex gap-1.5">
              {workouts.map((w) => (
                <span
                  key={w.id}
                  className={`flex h-7 flex-1 items-center justify-center rounded-lg text-[10px] font-bold ${
                    w.done_at ? 'bg-gradient-to-br from-brand-300 to-brand-500 text-surface-950' : 'bg-surface-100 muted dark:bg-white/[0.06]'
                  }`}
                  title={w.name}
                >
                  {w.done_at ? <IconCheck size={14} strokeWidth={3} /> : w.name.slice(0, 3)}
                </span>
              ))}
            </div>
          )}
        </button>
      </motion.div>

      <motion.div variants={staggerChild} className="grid grid-cols-2 gap-3">
        <Link to="/stats" className="card block p-4">
          <p className="text-xs font-medium muted">Kalorien · 7 Tage</p>
          <div className="mt-3 flex h-16 items-end gap-1.5">
            {days.map((d, i) => (
              <motion.span
                key={d.date}
                className={`flex-1 rounded-md ${d.date === today ? 'bg-brand-500' : 'bg-brand-500/40'}`}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(4, (d.macros.kcal / maxKcal) * 100)}%` }}
                transition={{ delay: 0.3 + i * 0.05, type: 'spring', stiffness: 200, damping: 20 }}
                title={`${d.macros.kcal} kcal`}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[9px] muted">
            {days.map((d) => (
              <span key={d.date} className="flex-1 text-center">
                {WEEKDAYS[(parseDate(d.date).getDay() + 6) % 7][0]}
              </span>
            ))}
          </div>
        </Link>
        <Link to="/stats?tab=body" className="card flex flex-col p-4">
          <p className="text-xs font-medium muted">Körpergewicht</p>
          <p className="mt-2 font-display text-3xl font-bold num">
            {lastWeight ? Number(lastWeight.body_weight_kg).toLocaleString('de-DE') : '–'}
            <span className="ml-1 text-sm font-medium muted">kg</span>
          </p>
          <p
            className={`mt-auto text-xs font-semibold ${
              weightDelta === null ? 'muted' : weightDelta <= 0 ? 'text-brand-600 dark:text-brand-400' : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {weightDelta === null
              ? 'Trag dein Gewicht unter „Essen“ ein'
              : `${weightDelta > 0 ? '+' : ''}${weightDelta.toLocaleString('de-DE', { maximumFractionDigits: 1 })} kg in 30 Tagen`}
          </p>
        </Link>
      </motion.div>

      <motion.div variants={staggerChild}>
        <WaterCard date={today} goalMl={goals?.water_ml ?? 3000} />
      </motion.div>
    </Stagger>
  );
}

function QuickAction({
  to,
  icon,
  title,
  sub,
  gradient,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  sub: string;
  gradient: string;
}) {
  return (
    <Link to={to} className={`card relative block overflow-hidden p-4`}>
      <div aria-hidden className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${gradient}`} />
      <div className="relative">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 dark:bg-white/10">{icon}</span>
        <p className="mt-3 font-semibold">{title}</p>
        <p className="text-xs muted">{sub}</p>
      </div>
    </Link>
  );
}
