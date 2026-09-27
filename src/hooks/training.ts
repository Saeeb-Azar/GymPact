// Daten-Hooks für den Trainingsbereich: Woche → Einheit → Übung → Satz.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthProvider';
import type {
  ExerciseSetRow,
  TrainingWeekRow,
  WorkoutExerciseRow,
  WorkoutRow,
} from '@/lib/database.types';
import type { DateString } from '@/lib/dates';
import { guessMuscle } from '@/lib/muscles';

export interface ExerciseFull extends WorkoutExerciseRow {
  exercise_sets: ExerciseSetRow[];
}
export interface WorkoutFull extends WorkoutRow {
  workout_exercises: ExerciseFull[];
}
export interface WeekFull extends TrainingWeekRow {
  workouts: WorkoutFull[];
}
export interface WorkoutWithWeek extends WorkoutFull {
  training_weeks: Pick<TrainingWeekRow, 'id' | 'week_start'>;
}

const FULL_SELECT = '*, workouts(*, workout_exercises(*, exercise_sets(*)))';

const byPos = <T extends { position: number; created_at: string }>(a: T, b: T) =>
  a.position - b.position || a.created_at.localeCompare(b.created_at);

function sortWorkout<T extends WorkoutFull>(w: T): T {
  return {
    ...w,
    workout_exercises: [...(w.workout_exercises ?? [])]
      .sort(byPos)
      .map((e) => ({ ...e, exercise_sets: [...(e.exercise_sets ?? [])].sort(byPos) })),
  };
}

function sortWeek(week: WeekFull): WeekFull {
  return { ...week, workouts: [...(week.workouts ?? [])].sort(byPos).map(sortWorkout) };
}

// ---------------------------------------------------------------- Lesen
export function useTrainingWeek(weekStart: DateString) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['training-week', user?.id ?? 'anon', weekStart],
    enabled: !!user,
    queryFn: async (): Promise<WeekFull | null> => {
      const { data, error } = await supabase
        .from('training_weeks')
        .select(FULL_SELECT)
        .eq('user_id', user!.id)
        .eq('week_start', weekStart)
        .maybeSingle();
      if (error) throw error;
      return data ? sortWeek(data as unknown as WeekFull) : null;
    },
  });
}

/** Alle Wochen ab einem Datum inkl. aller Details – Grundlage der Statistik. */
export function useTrainingHistory(fromWeek: DateString) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['training-history', user?.id ?? 'anon', fromWeek],
    enabled: !!user,
    queryFn: async (): Promise<WeekFull[]> => {
      const { data, error } = await supabase
        .from('training_weeks')
        .select(FULL_SELECT)
        .eq('user_id', user!.id)
        .gte('week_start', fromWeek)
        .order('week_start');
      if (error) throw error;
      return ((data ?? []) as unknown as WeekFull[]).map(sortWeek);
    },
  });
}

/** Die jüngste Woche vor weekStart (Vorlage für "Letzte Woche übernehmen"). */
export function usePreviousWeek(weekStart: DateString) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['training-week-prev', user?.id ?? 'anon', weekStart],
    enabled: !!user,
    queryFn: async (): Promise<(TrainingWeekRow & { workouts: { count: number }[] }) | null> => {
      const { data, error } = await supabase
        .from('training_weeks')
        .select('*, workouts(count)')
        .eq('user_id', user!.id)
        .lt('week_start', weekStart)
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as (TrainingWeekRow & { workouts: { count: number }[] }) | null;
    },
  });
}

export function useWorkout(workoutId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['workout', workoutId],
    enabled: !!user && !!workoutId,
    queryFn: async (): Promise<WorkoutWithWeek | null> => {
      const { data, error } = await supabase
        .from('workouts')
        .select('*, training_weeks(id, week_start), workout_exercises(*, exercise_sets(*))')
        .eq('id', workoutId!)
        .maybeSingle();
      if (error) throw error;
      return data ? sortWorkout(data as unknown as WorkoutWithWeek) : null;
    },
  });
}

