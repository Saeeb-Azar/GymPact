import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { COMMON_EXERCISES, exerciseKey } from '@/lib/training';
import { useAuth } from '@/context/AuthProvider';
import { useAddExercise, useExerciseNames } from '@/hooks/training';
import { errorMessage } from '@/hooks/queries';
import { supabase } from '@/lib/supabase';
import { Button, Input } from '../ui/basics';
import { Sheet } from '../ui/motion';
import { useToast } from '../ui/toast';
import { IconPlus, IconSearch } from '../icons';

/** Übung wählen: eigene Übungen zuerst, dann gängige; Sätze vom letzten Mal werden übernommen. */
export function AddExerciseSheet({
  open,
  onClose,
  workoutId,
  position,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  workoutId: string;
  position: number;
  existing: string[];
}) {
  const [term, setTerm] = useState('');
  const { data: own = [] } = useExerciseNames();
  const add = useAddExercise();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { showToast } = useToast();

  useEffect(() => {
    if (open) setTerm('');
  }, [open]);

  const suggestions = useMemo(() => {
    const taken = new Set(existing.map(exerciseKey));
    const seen = new Set<string>();
    const list: { name: string; own: boolean }[] = [];
    for (const [names, isOwn] of [
      [own, true],
      [COMMON_EXERCISES, false],
    ] as const) {
      for (const n of names) {
        const k = exerciseKey(n);
        if (seen.has(k) || taken.has(k)) continue;
        seen.add(k);
        list.push({ name: n, own: isOwn });
      }
    }
    const t = exerciseKey(term);
    return t ? list.filter((s) => exerciseKey(s.name).includes(t)) : list;
  }, [own, existing, term]);

  const choose = async (name: string) => {
    try {
      // Sätze vom letzten Mal als Startwerte
      const escaped = name.trim().replace(/[%_\\]/g, (c) => `\\${c}`);
      const { data } = await supabase
        .from('workout_exercises')
        .select('id, exercise_sets(weight_kg, reps, position), workouts(training_weeks(week_start))')
        .eq('user_id', user!.id)
        .ilike('name', escaped)
        .order('created_at', { ascending: false })
        .limit(10);
      type Raw = {
        exercise_sets: { weight_kg: number; reps: number; position: number }[];
        workouts: { training_weeks: { week_start: string } } | null;
      };
      const latest = ((data ?? []) as unknown as Raw[])
        .filter((r) => r.exercise_sets.some((s) => s.reps > 0))
        .sort((a, b) =>
          (b.workouts?.training_weeks?.week_start ?? '').localeCompare(a.workouts?.training_weeks?.week_start ?? ''),
        )[0];
      await add.mutateAsync({
        workoutId,
        name: name.trim(),
        position,
        templateSets: latest ? [...latest.exercise_sets].sort((a, b) => a.position - b.position) : undefined,
      });
      qc.invalidateQueries({ queryKey: ['exercise-history'] });
      onClose();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  };

  const exact = suggestions.some((s) => exerciseKey(s.name) === exerciseKey(term));

  return (
    <Sheet open={open} onClose={onClose} title="Übung hinzufügen">
      <div className="space-y-3">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 muted" size={20} />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Übung suchen oder neu eingeben"
            className="pl-11"
            maxLength={80}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && term.trim()) void choose(term);
            }}
          />
        </div>
        {term.trim() && !exact && (
          <Button className="w-full" loading={add.isPending} onClick={() => choose(term)}>
            <IconPlus size={18} /> „{term.trim()}“ anlegen
          </Button>
        )}
        <div className="space-y-1">
          {suggestions.slice(0, 40).map((s) => (
            <button
              key={s.name}
              type="button"
              disabled={add.isPending}
              onClick={() => choose(s.name)}
              className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left transition-colors hover:bg-surface-100 disabled:opacity-50 dark:hover:bg-white/[0.05]"
            >
              <span className="font-medium">{s.name}</span>
              {s.own && (
                <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-bold text-brand-600 dark:text-brand-400">
                  deine
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
