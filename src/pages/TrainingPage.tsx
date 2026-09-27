import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { addDays, startOfWeek, type DateString } from '@/lib/dates';
import { WEEKDAYS, isoWeek, totalVolume, weekRangeLabel } from '@/lib/training';
import { useToday } from '@/hooks/useToday';
import {
  useCopyWeek,
  useCreateWeek,
  useDeleteWeek,
  usePreviousWeek,
  useTrainingHistory,
  useTrainingWeek,
  useUpdateWeek,
  type WeekFull,
  type WorkoutFull,
} from '@/hooks/training';
import { errorMessage } from '@/hooks/queries';
import { AddWorkoutSheet } from '@/components/training/AddWorkoutSheet';
import { BodyView } from '@/components/body/BodyView';
import { Button, EmptyState, Field, Input, PageTitle, Textarea } from '@/components/ui/basics';
import { AnimatedNumber, Segmented, Sheet } from '@/components/ui/motion';
import { useToast } from '@/components/ui/toast';
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconMore,
  IconPlus,
  IconTrash,
} from '@/components/icons';

export function weekVolume(week: WeekFull | null | undefined): number {
  if (!week) return 0;
  return totalVolume(
    week.workouts.flatMap((w) => w.workout_exercises.flatMap((e) => e.exercise_sets)),
  );
}

export function TrainingPage() {
  const today = useToday();
  const thisWeek = startOfWeek(today);
  const [params, setParams] = useSearchParams();
  const weekStart = startOfWeek(params.get('week') ?? thisWeek);
  const view = params.get('view') === 'body' ? 'body' : 'plan';
  const setWeek = (w: DateString) => setParams(w === thisWeek ? {} : { week: w }, { replace: true });
  const setView = (v: 'plan' | 'body') => {
    const next = new URLSearchParams(params);
    if (v === 'body') next.set('view', 'body');
    else next.delete('view');
    setParams(next, { replace: true });
  };

  const navigate = useNavigate();
  const { data: week, isLoading, error } = useTrainingWeek(weekStart);
  const { data: prev } = usePreviousWeek(weekStart);
  const { data: history = [] } = useTrainingHistory(addDays(thisWeek, -7 * 11));
  const createWeek = useCreateWeek();
  const copyWeek = useCopyWeek();
  const { showToast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [createdWeekId, setCreatedWeekId] = useState<string | null>(null);

  const prevFull = history.find((h) => h.week_start === prev?.week_start);
  const volume = weekVolume(week);
  const prevVolume = weekVolume(prevFull);
  const delta = prevVolume > 0 && volume > 0 ? Math.round(((volume - prevVolume) / prevVolume) * 100) : null;
  const done = week?.workouts.filter((w) => w.done_at).length ?? 0;
  const totalSets = week?.workouts.reduce(
    (s, w) => s + w.workout_exercises.reduce((a, e) => a + e.exercise_sets.filter((x) => x.reps > 0).length, 0),
    0,
  ) ?? 0;

  const ensureWeek = async () => week?.id ?? (await createWeek.mutateAsync(weekStart));

  return (
    <div className="space-y-4">
      <PageTitle
        eyebrow="Training"
        action={
          view === 'plan' && week && (
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="touch-target flex items-center justify-center rounded-2xl muted hover:bg-surface-100 dark:hover:bg-white/5"
              aria-label="Woche bearbeiten"
            >
              <IconMore />
            </button>
          )
        }
      >
        Trainingsplan
      </PageTitle>

      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'plan', label: '📋 Wochenplan' },
          { value: 'body', label: '🧍 Körper 3D' },
        ]}
      />

      {view === 'body' ? (
        <BodyView today={today} />
      ) : (
      <>
      <WeekStrip current={weekStart} thisWeek={thisWeek} history={history} onSelect={setWeek} />

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setWeek(addDays(weekStart, -7))}
          className="touch-target flex items-center justify-center rounded-2xl hover:bg-surface-100 dark:hover:bg-white/5"
          aria-label="Vorherige Woche"
        >
          <IconChevronLeft />
        </button>
        <div className="text-center">
          <p className="font-display text-2xl font-bold">
            KW {isoWeek(weekStart)}
            {week?.title && <span className="ml-2 text-base font-semibold text-brand-600 dark:text-brand-400">{week.title}</span>}
          </p>
          <p className="text-xs muted">
            {weekRangeLabel(weekStart)}
            {weekStart === thisWeek ? ' · diese Woche' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setWeek(addDays(weekStart, 7))}
          className="touch-target flex items-center justify-center rounded-2xl hover:bg-surface-100 dark:hover:bg-white/5"
          aria-label="Nächste Woche"
        >
          <IconChevronRight />
        </button>
      </div>

      {error && <p className="card p-4 text-sm text-rose-500">{errorMessage(error)}</p>}

      <AnimatePresence mode="wait">
        <motion.div
          key={weekStart}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          {isLoading ? (
            <div className="space-y-3">
              <div className="skeleton h-24" />
              <div className="skeleton h-20" />
              <div className="skeleton h-20" />
            </div>
          ) : !week ? (
            <EmptyState
              emoji="🗓️"
              title="Diese Woche ist noch leer"
              description={
                prev
                  ? `Übernimm deinen Plan aus KW ${isoWeek(prev.week_start)} inklusive Gewichten und Wiederholungen – und steigere dich.`
                  : 'Leg deine erste Trainingswoche an und füge Einheiten wie „Push“, „Pull“ oder „Beine“ hinzu.'
              }
              action={
                <div className="flex w-full flex-col gap-2">
                  {prev && (
                    <Button
                      loading={copyWeek.isPending}
                      onClick={() =>
                        copyWeek.mutate(
                          { sourceWeekId: prev.id, targetStart: weekStart },
                          {
                            onSuccess: () => showToast(`KW ${isoWeek(prev.week_start)} übernommen 💪`, 'success'),
                            onError: (err) => showToast(errorMessage(err), 'error'),
                          },
                        )
                      }
                    >
                      <IconCopy size={18} /> KW {isoWeek(prev.week_start)} übernehmen
                      {prev.workouts?.[0]?.count ? ` (${prev.workouts[0].count} Einheiten)` : ''}
                    </Button>
                  )}
                  <Button
                    variant={prev ? 'secondary' : 'primary'}
                    loading={createWeek.isPending}
                    onClick={async () => {
                      try {
                        setCreatedWeekId(await ensureWeek());
                        setAddOpen(true);
                      } catch (err) {
                        showToast(errorMessage(err), 'error');
                      }
                    }}
                  >
                    <IconPlus size={18} /> Leere Woche starten
                  </Button>
                </div>
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <StatTile label="Einheiten" value={done} suffix={`/${week.workouts.length}`} />
                <StatTile label="Sätze" value={totalSets} />
                <StatTile
                  label="Volumen"
                  value={volume / 1000}
                  decimals={1}
                  suffix=" t"
                  badge={delta !== null ? `${delta >= 0 ? '+' : ''}${delta}%` : undefined}
                  positive={delta !== null && delta >= 0}
                />
              </div>

              {week.notes && <p className="card whitespace-pre-wrap p-4 text-sm muted">{week.notes}</p>}

              <div className="space-y-3">
                <AnimatePresence initial={false}>
                  {week.workouts.map((w, i) => (
                    <WorkoutCard key={w.id} workout={w} index={i} onOpen={() => navigate(`/training/workout/${w.id}`)} />
                  ))}
                </AnimatePresence>
              </div>

              {week.workouts.length === 0 && (
                <p className="px-2 text-center text-sm muted">Noch keine Einheiten in dieser Woche.</p>
              )}

              <Button variant="secondary" className="w-full" onClick={() => setAddOpen(true)}>
                <IconPlus size={18} /> Einheit hinzufügen
              </Button>
            </>
          )}
        </motion.div>
      </AnimatePresence>
      </>
      )}

      <AddWorkoutSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        weekId={week?.id ?? createdWeekId}
        position={week?.workouts.length ?? 0}
        onCreated={(id) => navigate(`/training/workout/${id}`)}
      />
      {week && <WeekMenu week={week} open={menuOpen} onClose={() => setMenuOpen(false)} />}
    </div>
  );
}

