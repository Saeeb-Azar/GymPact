import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import type { BodyView as Side, Gender } from 'js-rich-body-highlighter';
import { useNavigate } from 'react-router-dom';
import type { MuscleGroup } from '@/lib/database.types';
import { addDays, formatDateShort, startOfWeek, type DateString } from '@/lib/dates';
import { MUSCLES, MUSCLE_BY_ID, muscleOf } from '@/lib/muscles';
import { bestSet, estimateOneRepMax, exerciseKey, formatKg, summarizeSets } from '@/lib/training';
import { useTrainingHistory } from '@/hooks/training';
import { IconChevronRight, IconX } from '../icons';
import { Segmented } from '../ui/motion';
import { RealisticBody, groupsInView } from './RealisticBody';

const GENDER_KEY = 'gympact-body-gender';

function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const html = document.documentElement;
    const mo = new MutationObserver(() => setDark(html.classList.contains('dark')));
    mo.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

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
  const [side, setSide] = useState<Side>('front');
  const [gender, setGenderState] = useState<Gender>(() => {
    try {
      return localStorage.getItem(GENDER_KEY) === 'female' ? 'female' : 'male';
    } catch {
      return 'male';
    }
  });
  const setGender = (g: Gender) => {
    setGenderState(g);
    try {
      localStorage.setItem(GENDER_KEY, g);
    } catch {
      /* egal */
    }
  };
  const dark = useIsDark();

  const select = (m: MuscleGroup | null) => {
    setSelected(m);
    if (m && !groupsInView(gender, side).has(m)) setSide(side === 'front' ? 'back' : 'front');
    if (m) window.scrollTo({ top: 0, behavior: 'smooth' });
  };
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
      <div className={selected ? 'grid grid-cols-[minmax(0,42%)_minmax(0,1fr)] items-start gap-3' : 'flex flex-col items-center'}>
        {!selected && (
          <div className="mb-3 w-full">
            <div className="flex gap-2">
              <Segmented
                size="sm"
                className="flex-[2]"
                value={side}
                onChange={setSide}
                options={[
                  { value: 'front', label: 'Vorne' },
                  { value: 'back', label: 'Hinten' },
                ]}
              />
              <Segmented
                size="sm"
                className="flex-1"
                value={gender}
                onChange={setGender}
                options={[
                  { value: 'male', label: '♂' },
                  { value: 'female', label: '♀' },
                ]}
              />
            </div>
          </div>
        )}
        <motion.div
          layout
          transition={{ type: 'spring', stiffness: 200, damping: 28 }}
          className="card relative w-full overflow-hidden"
          style={selected ? undefined : { maxWidth: 'min(100%, max(220px, calc((100dvh - 430px) * 0.6665)), 360px)' }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_50%_42%,rgba(15,203,132,0.16),transparent_70%)]"
          />
          <div className="relative w-full" style={{ aspectRatio: '361.16 / 541.87' }}>
            <RealisticBody
              gender={gender}
              view={side}
              onViewChange={setSide}
              heat={heat}
              selected={selected}
              onSelect={select}
              onHover={setHovered}
              dark={dark}
            />
          </div>
          {selected && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur"
              aria-label="Auswahl aufheben"
            >
              <IconX size={16} />
            </button>
          )}
        </motion.div>

        {!selected && (
          <div className="mt-3 w-full space-y-1 text-center">
            <p className="min-h-[24px] font-display text-base font-bold">
              {hovered ? MUSCLE_BY_ID[hovered].label : 'Tippe auf einen Muskel'}
            </p>
            <p className="text-xs muted">Wischen zum Drehen · Grün = viel trainiert (4 Wochen)</p>
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {info && (
            <motion.div
              key={info.id}
              layout
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              transition={{ type: 'spring', stiffness: 260, damping: 28, delay: 0.1 }}
              className="min-w-0"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-500">Muskelgruppe</p>
              <h2 className="break-words font-display text-2xl font-bold leading-tight">{info.label}</h2>
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
                      className="card flex w-full min-w-0 items-center gap-1.5 p-2.5 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{e.name}</span>
                        <span className="block truncate text-[11px] muted">{e.lastSummary}</span>
                        <span className="block truncate text-[11px] muted">{formatDateShort(e.lastWeek)}</span>
                        {e.best1RM > 0 && (
                          <span className="mt-0.5 block truncate text-[11px] font-semibold text-brand-600 dark:text-brand-400">
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
              onClick={() => select(active ? null : m.id)}
              className={`min-w-0 rounded-2xl px-2 py-2.5 text-left transition-colors ${
                active ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' : 'card'
              }`}
            >
              <span className="block truncate text-xs font-semibold">{m.label}</span>
              <span className={`block truncate text-[11px] num ${active ? 'text-white/80' : 'muted'}`}>{n} Sätze</span>
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
