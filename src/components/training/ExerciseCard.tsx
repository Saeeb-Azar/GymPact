import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { ExerciseSetRow } from '@/lib/database.types';
import { bestSet, estimateOneRepMax, formatKg, summarizeSets, totalVolume } from '@/lib/training';
import { formatDateShort } from '@/lib/dates';
import { MUSCLES, muscleOf } from '@/lib/muscles';
import type { MuscleGroup } from '@/lib/database.types';
import {
  useAddSet,
  useDeleteExercise,
  useDeleteSet,
  useExerciseHistory,
  useUpdateExercise,
  useUpdateSet,
  type ExerciseFull,
} from '@/hooks/training';
import { errorMessage } from '@/hooks/queries';
import { Button, Field, Input } from '../ui/basics';
import { Sheet } from '../ui/motion';
import { useToast } from '../ui/toast';
import { IconCheck, IconMore, IconPlus, IconTrash, IconTrophy, IconX } from '../icons';

export function ExerciseCard({
  exercise,
  workoutId,
  index,
}: {
  exercise: ExerciseFull;
  workoutId: string;
  index: number;
}) {
  const { data: history = [] } = useExerciseHistory(exercise.name);
  const addSet = useAddSet();
  const [menu, setMenu] = useState(false);

  const previous = history.filter((h) => h.exercise_id !== exercise.id && h.sets.some((s) => s.reps > 0));
  const last = previous[0];
  const prevBest = Math.max(
    0,
    ...previous.flatMap((h) => h.sets.map((s) => estimateOneRepMax(s))),
  );
  const best = bestSet(exercise.exercise_sets);
  const isPR = !!best && prevBest > 0 && estimateOneRepMax(best) > prevBest;
  const vol = totalVolume(exercise.exercise_sets);

  return (
    <motion.section
      layout
      className="card overflow-hidden"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ delay: index * 0.04, type: 'spring', stiffness: 280, damping: 26 }}
    >
      <div className="flex items-start gap-3 p-4 pb-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#7a7fd1]/15 font-display text-sm font-bold text-[#7a7fd1]">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-lg font-bold leading-tight">{exercise.name}</h3>
            <AnimatePresence>
              {isPR && (
                <motion.span
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0 }}
                  className="flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-300"
                >
                  <IconTrophy size={12} /> PR
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <p className="truncate text-xs muted">
            {last
              ? `Letztes Mal (${formatDateShort(last.week_start)}): ${summarizeSets(last.sets)}`
              : 'Zum ersten Mal – leg los!'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMenu(true)}
          className="touch-target -mr-2 -mt-1 flex items-center justify-center rounded-xl muted hover:bg-surface-100 dark:hover:bg-white/5"
          aria-label="Übung bearbeiten"
        >
          <IconMore />
        </button>
      </div>

      <div className="px-3 pb-3">
        <div className="grid grid-cols-[2rem_1fr_1fr_2.75rem_2rem] items-center gap-2 px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider muted">
          <span className="text-center">Satz</span>
          <span className="text-center">kg</span>
          <span className="text-center">Wdh.</span>
          <span className="flex justify-center"><IconCheck size={12} strokeWidth={2.6} /></span>
          <span />
        </div>
        <AnimatePresence initial={false}>
          {exercise.exercise_sets.map((s, i) => (
            <SetRow
              key={s.id}
              set={s}
              index={i}
              workoutId={workoutId}
              ghost={last?.sets[i]}
            />
          ))}
        </AnimatePresence>
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              const lastSet = exercise.exercise_sets[exercise.exercise_sets.length - 1];
              addSet.mutate({
                workoutId,
                exerciseId: exercise.id,
                position: (lastSet?.position ?? -1) + 1,
                weight_kg: Number(lastSet?.weight_kg ?? 0),
                reps: Number(lastSet?.reps ?? 0),
              });
            }}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-500/10 dark:text-brand-400"
          >
            <IconPlus size={16} /> Satz
          </button>
          {vol > 0 && (
            <span className="text-xs muted num">
              Volumen {vol.toLocaleString('de-DE')} kg
              {best ? ` · 1RM ≈ ${formatKg(estimateOneRepMax(best))} kg` : ''}
            </span>
          )}
        </div>
      </div>

      <ExerciseMenu exercise={exercise} workoutId={workoutId} open={menu} onClose={() => setMenu(false)} />
    </motion.section>
  );
}

