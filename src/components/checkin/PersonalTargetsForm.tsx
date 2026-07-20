// Blockiert den Check-in, bis der Nutzer für jede numerische Gewohnheit
// der aktiven Challenge sein eigenes Ziel eingetragen hat. Das Thema
// (z. B. "Protein erreicht") ist für die Gruppe gleich, der Zielwert
// aber persönlich – die eine nimmt 180 g, der andere 160 g.

import { useState } from 'react';
import { useSetHabitTarget } from '@/hooks/queries';
import type { HabitRow } from '@/lib/database.types';
import { Button, Card, Field, Input } from '../ui/basics';
import { useToast } from '../ui/toast';

export function PersonalTargetsForm({ habits }: { habits: HabitRow[] }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const setTarget = useSetHabitTarget();
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const parsedValue = (habitId: string): number | null => {
    const raw = (values[habitId] ?? '').trim().replace(',', '.');
    if (raw === '') return null;
    const parsed = Number(raw);
    return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
  };

  const allFilled = habits.every((h) => parsedValue(h.id) !== null);

  const submit = async () => {
    setSubmitting(true);
    try {
      for (const habit of habits) {
        const value = parsedValue(habit.id);
        if (value === null) continue;
        // eslint-disable-next-line no-await-in-loop
        await setTarget.mutateAsync({ habitId: habit.id, targetValue: value });
      }
      showToast('Deine Ziele sind gespeichert', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Speichern fehlgeschlagen', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="animate-fade-up">
      <h2 className="text-base font-semibold">Deine persönlichen Ziele</h2>
      <p className="mt-1 text-sm text-surface-900/60 dark:text-surface-100/60">
        Das Thema ist für eure Gruppe gleich, aber jede*r kann sein eigenes Ziel
        setzen – z. B. unterschiedliche Proteinmengen.
      </p>

      <div className="mt-4 space-y-3">
        {habits.map((habit) => (
          <Field key={habit.id} label={habit.name} htmlFor={`target-${habit.id}`}>
            <div className="flex items-center gap-2">
              <Input
                id={`target-${habit.id}`}
                type="text"
                inputMode="decimal"
                placeholder={habit.target_value ? String(habit.target_value) : '0'}
                value={values[habit.id] ?? ''}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [habit.id]: e.target.value }))
                }
                className="text-right tabular-nums"
              />
              <span className="w-8 shrink-0 text-sm text-surface-900/50 dark:text-surface-100/50">
                {habit.unit ?? ''}
              </span>
            </div>
          </Field>
        ))}
      </div>

      <Button
        className="mt-4 w-full"
        disabled={!allFilled}
        loading={submitting}
        onClick={submit}
      >
        Ziele speichern
      </Button>
    </Card>
  );
}
