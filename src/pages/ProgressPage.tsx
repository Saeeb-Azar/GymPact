// „Fortschritt“: Kalender, Wochenstatistik, Gewichtsverlauf und
// Kennzahlen je Gewohnheit (z. B. Trainingsanzahl, Protein-Durchschnitt).

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useActiveGroup } from '@/hooks/useActiveGroup';
import { useToday } from '@/hooks/useToday';
import { useActiveChallenge, useMyChallengeCheckins } from '@/hooks/queries';
import {
  computeDayCompletions,
  computeHabitStats,
  currentStreak,
  fullDayCount,
  longestStreak,
  weekCompletionRate,
  type EntryLite,
} from '@/lib/stats';
import { addDays, formatDateShort, type DateString } from '@/lib/dates';
import { Button, Card, EmptyState, PageTitle, Spinner } from '@/components/ui/basics';
import { CalendarGrid } from '@/components/charts/CalendarGrid';
import { LineChart } from '@/components/charts/LineChart';
import { WeekBars } from '@/components/charts/WeekBars';

export function ProgressPage() {
  const today = useToday();
  const { activeGroupId, memberships, isLoading: groupsLoading } = useActiveGroup();
  const { data: challenge, isLoading: challengeLoading } =
    useActiveChallenge(activeGroupId);
  const { data: myCheckins = [], isLoading: checkinsLoading } =
    useMyChallengeCheckins(challenge?.id);

  const stats = useMemo(() => {
    if (!challenge) return null;
    const entriesByDate = new Map<DateString, EntryLite[]>(
      myCheckins.map((c) => [c.date, c.habit_entries]),
    );
    const until = today < challenge.end_date ? today : challenge.end_date;
    const days = computeDayCompletions(
      challenge.start_date,
      until,
      challenge.habits,
      entriesByDate,
    );
    const last7Start = addDays(today, -6);
    return {
      days,
      current: currentStreak(days, today),
      longest: longestStreak(days),
      week: weekCompletionRate(days, today),
      fullDays: fullDayCount(days),
      last7: days.filter((d) => d.date >= last7Start),
      habitStats: computeHabitStats(challenge.habits, entriesByDate),
    };
  }, [challenge, myCheckins, today]);

  if (groupsLoading || challengeLoading || checkinsLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  }

  if (memberships.length === 0 || !challenge || !stats) {
    return (
      <EmptyState
        title="Noch kein Fortschritt"
        description="Sobald eure Challenge läuft und du eincheckst, siehst du hier Statistiken, Kalender und Verläufe."
        action={
          <Link to="/group">
            <Button>Zur Gruppe</Button>
          </Link>
        }
      />
    );
  }

  const weightPoints = myCheckins
    .filter((c) => c.weight_kg !== null)
    .map((c) => ({ label: formatDateShort(c.date), value: c.weight_kg as number }));

  return (
    <div className="space-y-4">
      <PageTitle>Fortschritt</PageTitle>

      {/* Kennzahlen */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard value={String(stats.current)} label="Aktuelle Serie" suffix=" Tage" />
        <StatCard value={String(stats.longest)} label="Längste Serie" suffix=" Tage" />
        <StatCard value={String(stats.fullDays)} label="Vollständige Tage" />
        <StatCard
          value={`${Math.round(stats.week * 100)}%`}
          label="Erfüllung diese Woche"
        />
      </div>

      {/* Wochenstatistik */}
      <Card>
        <h2 className="text-base font-semibold">Letzte 7 Tage</h2>
        <div className="mt-4">
          <WeekBars days={stats.last7} />
        </div>
      </Card>

      {/* Gewichtsverlauf */}
      <Card>
        <h2 className="text-base font-semibold">Gewichtsverlauf</h2>
        {weightPoints.length >= 2 ? (
          <div className="mt-3">
            <LineChart points={weightPoints} unit=" kg" />
            <p className="mt-1 text-xs text-surface-900/50 dark:text-surface-100/50">
              {weightPoints[0].value.toFixed(1)} kg →{' '}
              {weightPoints[weightPoints.length - 1].value.toFixed(1)} kg (
              {(
                weightPoints[weightPoints.length - 1].value - weightPoints[0].value
              ).toFixed(1)}{' '}
              kg)
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-surface-900/50 dark:text-surface-100/50">
            Trage dein Gewicht beim Check-in ein, um hier den Verlauf zu sehen.
          </p>
        )}
      </Card>

      {/* Kennzahlen je Gewohnheit */}
      <Card>
        <h2 className="text-base font-semibold">Gewohnheiten</h2>
        <ul className="mt-3 space-y-2.5">
          {challenge.habits.map((habit) => {
            const stat = stats.habitStats.get(habit.id);
            return (
              <li key={habit.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm">{habit.name}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {habit.type === 'numeric' && stat?.average !== null && stat ? (
                    <>
                      Ø {stat.average.toFixed(0)}
                      {habit.unit ? ` ${habit.unit}` : ''}
                    </>
                  ) : (
                    <>
                      {stat?.completedCount ?? 0}×{' '}
                      <span className="font-normal text-surface-900/50 dark:text-surface-100/50">
                        erledigt
                      </span>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Kalender */}
      <Card>
        <h2 className="mb-3 text-base font-semibold">Kalender</h2>
        <CalendarGrid
          start={challenge.start_date}
          end={challenge.end_date}
          today={today}
          days={stats.days}
        />
      </Card>
    </div>
  );
}

function StatCard({
  value,
  label,
  suffix = '',
}: {
  value: string;
  label: string;
  suffix?: string;
}) {
  return (
    <Card className="py-3 text-center">
      <div className="text-2xl font-bold tabular-nums">
        {value}
        {suffix && (
          <span className="text-sm font-medium text-surface-900/50 dark:text-surface-100/50">
            {suffix}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-xs text-surface-900/50 dark:text-surface-100/50">
        {label}
      </div>
    </Card>
  );
}