function SetRow({
  set,
  index,
  workoutId,
  ghost,
}: {
  set: ExerciseSetRow;
  index: number;
  workoutId: string;
  ghost?: Pick<ExerciseSetRow, 'weight_kg' | 'reps'>;
}) {
  const update = useUpdateSet();
  const del = useDeleteSet();
  const { showToast } = useToast();
  const temp = set.id.startsWith('temp-');
  const [kg, setKg] = useState(fmt(set.weight_kg));
  const [reps, setReps] = useState(fmt(set.reps));
  const [focus, setFocus] = useState(false);

  useEffect(() => {
    if (!focus) {
      setKg(fmt(set.weight_kg));
      setReps(fmt(set.reps));
    }
  }, [set.weight_kg, set.reps, focus]);

  const commit = () => {
    setFocus(false);
    const w = Math.min(1000, Math.max(0, Number(kg.replace(',', '.')) || 0));
    const r = Math.min(1000, Math.max(0, Math.round(Number(reps) || 0)));
    if (w === Number(set.weight_kg) && r === Number(set.reps)) return;
    update.mutate(
      { workoutId, exerciseId: set.exercise_id, id: set.id, update: { weight_kg: w, reps: r } },
      { onError: (err) => showToast(errorMessage(err), 'error') },
    );
  };

  const inputCls =
    'w-full rounded-xl border border-transparent bg-surface-100 py-2.5 text-center font-display text-lg font-bold num transition-colors focus:border-brand-500 focus:bg-white dark:bg-white/[0.05] dark:focus:bg-white/10';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={`grid grid-cols-[2rem_1fr_1fr_2.75rem_2rem] items-center gap-2 rounded-2xl px-1 py-1 transition-colors ${
        set.done ? 'bg-brand-500/10' : ''
      }`}
    >
      <span className="text-center font-display text-sm font-bold muted">{index + 1}</span>
      <input
        value={kg}
        disabled={temp}
        onChange={(e) => setKg(e.target.value)}
        onFocus={(e) => {
          setFocus(true);
          e.target.select();
        }}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        inputMode="decimal"
        placeholder={ghost ? fmt(ghost.weight_kg) : '0'}
        aria-label={`Satz ${index + 1} Gewicht`}
        className={inputCls}
      />
      <input
        value={reps}
        disabled={temp}
        onChange={(e) => setReps(e.target.value)}
        onFocus={(e) => {
          setFocus(true);
          e.target.select();
        }}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        inputMode="numeric"
        placeholder={ghost ? fmt(ghost.reps) : '0'}
        aria-label={`Satz ${index + 1} Wiederholungen`}
        className={inputCls}
      />
      <motion.button
        type="button"
        disabled={temp}
        whileTap={{ scale: 0.8 }}
        onClick={() =>
          update.mutate({
            workoutId,
            exerciseId: set.exercise_id,
            id: set.id,
            update: { done: !set.done },
          })
        }
        className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
          set.done
            ? 'bg-brand-600 text-white dark:bg-brand-500 dark:text-surface-950'
            : 'bg-surface-100 muted dark:bg-white/[0.05]'
        }`}
        aria-label={set.done ? 'Satz als offen markieren' : 'Satz erledigt'}
        aria-pressed={set.done}
      >
        <IconCheck size={20} strokeWidth={2.6} />
      </motion.button>
      <button
        type="button"
        disabled={temp}
        onClick={() => del.mutate({ workoutId, exerciseId: set.exercise_id, id: set.id })}
        className="flex h-8 w-8 items-center justify-center rounded-lg muted opacity-60 hover:bg-rose-500/10 hover:text-rose-500 hover:opacity-100"
        aria-label={`Satz ${index + 1} löschen`}
      >
        <IconX size={16} />
      </button>
    </motion.div>
  );
}

function fmt(n: number): string {
  const v = Number(n);
  return v === 0 ? '' : formatKg(v);
}

function ExerciseMenu({
  exercise,
  workoutId,
  open,
  onClose,
}: {
  exercise: ExerciseFull;
  workoutId: string;
  open: boolean;
  onClose: () => void;
}) {
  const update = useUpdateExercise();
  const del = useDeleteExercise();
  const { showToast } = useToast();
  const [name, setName] = useState(exercise.name);
  const [notes, setNotes] = useState(exercise.notes);
  const [muscle, setMuscle] = useState<MuscleGroup | null>(muscleOf(exercise));

  useEffect(() => {
    if (open) {
      setName(exercise.name);
      setNotes(exercise.notes);
      setMuscle(muscleOf(exercise));
    }
  }, [open, exercise]);

  return (
    <Sheet open={open} onClose={onClose} title="Übung bearbeiten">
      <div className="space-y-4">
        <Field label="Name" hint="Gleicher Name = wird in den Statistiken zusammengefasst">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Notiz">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            placeholder="z. B. Sitzhöhe 4, enger Griff"
          />
        </Field>
        <div>
          <p className="mb-2 text-sm font-medium muted">Muskelgruppe (für den 3D-Körper)</p>
          <div className="flex flex-wrap gap-1.5">
            {MUSCLES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMuscle(m.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  muscle === m.id ? 'bg-rose-500 text-white' : 'bg-surface-100 dark:bg-white/[0.06]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <Button
          className="w-full"
          disabled={!name.trim()}
          loading={update.isPending}
          onClick={() =>
            update.mutate(
              { id: exercise.id, workoutId, name: name.trim(), notes: notes.trim(), muscle_group: muscle },
              {
                onSuccess: onClose,
                onError: (err) => showToast(errorMessage(err), 'error'),
              },
            )
          }
        >
          Speichern
        </Button>
        <Button
          variant="danger"
          className="w-full"
          onClick={() => {
            del.mutate({ id: exercise.id, workoutId });
            onClose();
          }}
        >
          <IconTrash size={18} /> Übung entfernen
        </Button>
      </div>
    </Sheet>
  );
}