export interface ExerciseHistoryItem {
  exercise_id: string;
  workout_id: string;
  workout_name: string;
  week_start: DateString;
  done_at: string | null;
  sets: ExerciseSetRow[];
}

/** Frühere Vorkommen einer Übung (gleicher Name) – für "Letztes Mal". */
export function useExerciseHistory(name: string | undefined) {
  const { user } = useAuth();
  const n = (name ?? '').trim();
  return useQuery({
    queryKey: ['exercise-history', user?.id ?? 'anon', n.toLowerCase()],
    enabled: !!user && n.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<ExerciseHistoryItem[]> => {
      const escaped = n.replace(/[%_\\]/g, (c) => `\\${c}`);
      const { data, error } = await supabase
        .from('workout_exercises')
        .select('id, workout_id, exercise_sets(*), workouts(name, done_at, training_weeks(week_start))')
        .eq('user_id', user!.id)
        .ilike('name', escaped)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      type Raw = {
        id: string;
        workout_id: string;
        exercise_sets: ExerciseSetRow[];
        workouts: { name: string; done_at: string | null; training_weeks: { week_start: string } };
      };
      return ((data ?? []) as unknown as Raw[])
        .map((r) => ({
          exercise_id: r.id,
          workout_id: r.workout_id,
          workout_name: r.workouts?.name ?? '',
          week_start: r.workouts?.training_weeks?.week_start ?? '',
          done_at: r.workouts?.done_at ?? null,
          sets: [...(r.exercise_sets ?? [])].sort(byPos),
        }))
        .sort((a, b) => b.week_start.localeCompare(a.week_start));
    },
  });
}

/** Eigene Übungsnamen (für Autovervollständigung), häufigste zuerst. */
export function useExerciseNames() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['exercise-names', user?.id ?? 'anon'],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('workout_exercises')
        .select('name')
        .eq('user_id', user!.id)
        .limit(2000);
      if (error) throw error;
      const counts = new Map<string, { name: string; n: number }>();
      for (const { name } of data ?? []) {
        const k = name.trim().toLowerCase();
        const c = counts.get(k);
        if (c) c.n++;
        else counts.set(k, { name: name.trim(), n: 1 });
      }
      return [...counts.values()].sort((a, b) => b.n - a.n).map((c) => c.name);
    },
  });
}

// ---------------------------------------------------------------- Schreiben
function useInvalidateTraining() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return (workoutId?: string) => {
    qc.invalidateQueries({ queryKey: ['training-week', user!.id] });
    qc.invalidateQueries({ queryKey: ['training-week-prev', user!.id] });
    qc.invalidateQueries({ queryKey: ['training-history', user!.id] });
    qc.invalidateQueries({ queryKey: ['exercise-history', user!.id] });
    qc.invalidateQueries({ queryKey: ['exercise-names', user!.id] });
    if (workoutId) qc.invalidateQueries({ queryKey: ['workout', workoutId] });
  };
}

