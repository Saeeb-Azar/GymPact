// Challenge-Erstellung (nur Owner): Zeitraum + konfigurierbare, sortierbare
// Gewohnheiten (boolesch oder numerisch mit Zielwert).

import { useNavigate } from 'react-router-dom';
import { useFieldArray, useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useActiveGroup } from '@/hooks/useActiveGroup';
import { useCreateChallenge } from '@/hooks/queries';
import { challengeSchema, type ChallengeValues } from '@/lib/validation';
import {
  Button,
  Card,
  Field,
  Input,
  PageTitle,
  Select,
  Textarea,
  Toggle,
} from '@/components/ui/basics';
import { useToast } from '@/components/ui/toast';
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronUp,
  IconPlus,
  IconTrash,
} from '@/components/icons';

// Sinnvolle Startkonfiguration – frei anpassbar
const defaultHabits: ChallengeValues['habits'] = [
  { name: 'Training absolviert', type: 'boolean', targetValue: '', unit: '', autoRemind: true },
  { name: 'Kreatin genommen', type: 'boolean', targetValue: '', unit: '', autoRemind: true },
  { name: 'Shake getrunken', type: 'boolean', targetValue: '', unit: '', autoRemind: true },
  { name: 'Protein erreicht', type: 'numeric', targetValue: 180, unit: 'g', autoRemind: true },
  { name: 'Wasser getrunken', type: 'numeric', targetValue: 3000, unit: 'ml', autoRemind: true },
  { name: 'Schritte erreicht', type: 'numeric', targetValue: 8000, unit: '', autoRemind: false },
];

