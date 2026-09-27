import { useEffect, useState } from 'react';
import { WEEKDAYS, WORKOUT_TEMPLATES } from '@/lib/training';
import { useAddWorkout } from '@/hooks/training';
import { errorMessage } from '@/hooks/queries';
import { Button, Field, Input } from '../ui/basics';
import { Sheet } from '../ui/motion';
import { useToast } from '../ui/toast';

/** Neue Einheit: Name, optional Vorlage (mit Übungen) und Wochentag. */
export function AddWorkoutSheet({
  open,
  onClose,
  weekId,
  position,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  weekId: string | null;
  position: number;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<string | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const add = useAddWorkout();
  const { showToast } = useToast();

  useEffect(() => {
    if (open) {
      setName('');
      setTemplate(null);
      setDay(null);
    }
  }, [open]);

  const tpl = WORKOUT_TEMPLATES.find((t) => t.name === template);

  const submit = async () => {
    if (!weekId || !name.trim()) return;
    try {
      const id = await add.mutateAsync({
        weekId,
        name: name.trim(),
        dayOfWeek: day,
        position,
        exercises: tpl?.exercises,
      });
      onClose();
      onCreated(id);
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Neue Einheit">
      <div className="space-y-5">
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setTemplate(null);
            }}
            placeholder="z. B. Push, Oberkörper, Tag A"
            maxLength={80}
          />
        </Field>

        <div>
          <p className="mb-2 text-sm font-medium muted">Vorlage (optional)</p>
          <div className="flex flex-wrap gap-2">
            {WORKOUT_TEMPLATES.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => {
                  setTemplate(t.name === template ? null : t.name);
                  setName(t.name === template ? '' : t.name);
                }}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  template === t.name
                    ? 'bg-gradient-to-br from-brand-300 to-brand-500 text-surface-950'
                    : 'bg-surface-100 dark:bg-white/[0.06]'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
          {tpl && <p className="mt-2 text-xs muted">Mit {tpl.exercises.join(', ')} – je 3 Sätze.</p>}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium muted">Wochentag (optional)</p>
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => setDay(day === i + 1 ? null : i + 1)}
                className={`rounded-xl py-2.5 text-sm font-semibold transition-colors ${
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

        <Button className="w-full" onClick={submit} disabled={!name.trim()} loading={add.isPending}>
          Einheit anlegen
        </Button>
      </div>
    </Sheet>
  );
}
