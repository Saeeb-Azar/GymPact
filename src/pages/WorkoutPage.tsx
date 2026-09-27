import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { WEEKDAYS, isoWeek, totalVolume } from '@/lib/training';
import { useDeleteWorkout, useUpdateWorkout, useWorkout } from '@/hooks/training';
import { errorMessage } from '@/hooks/queries';
import { ExerciseCard } from '@/components/training/ExerciseCard';
import { AddExerciseSheet } from '@/components/training/AddExerciseSheet';
import { Button, EmptyState, Field, Input, Textarea } from '@/components/ui/basics';
import { AnimatedNumber, Sheet, useConfetti } from '@/components/ui/motion';
import { useToast } from '@/components/ui/toast';
import { IconCheck, IconChevronLeft, IconEdit, IconPlus, IconTrash } from '@/components/icons';

export function WorkoutPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: workout, isLoading, error } = useWorkout(id);
  const update = useUpdateWorkout();
  const { showToast } = useToast();
  const confetti = useConfetti();
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setNotes(workout?.notes ?? '');
  }, [workout?.id, workout?.notes]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-10 w-40" />
        <div className="skeleton h-28" />
        <div className="skeleton h-48" />
      </div>
    );
  }
  if (error || !workout) {
    return (
      <EmptyState
        emoji="🤷"
        title="Einheit nicht gefunden"
        description={error ? errorMessage(error) : 'Vielleicht wurde sie gelöscht.'}
        action={<Button onClick={() => navigate('/training')}>Zum Trainingsplan</Button>}
      />
    );
  }

  const weekStart = workout.training_weeks.week_start;
  const sets = workout.workout_exercises.flatMap((e) => e.exercise_sets);
  const doneSets = sets.filter((s) => s.done).length;
  const vol = totalVolume(sets);
  const done = !!workout.done_at;

  const toggleDone = () => {
    update.mutate(
      { id: workout.id, done_at: done ? null : new Date().toISOString() },
      {
        onSuccess: () => {
          if (!done) {
            confetti.fire();
            showToast('Stark! Einheit erledigt 💪', 'success');
          }
        },
        onError: (err) => showToast(errorMessage(err), 'error'),
      },
    );
  };

  return (
    <div className="space-y-4">
      {confetti.node}
      <Link
        to={`/training?week=${weekStart}`}
        className="-ml-1 inline-flex items-center gap-1 text-sm font-medium muted hover:text-surface-900 dark:hover:text-white"
      >
        <IconChevronLeft size={18} /> KW {isoWeek(weekStart)}
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-400">
            {workout.day_of_week ? WEEKDAYS[workout.day_of_week - 1] + ' · ' : ''}Einheit
          </p>
          <h1 className="truncate font-display text-3xl font-bold tracking-tight">{workout.name}</h1>
        </div>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="touch-target flex items-center justify-center rounded-2xl muted hover:bg-surface-100 dark:hover:bg-white/5"
          aria-label="Einheit bearbeiten"
        >
          <IconEdit />
        </button>
      </div>

      <div className="card grid grid-cols-3 divide-x divide-surface-200 p-3 text-center dark:divide-white/[0.06]">
        <div>
          <p className="font-display text-xl font-bold">
            <AnimatedNumber value={workout.workout_exercises.length} />
          </p>
          <p className="text-[11px] muted">Übungen</p>
        </div>
        <div>
          <p className="font-display text-xl font-bold">
            <AnimatedNumber value={doneSets} />
            <span className="text-sm muted">/{sets.length}</span>
          </p>
          <p className="text-[11px] muted">Sätze erledigt</p>
        </div>
        <div>
          <p className="font-display text-xl font-bold">
            <AnimatedNumber value={vol} />
          </p>
          <p className="text-[11px] muted">kg Volumen</p>
        </div>
      </div>

      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {workout.workout_exercises.map((e, i) => (
            <ExerciseCard key={e.id} exercise={e} workoutId={workout.id} index={i} />
          ))}
        </AnimatePresence>
      </div>

      {workout.workout_exercises.length === 0 && (
        <EmptyState emoji="🏋️" title="Noch keine Übungen" description="Füg deine erste Übung hinzu – mit Gewicht und Wiederholungen je Satz." />
      )}

      <Button variant="secondary" className="w-full" onClick={() => setAddOpen(true)}>
        <IconPlus size={18} /> Übung hinzufügen
      </Button>

      <div className="card p-4">
        <label htmlFor="workout-notes" className="text-sm font-semibold">
          Notizen
        </label>
        <Textarea
          id="workout-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== workout.notes && update.mutate({ id: workout.id, notes })}
          rows={2}
          maxLength={2000}
          placeholder="Wie lief’s? Energie, Pump, Schmerzen …"
          className="mt-2"
        />
      </div>

      <motion.div whileTap={{ scale: 0.97 }}>
        <Button
          variant={done ? 'secondary' : 'primary'}
          className="w-full py-4 text-lg"
          onClick={toggleDone}
          loading={update.isPending}
        >
          <IconCheck size={22} strokeWidth={2.6} />
          {done ? 'Erledigt · rückgängig' : 'Einheit abschließen'}
        </Button>
      </motion.div>

      <AddExerciseSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        workoutId={workout.id}
        position={workout.workout_exercises.length}
        existing={workout.workout_exercises.map((e) => e.name)}
      />
      <EditWorkoutSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        workout={{ id: workout.id, name: workout.name, day_of_week: workout.day_of_week }}
        onDeleted={() => navigate(`/training?week=${weekStart}`, { replace: true })}
      />
    </div>
  );
}

function EditWorkoutSheet({
  open,
  onClose,
  workout,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  workout: { id: string; name: string; day_of_week: number | null };
  onDeleted: () => void;
}) {
  const update = useUpdateWorkout();
  const del = useDeleteWorkout();
  const { showToast } = useToast();
  const [name, setName] = useState(workout.name);
  const [day, setDay] = useState<number | null>(workout.day_of_week);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setName(workout.name);
      setDay(workout.day_of_week);
      setConfirm(false);
    }
  }, [open, workout.name, workout.day_of_week]);

  return (
    <Sheet open={open} onClose={onClose} title="Einheit bearbeiten">
      <div className="space-y-5">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <div>
          <p className="mb-2 text-sm font-medium muted">Wochentag</p>
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => setDay(day === i + 1 ? null : i + 1)}
                className={`rounded-xl py-2.5 text-sm font-semibold ${
                  day === i + 1
                    ? 'bg-surface-900 text-white dark:bg-white dark:text-surface-900'
                    : 'bg-surface-100 dark:bg-white/[0.06]'
                }`}
              >
                {d}
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
              { id: workout.id, name: name.trim(), day_of_week: day },
              { onSuccess: onClose, onError: (err) => showToast(errorMessage(err), 'error') },
            )
          }
        >
          Speichern
        </Button>
        <Button
          variant={confirm ? 'danger' : 'ghost'}
          className="w-full"
          loading={del.isPending}
          onClick={() => {
            if (!confirm) return setConfirm(true);
            del.mutate(workout.id, {
              onSuccess: () => {
                onClose();
                onDeleted();
              },
              onError: (err) => showToast(errorMessage(err), 'error'),
            });
          }}
        >
          <IconTrash size={18} /> {confirm ? 'Wirklich löschen?' : 'Einheit löschen'}
        </Button>
      </div>
    </Sheet>
  );
}