export function NewChallengePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { activeGroupId, activeMembership } = useActiveGroup();
  const createChallenge = useCreateChallenge();

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ChallengeValues>({
    resolver: zodResolver(challengeSchema),
    defaultValues: {
      name: 'Sommer-Challenge',
      description: '',
      startDate: '2026-07-20',
      endDate: '2026-10-15',
      habits: defaultHabits,
    },
  });

  const { fields, append, remove, move } = useFieldArray({ control, name: 'habits' });
  const habitTypes = watch('habits');

  if (!activeGroupId || activeMembership?.role !== 'owner') {
    return (
      <Card>
        <p className="text-sm">Nur der Gruppen-Owner kann eine Challenge erstellen.</p>
        <Button variant="secondary" className="mt-3" onClick={() => navigate('/group')}>
          Zurück zur Gruppe
        </Button>
      </Card>
    );
  }

  const onSubmit = async (values: ChallengeValues) => {
    try {
      await createChallenge.mutateAsync({
        groupId: activeGroupId,
        name: values.name,
        description: values.description,
        startDate: values.startDate,
        endDate: values.endDate,
        habits: values.habits.map((h) => ({
          name: h.name,
          type: h.type,
          target_value: h.type === 'numeric' ? Number(h.targetValue) : null,
          unit: h.type === 'numeric' && h.unit ? h.unit : null,
          auto_remind: h.autoRemind,
        })),
      });
      showToast('Challenge erstellt – viel Erfolg!', 'success');
      navigate('/', { replace: true });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Challenge konnte nicht erstellt werden',
        'error',
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/group')}
          aria-label="Zurück"
          className="touch-target flex items-center justify-center rounded-full text-surface-900/60 hover:bg-surface-100 dark:text-surface-100/60 dark:hover:bg-surface-800"
        >
          <IconChevronLeft size={22} />
        </button>
        <PageTitle>Neue Challenge</PageTitle>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Card className="space-y-4">
          <Field label="Name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" {...register('name')} />
          </Field>
          <Field
            label="Beschreibung (optional)"
            htmlFor="description"
            error={errors.description?.message}
          >
            <Textarea
              id="description"
              rows={2}
              placeholder="Worum geht es euch bei dieser Challenge?"
              {...register('description')}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start" htmlFor="startDate" error={errors.startDate?.message}>
              <Input id="startDate" type="date" {...register('startDate')} />
            </Field>
            <Field label="Ende" htmlFor="endDate" error={errors.endDate?.message}>
              <Input id="endDate" type="date" {...register('endDate')} />
            </Field>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Tägliche Gewohnheiten</h2>
            <span className="text-xs text-surface-900/50 dark:text-surface-100/50">
              {fields.length} konfiguriert
            </span>
          </div>
          {errors.habits?.message && (
            <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
              {errors.habits.message}
            </p>
          )}

          <ul className="mt-3 space-y-4">
            {fields.map((field, index) => {
              const type = habitTypes?.[index]?.type ?? 'boolean';
              const habitErrors = errors.habits?.[index];
              return (
                <li
                  key={field.id}
                  className="rounded-2xl border border-surface-200 p-3 dark:border-surface-800"
                >
                  <div className="flex items-start gap-2">
                    {/* Sortierung */}
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => index > 0 && move(index, index - 1)}
                        disabled={index === 0}
                        aria-label="Nach oben verschieben"
                        className="rounded p-1 text-surface-900/40 hover:text-surface-900 disabled:opacity-25 dark:text-surface-100/40 dark:hover:text-surface-100"
                      >
                        <IconChevronUp size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => index < fields.length - 1 && move(index, index + 1)}
                        disabled={index === fields.length - 1}
                        aria-label="Nach unten verschieben"
                        className="rounded p-1 text-surface-900/40 hover:text-surface-900 disabled:opacity-25 dark:text-surface-100/40 dark:hover:text-surface-100"
                      >
                        <IconChevronDown size={18} />
                      </button>
                    </div>

                    <div className="flex-1 space-y-2.5">
                      <Field
                        label="Name"
                        htmlFor={`habit-name-${index}`}
                        error={habitErrors?.name?.message}
                      >
                        <Input
                          id={`habit-name-${index}`}
                          {...register(`habits.${index}.name`)}
                        />
                      </Field>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Typ" htmlFor={`habit-type-${index}`}>
                          <Select
                            id={`habit-type-${index}`}
                            {...register(`habits.${index}.type`)}
                          >
                            <option value="boolean">Erledigt (ja/nein)</option>
                            <option value="numeric">Zielwert (Zahl)</option>
                          </Select>
                        </Field>
                        {type === 'numeric' && (
                          <div className="grid grid-cols-2 gap-2">
                            <Field
                              label="Ziel"
                              htmlFor={`habit-target-${index}`}
                              error={habitErrors?.targetValue?.message}
                            >
                              <Input
                                id={`habit-target-${index}`}
                                type="text"
                                inputMode="decimal"
                                {...register(`habits.${index}.targetValue`)}
                              />
                            </Field>
                            <Field label="Einheit" htmlFor={`habit-unit-${index}`}>
                              <Input
                                id={`habit-unit-${index}`}
                                placeholder="g, ml, …"
                                {...register(`habits.${index}.unit`)}
                              />
                            </Field>
                          </div>
                        )}
                      </div>
                      <Controller
                        control={control}
                        name={`habits.${index}.autoRemind`}
                        render={({ field: toggleField }) => (
                          <Toggle
                            checked={toggleField.value}
                            onChange={toggleField.onChange}
                            label="Automatische Erinnerung"
                            description="Abends erinnern, falls noch offen"
                          />
                        )}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => remove(index)}
                      aria-label="Gewohnheit entfernen"
                      className="touch-target flex items-center justify-center rounded-full text-surface-900/40 hover:text-red-600 dark:text-surface-100/40"
                    >
                      <IconTrash size={18} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <Button
            type="button"
            variant="secondary"
            className="mt-4 w-full"
            onClick={() =>
              append({ name: '', type: 'boolean', targetValue: '', unit: '', autoRemind: true })
            }
          >
            <IconPlus size={18} /> Gewohnheit hinzufügen
          </Button>
        </Card>

        <Button type="submit" loading={isSubmitting} className="w-full">
          Challenge starten
        </Button>
      </form>
    </div>
  );
}
