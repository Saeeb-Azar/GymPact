import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { Suspense, lazy, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MuscleGroup } from '@/lib/database.types';
import { addDays, formatDateShort, startOfWeek, type DateString } from '@/lib/dates';
import { MUSCLES, MUSCLE_BY_ID, muscleOf } from '@/lib/muscles';
import { bestSet, estimateOneRepMax, exerciseKey, formatKg, summarizeSets } from '@/lib/training';
import { useTrainingHistory } from '@/hooks/training';
import { IconChevronRight, IconX } from '../icons';

const BodyModel = lazy(() => import('./BodyModel'));

interface ExerciseSummary {
  key: string;
  name: string;
  sessions: number;
  lastWeek: DateString;
  lastWorkoutId: string;
  lastWorkoutName: string;
  lastSummary: string;
  best1RM: number;
}

/**
 * Interaktiver 3D-Körper: Muskel antippen → Figur dreht sich, wandert nach
 * oben links, der Muskel leuchtet rot und daneben erscheinen deine Übungen.
 */
export function BodyView({ today }: { today: DateString }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<MuscleGroup | null>(null);
  const [hovered, setHovered] = useState<MuscleGroup | null>(null);
  const from = addDays(startOfWeek(today), -7 * 25);
  const { data: history = [], isLoading } = useTrainingHistory(from);

  const { heat, setsByMuscle, exercisesByMuscle } = useMemo(() => {
    const recentFrom = addDays(today, -28);
    const sets = new Map<MuscleGroup, number>();
    const ex = new Map<MuscleGroup, Map<string, ExerciseSummary>>();
    for (const week of history) {
      for (const w of week.workouts) {
        for (const e of w.workout_exercises) {
          const m = muscleOf(e);
          if (!m) continue;
          const valid = e.exercise_sets.filter((s) => s.reps > 0);
          if (week.week_start >= startOfWeek(recentFrom)) {
            sets.set(m, (sets.get(m) ?? 0) + valid.length);
          }
          if (valid.length === 0) continue;
          const byName = ex.get(m) ?? new Map<string, ExerciseSummary>();
          const k = exerciseKey(e.name);
          const cur = byName.get(k);
          const b = bestSet(valid);
          const oneRm = b ? estimateOneRepMax(b) : 0;
          if (!cur) {
            byName.set(k, {
              key: k,
              name: e.name,
              sessions: 1,
              lastWeek: week.week_start,
              lastWorkoutId: w.id,
              lastWorkoutName: w.name,
              lastSummary: summarizeSets(valid),
              best1RM: oneRm,
            });
          } else {
            cur.sessions++;
            cur.best1RM = Math.max(cur.best1RM, oneRm);
            if (week.week_start >= cur.lastWeek) {
              cur.lastWeek = week.week_start;
              cur.lastWorkoutId = w.id;
              cur.lastWorkoutName = w.name;
              cur.lastSummary = summarizeSets(valid);
              cur.name = e.name;
            }
          }
          ex.set(m, byName);
        }
      }
    }
    const max = Math.max(1, ...sets.values());
    const heatMap = new Map<MuscleGroup, number>();
    for (const [m, n] of sets) heatMap.set(m, n / max);
    return { heat: heatMap, setsByMuscle: sets, exercisesByMuscle: ex };
  }, [history, today]);

  const info = selected ? MUSCLE_BY_ID[selected] : null;
  const exercises = selected
    ? [...(exercisesByMuscle.get(selected)?.values() ?? [])].sort((a, b) => b.lastWeek.localeCompare(a.lastWeek))
    : [];
  const ideas = info ? info.ideas.filter((i) => !exercises.some((e) => e.key === exerciseKey(i))) : [];

  return (
    <LayoutGroup>
      <div className={`relative ${selected ? 'flex items-start gap-3' : ''}`}>
        <motion.div
          layout
          transition={{ type: 'spring', stiffness: 220, damping: 28 }}
          className={`card relative shrink-0 overflow-hidden ${selected ? 'h-[300px] w-[40%]' : 'h-[460px] w-full'}`}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_40%,rgba(15,203,132,0.14),transparent_70%)]"
          />
          <Suspense fallback={<div className="skeleton m-4 h-[calc(100%-2rem)]" />}>
            <BodyModel heat={heat} selected={selected} onSelect={setSelected} onHover={setHovered} />
          </Suspense>
          {!selected && (
            <div className="pointer-events-none absolute inset-x-0 top-3 text-center">
              <p className="font-display text-base font-bold">
                {hovered ? MUSCLE_BY_ID[hovered].label : 'Tippe auf einen Muskel'}
              </p>
              <p className="text-xs muted">Ziehen zum Drehen · Grün = viel trainiert (4 Wochen)</p>
            </div>
          )}
          {selected && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur"
              aria-label="Auswahl aufheben"
            >
              <IconX size={16} />
            </button>
          )}
        </motion.div>

        <AnimatePresence mode="popLayout">
          {info && (
            <motion.div
              key={info.id}
              layout
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ type: 'spring', stiffness: 260, damping: 28, delay: 0.1 }}
              className="min-w-0 flex-1"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-500">Muskelgruppe</p>
              <h2 className="font-display text-2xl font-bold leading-tight">{info.label}</h2>
              <p className="mt-0.5 text-xs muted">
                <span className="font-semibold text-surface-900 num dark:text-surface-100">
                  {setsByMuscle.get(info.id) ?? 0}
                </span>{' '}
                Sätze in 4 Wochen
              </p>

              <div className="mt-3 space-y-2">
                {isLoading ? (
                  <div className="skeleton h-16" />
                ) : exercises.length === 0 ? (
                  <p className="rounded-2xl bg-surface-100 p-3 text-sm muted dark:bg-white/[0.04]">
                    Noch keine Übungen für {info.label} aufgeschrieben.
                  </p>
                ) : (
                  exercises.map((e, i) => (
                    <motion.button
                      key={e.key}
                      type="button"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 + i * 0.05 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => navigate(`/training/workout/${e.lastWorkoutId}`)}
                      className="card flex w-full items-center gap-2 p-3 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{e.name}</span>
                        <span className="block truncate text-[11px] muted">
                          {e.lastSummary} · {formatDateShort(e.lastWeek)}
                        </span>
                        {e.best1RM > 0 && (
                          <span className="mt-0.5 block text-[11px] font-semibold text-brand-600 dark:text-brand-400">
                            1RM ≈ {formatKg(e.best1RM)} kg · {e.sessions}×
                          </span>
                        )}
                      </span>
                      <IconChevronRight size={16} className="shrink-0 muted" />
                    </motion.button>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {info && ideas.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4"
          >
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.12em] muted">Ideen für {info.label}</p>
            <div className="flex flex-wrap gap-2">
              {ideas.map((i) => (
                <span key={i} className="rounded-full bg-surface-100 px-3 py-1.5 text-sm dark:bg-white/[0.06]">
                  {i}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {MUSCLES.map((m) => {
          const n = setsByMuscle.get(m.id) ?? 0;
          const active = m.id === selected;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelected(active ? null : m.id)}
              className={`rounded-2xl px-2 py-2.5 text-left transition-colors ${
                active ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' : 'card'
              }`}
            >
              <span className="block truncate text-xs font-semibold">{m.label}</span>
              <span className={`block text-[11px] num ${active ? 'text-white/80' : 'muted'}`}>{n} Sätze</span>
              {!active && (
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-200 dark:bg-white/[0.07]">
                  <span
                    className="block h-full rounded-full bg-brand-500"
                    style={{ width: `${(heat.get(m.id) ?? 0) * 100}%` }}
                  />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