export function useCreateWeek() {
  const { user } = useAuth();
  const invalidate = useInvalidateTraining();
  return useMutation({
    mutationFn: async (weekStart: DateString): Promise<string> => {
      const { data, error } = await supabase
        .from('training_weeks')
        .upsert({ user_id: user!.id, week_start: weekStart }, { onConflict: 'user_id,week_start' })
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => invalidate(),
  });
}

export function useCopyWeek() {
  const invalidate = useInvalidateTraining();
  return useMutation({
    mutationFn: async (args: { sourceWeekId: string; targetStart: DateString }) => {
      const { data, error } = await supabase.rpc('copy_training_week', {
        p_source_week: args.sourceWeekId,
        p_target_start: args.targetStart,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => invalidate(),
  });
}

export function useUpdateWeek() {
  const invalidate = useInvalidateTraining();
  return useMutation({
    mutationFn: async ({ id, ...update }: Partial<TrainingWeekRow> & { id: string }) => {
      const { error } = await supabase.from('training_weeks').update(update).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });
}

export function useDeleteWeek() {
  const invalidate = useInvalidateTraining();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('training_weeks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });
}

/** Neue Einheit, optional direkt mit Übungen (je 3 leere Sätze). */
export function useAddWorkout() {
  const { user } = useAuth();
  const invalidate = useInvalidateTraining();
  return useMutation({
    mutationFn: async (args: {
      weekId: string;
      name: string;
      dayOfWeek: number | null;
      position: number;
      exercises?: string[];
    }): Promise<string> => {
      const { data: workout, error } = await supabase
        .from('workouts')
        .insert({
          week_id: args.weekId,
          user_id: user!.id,
          name: args.name,
          day_of_week: args.dayOfWeek,
          position: args.position,
        })
        .select('id')
        .single();
      if (error) throw error;
      if (args.exercises?.length) {
        const { data: exercises, error: exErr } = await supabase
          .from('workout_exercises')
          .insert(
            args.exercises.map((name, i) => ({
              workout_id: workout.id,
              user_id: user!.id,
              name,
              muscle_group: guessMuscle(name),
              position: i,
            })),
          )
          .select('id');
        if (exErr) throw exErr;
        const sets = (exercises ?? []).flatMap((e) =>
          [0, 1, 2].map((p) => ({ exercise_id: e.id, user_id: user!.id, position: p })),
        );
        if (sets.length) {
          const { error: setErr } = await supabase.from('exercise_sets').insert(sets);
          if (setErr) throw setErr;
        }
      }
      return workout.id;
    },
    onSuccess: () => invalidate(),
  });
}

export function useUpdateWorkout() {
  const invalidate = useInvalidateTraining();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...update }: Partial<WorkoutRow> & { id: string }) => {
      const { error } = await supabase.from('workouts').update(update).eq('id', id);
      if (error) throw error;
    },
    onMutate: ({ id, ...update }) => {
      qc.setQueryData<WorkoutWithWeek | null>(['workout', id], (old) =>
        old ? { ...old, ...update } : old,
      );
    },
    onSettled: (_d, _e, vars) => invalidate(vars.id),
  });
}

export function useDeleteWorkout() {
  const invalidate = useInvalidateTraining();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workouts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });
}

/** Übung hinzufügen; Sätze werden aus dem letzten Mal übernommen, sonst 3 leere. */
export function useAddExercise() {
  const { user } = useAuth();
  const invalidate = useInvalidateTraining();
  return useMutation({
    mutationFn: async (args: {
      workoutId: string;
      name: string;
      position: number;
      templateSets?: Pick<ExerciseSetRow, 'weight_kg' | 'reps'>[];
    }) => {
      const { data, error } = await supabase
        .from('workout_exercises')
        .insert({
          workout_id: args.workoutId,
          user_id: user!.id,
          name: args.name,
          muscle_group: guessMuscle(args.name),
          position: args.position,
        })
        .select('id')
        .single();
      if (error) throw error;
      const template = args.templateSets?.length
        ? args.templateSets
        : [{ weight_kg: 0, reps: 0 }, { weight_kg: 0, reps: 0 }, { weight_kg: 0, reps: 0 }];
      const { error: setErr } = await supabase.from('exercise_sets').insert(
        template.map((s, i) => ({
          exercise_id: data.id,
          user_id: user!.id,
          position: i,
          weight_kg: Number(s.weight_kg),
          reps: Number(s.reps),
        })),
      );
      if (setErr) throw setErr;
    },
    onSuccess: (_d, vars) => invalidate(vars.workoutId),
  });
}