function StatTile({
  label,
  value,
  suffix,
  decimals = 0,
  badge,
  positive,
}: {
  label: string;
  value: number;
  suffix?: string;
  decimals?: number;
  badge?: string;
  positive?: boolean;
}) {
  return (
    <div className="card relative p-3">
      <p className="text-[11px] font-medium muted">{label}</p>
      <p className="font-display text-xl font-bold">
        <AnimatedNumber value={value} decimals={decimals} />
        {suffix && <span className="text-sm font-semibold muted">{suffix}</span>}
      </p>
      {badge && (
        <span
          className={`absolute right-2 top-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
            positive ? 'bg-brand-500/15 text-brand-600 dark:text-brand-400' : 'bg-rose-500/15 text-rose-500'
          }`}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

function WorkoutCard({ workout, index, onOpen }: { workout: WorkoutFull; index: number; onOpen: () => void }) {
  const vol = totalVolume(workout.workout_exercises.flatMap((e) => e.exercise_sets));
  const sets = workout.workout_exercises.flatMap((e) => e.exercise_sets);
  const doneSets = sets.filter((s) => s.done).length;
  const progress = sets.length ? doneSets / sets.length : 0;
  const done = !!workout.done_at;

  return (
    <motion.button
      type="button"
      layout
      onClick={onOpen}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ delay: index * 0.04, type: 'spring', stiffness: 280, damping: 26 }}
      whileTap={{ scale: 0.985 }}
      className={`card relative block w-full overflow-hidden p-4 text-left ${done ? 'ring-1 ring-brand-500/40' : ''}`}
    >
      {done && (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-400/10 to-transparent" />
      )}
      <div className="relative flex items-start gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl ${
            done
              ? 'bg-gradient-to-br from-brand-300 to-brand-500 text-surface-950 shadow-glow'
              : 'bg-surface-100 dark:bg-white/[0.06]'
          }`}
        >
          {done ? (
            <IconCheck size={24} strokeWidth={2.6} />
          ) : (
            <span className="font-display text-sm font-bold">
              {workout.day_of_week ? WEEKDAYS[workout.day_of_week - 1] : `#${index + 1}`}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate font-display text-lg font-bold">{workout.name}</h3>
            {vol > 0 && <span className="shrink-0 text-xs muted num">{vol.toLocaleString('de-DE')} kg</span>}
          </div>
          <p className="truncate text-sm muted">
            {workout.workout_exercises.length === 0
              ? 'Noch keine Übungen'
              : workout.workout_exercises.map((e) => e.name).join(' · ')}
          </p>
          {sets.length > 0 && (
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-200 dark:bg-white/[0.07]">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-brand-300 to-brand-500"
                initial={{ width: 0 }}
                animate={{ width: `${(done ? 1 : progress) * 100}%` }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          )}
        </div>
      </div>
    </motion.button>
  );
}

/** Horizontale Wochenleiste der letzten Wochen mit Aktivitätsanzeige. */
function WeekStrip({
  current,
  thisWeek,
  history,
  onSelect,
}: {
  current: DateString;
  thisWeek: DateString;
  history: WeekFull[];
  onSelect: (w: DateString) => void;
}) {
  const weeks = Array.from({ length: 13 }, (_, i) => addDays(thisWeek, (i - 11) * 7));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [current]);
  const maxVol = Math.max(1, ...history.map((h) => weekVolume(h)));

  return (
    <div ref={ref} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1">
      {weeks.map((w) => {
        const h = history.find((x) => x.week_start === w);
        const vol = weekVolume(h);
        const active = w === current;
        const done = h?.workouts.filter((x) => x.done_at).length ?? 0;
        return (
          <button
            key={w}
            type="button"
            data-active={active}
            onClick={() => onSelect(w)}
            className={`relative flex w-14 shrink-0 flex-col items-center gap-1 rounded-2xl py-2 transition-colors ${
              active
                ? 'bg-surface-900 text-white dark:bg-white dark:text-surface-900'
                : 'bg-white/60 dark:bg-white/[0.04]'
            }`}
          >
            <span className="text-[10px] font-medium opacity-60">KW</span>
            <span className="font-display text-base font-bold leading-none">{isoWeek(w)}</span>
            <span className="flex h-5 items-end">
              <span
                className={`w-6 rounded-sm ${h ? 'bg-brand-500' : 'bg-surface-300/50 dark:bg-white/10'}`}
                style={{ height: h ? Math.max(3, (vol / maxVol) * 20) : 3 }}
              />
            </span>
            {done > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[9px] font-bold text-surface-950">
                {done}
              </span>
            )}
            {w === thisWeek && !active && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-brand-500" />}
          </button>
        );
      })}
    </div>
  );
}

function WeekMenu({ week, open, onClose }: { week: WeekFull; open: boolean; onClose: () => void }) {
  const update = useUpdateWeek();
  const del = useDeleteWeek();
  const { showToast } = useToast();
  const [title, setTitle] = useState(week.title);
  const [notes, setNotes] = useState(week.notes);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(week.title);
      setNotes(week.notes);
      setConfirm(false);
    }
  }, [open, week]);

  return (
    <Sheet open={open} onClose={onClose} title={`KW ${isoWeek(week.week_start)} bearbeiten`}>
      <div className="space-y-4">
        <Field label="Titel (optional)" hint="z. B. Deload, Kraftblock, Urlaub">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Notizen">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} />
        </Field>
        <Button
          className="w-full"
          loading={update.isPending}
          onClick={() =>
            update.mutate(
              { id: week.id, title: title.trim(), notes: notes.trim() },
              {
                onSuccess: () => {
                  showToast('Gespeichert', 'success');
                  onClose();
                },
                onError: (err) => showToast(errorMessage(err), 'error'),
              },
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
            del.mutate(week.id, {
              onSuccess: () => {
                showToast('Woche gelöscht', 'info');
                onClose();
              },
              onError: (err) => showToast(errorMessage(err), 'error'),
            });
          }}
        >
          <IconTrash size={18} /> {confirm ? 'Wirklich löschen? Alle Einheiten gehen verloren' : 'Woche löschen'}
        </Button>
      </div>
    </Sheet>
  );
}