export function useUpdateExercise() {
  const invalidate = useInvalidateTraining();
  return useMutation({
    mutationFn: async (args: Partial<WorkoutExerciseRow> & { id: string; workoutId: string }) => {
      const { id, workoutId: _w, ...update } = args;
      const { error } = await supabase.from('workout_exercises').update(update).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidate(vars.workoutId),
  });
}

export function useDeleteExercise() {
  const invalidate = useInvalidateTraining();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; workoutId: string }) => {
      const { error } = await supabase.from('workout_exercises').delete().eq('id', args.id);
      if (error) throw error;
    },
    onMutate: ({ id, workoutId }) => {
      qc.setQueryData<WorkoutWithWeek | null>(['workout', workoutId], (old) =>
        old ? { ...old, workout_exercises: old.workout_exercises.filter((e) => e.id !== id) } : old,
      );
    },
    onSettled: (_d, _e, vars) => invalidate(vars.workoutId),
  });
}

/** Satz-Änderungen werden optimistisch in den Cache geschrieben (flüssiges Tippen). */
function patchSet(
  old: WorkoutWithWeek | null | undefined,
  exerciseId: string,
  fn: (sets: ExerciseSetRow[]) => ExerciseSetRow[],
) {
  if (!old) return old;
  return {
    ...old,
    workout_exercises: old.workout_exercises.map((e) =>
      e.id === exerciseId ? { ...e, exercise_sets: fn(e.exercise_sets) } : e,
    ),
  };
}

export function useAddSet() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidate = useInvalidateTraining();
  return useMutation({
    mutationFn: async (args: {
      workoutId: string;
      exerciseId: string;
      position: number;
      weight_kg: number;
      reps: number;
    }) => {
      const { error } = await supabase.from('exercise_sets').insert({
        exercise_id: args.exerciseId,
        user_id: user!.id,
        position: args.position,
        weight_kg: args.weight_kg,
        reps: args.reps,
      });
      if (error) throw error;
    },
    onMutate: (args) => {
      qc.setQueryData<WorkoutWithWeek | null>(['workout', args.workoutId], (old) =>
        patchSet(old, args.exerciseId, (sets) => [
          ...sets,
          {
            id: `temp-${Date.now()}`,
            exercise_id: args.exerciseId,
            user_id: user!.id,
            position: args.position,
            weight_kg: args.weight_kg,
            reps: args.reps,
            done: false,
            created_at: new Date().toISOString(),
          },
        ]),
      );
    },
    onSettled: (_d, _e, vars) => invalidate(vars.workoutId),
  });
}

export function useUpdateSet() {
  const qc = useQueryClient();
  const invalidate = useInvalidateTraining();
  return useMutation({
    mutationFn: async (args: {
      workoutId: string;
      exerciseId: string;
      id: string;
      update: Partial<Pick<ExerciseSetRow, 'weight_kg' | 'reps' | 'done'>>;
    }) => {
      const { error } = await supabase.from('exercise_sets').update(args.update).eq('id', args.id);
      if (error) throw error;
    },
    onMutate: (args) => {
      qc.setQueryData<WorkoutWithWeek | null>(['workout', args.workoutId], (old) =>
        patchSet(old, args.exerciseId, (sets) =>
          sets.map((s) => (s.id === args.id ? { ...s, ...args.update } : s)),
        ),
      );
    },
    onSettled: (_d, _e, vars) => invalidate(vars.workoutId),
  });
}

export function useDeleteSet() {
  const qc = useQueryClient();
  const invalidate = useInvalidateTraining();
  return useMutation({
    mutationFn: async (args: { workoutId: string; exerciseId: string; id: string }) => {
      const { error } = await supabase.from('exercise_sets').delete().eq('id', args.id);
      if (error) throw error;
    },
    onMutate: (args) => {
      qc.setQueryData<WorkoutWithWeek | null>(['workout', args.workoutId], (old) =>
        patchSet(old, args.exerciseId, (sets) => sets.filter((s) => s.id !== args.id)),
      );
    },
    onSettled: (_d, _e, vars) => invalidate(vars.workoutId),
  });
}
