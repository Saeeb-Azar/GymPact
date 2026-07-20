// „Heute“: Dashboard (Countdown, Ringe, Serien, Status) + Tages-Check-in
// + Live-Fortschritt der Gruppe + letzte Aktivitäten.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthProvider';
import { useActiveGroup } from '@/hooks/useActiveGroup';
import { useToday } from '@/hooks/useToday';
import { useCheckinManager } from '@/hooks/useCheckinManager';
import {
  useActiveChallenge,
  useChallengeRealtime,
  useGroupCheckins,
  useGroupMembers,
  useMyChallengeCheckins,
  useMyHabitTargets,
  useRecentActivity,
} from '@/hooks/queries';
import {
  computeDayCompletion,
  computeDayCompletions,
  currentStreak,
  longestStreak,
  motivationalStatus,
  weekCompletionRate,
  type EntryLite,
} from '@/lib/stats';
import { diffDays, formatDate, formatRelativeTime, type DateString } from '@/lib/dates';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui/basics';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { Avatar } from '@/components/ui/Avatar';
import { HabitCheckRow } from '@/components/checkin/HabitRow';
import { SaveStatusIndicator } from '@/components/checkin/SaveStatus';
import { PersonalTargetsForm } from '@/components/checkin/PersonalTargetsForm';
import { IconFlame } from '@/components/icons';
import { Input, Textarea } from '@/components/ui/basics';

export function TodayPage() {
  const { user } = useAuth();
  const today = useToday();
  const { activeGroupId, memberships, isLoading: groupsLoading } = useActiveGroup();
  const { data: challenge, isLoading: challengeLoading } =
    useActiveChallenge(activeGroupId);

  useChallengeRealtime(challenge?.id);

  const { data: myTargets = [] } = useMyHabitTargets();

  // Persönliche Zielwerte über die Standardwerte der Challenge legen –
  // das Thema ist für die Gruppe gleich, der Zielwert aber pro Person.
  const effectiveChallenge = useMemo(() => {
    if (!challenge) return challenge;
    return {
      ...challenge,
      habits: challenge.habits.map((habit) => {
        if (habit.type !== 'numeric') return habit;
        const personal = myTargets.find((t) => t.habit_id === habit.id);
        return personal ? { ...habit, target_value: personal.target_value } : habit;
      }),
    };
  }, [challenge, myTargets]);

  const missingNumericHabits = useMemo(
    () =>
      (challenge?.habits ?? []).filter(
        (h) => h.type === 'numeric' && !myTargets.some((t) => t.habit_id === h.id),
      ),
    [challenge, myTargets],
  );

  const manager = useCheckinManager(effectiveChallenge, today);
  const { data: members = [] } = useGroupMembers(activeGroupId);
  const { data: groupCheckins = [] } = useGroupCheckins(challenge?.id, today);
  const { data: myCheckins = [] } = useMyChallengeCheckins(challenge?.id);
  const { data: recentActivity = [] } = useRecentActivity(challenge?.id);

  // Serien und Wochenquote aus der eigenen Historie
  const streakStats = useMemo(() => {
    if (!challenge) return { current: 0, longest: 0, week: 0 };
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
    return {
      current: currentStreak(days, today),
      longest: longestStreak(days),
      week: weekCompletionRate(days, today),
    };
  }, [challenge, myCheckins, today]);

  if (groupsLoading || challengeLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  }

  if (memberships.length === 0) {
    return (
      <EmptyState
        title="Willkommen bei GymPact!"
        description="Erstelle eine Gruppe für euch oder tritt mit einem Einladungscode bei – dann kann eure Challenge starten."
        action={
          <Link to="/group">
            <Button>Gruppe einrichten</Button>
          </Link>
        }
      />
    );
  }

  if (!challenge) {
    return (
      <EmptyState
        title="Noch keine aktive Challenge"
        description="Legt gemeinsam eine Challenge mit euren täglichen Gewohnheiten fest."
        action={
          <Link to="/group">
            <Button>Zur Gruppe</Button>
          </Link>
        }
      />
    );
  }

  const remainingDays = Math.max(0, diffDays(today, challenge.end_date));
  const notStarted = today < challenge.start_date;
  const finished = today > challenge.end_date;

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------ Dashboard-Kopf */}
      <Card className="animate-fade-up">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{challenge.name}</h1>
            <p className="mt-0.5 text-sm text-surface-900/60 dark:text-surface-100/60">
              {notStarted
                ? `Startet am ${formatDate(challenge.start_date, true)}`
                : finished
                  ? 'Challenge abgeschlossen'
                  : remainingDays === 0
                    ? 'Letzter Tag – Endspurt!'
                    : `Noch ${remainingDays} ${remainingDays === 1 ? 'Tag' : 'Tage'}`}
            </p>
          </div>
          <ProgressRing value={manager.ratio} size={96} strokeWidth={8} />
        </div>

        <p className="mt-3 text-sm font-medium text-brand-700 dark:text-brand-300">
          {motivationalStatus(manager.ratio, streakStats.current, finished ? 0 : remainingDays)}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-surface-100 px-2 py-3 dark:bg-surface-800">
            <div className="flex items-center justify-center gap-1 text-lg font-bold tabular-nums">
              <IconFlame size={18} className="text-amber-500" />
              {streakStats.current}
            </div>
            <div className="text-[11px] text-surface-900/50 dark:text-surface-100/50">
              Aktuelle Serie
            </div>
          </div>
          <div className="rounded-2xl bg-surface-100 px-2 py-3 dark:bg-surface-800">
            <div className="text-lg font-bold tabular-nums">{streakStats.longest}</div>
            <div className="text-[11px] text-surface-900/50 dark:text-surface-100/50">
              Längste Serie
            </div>
          </div>
          <div className="rounded-2xl bg-surface-100 px-2 py-3 dark:bg-surface-800">
            <div className="text-lg font-bold tabular-nums">
              {Math.round(streakStats.week * 100)}%
            </div>
            <div className="text-[11px] text-surface-900/50 dark:text-surface-100/50">
              Diese Woche
            </div>
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------ Persönliche Ziele */}
      {!notStarted && !finished && missingNumericHabits.length > 0 && (
        <PersonalTargetsForm habits={missingNumericHabits} />
      )}

      {/* ------------------------------------------------ Tages-Check-in */}
      {!notStarted && !finished && missingNumericHabits.length === 0 && (
        <Card className="animate-fade-up">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">
              Check-in · {formatDate(today)}
            </h2>
            <SaveStatusIndicator status={manager.saveStatus} />
          </div>
          <p className="mt-0.5 text-xs text-surface-900/50 dark:text-surface-100/50">
            {manager.completedCount} von {manager.totalCount} erledigt
          </p>

          <div className="mt-2 divide-y divide-surface-100 dark:divide-surface-800">
            {(effectiveChallenge?.habits ?? []).map((habit) => (
              <HabitCheckRow
                key={habit.id}
                habit={habit}
                booleanValue={manager.booleanValue(habit)}
                numericValue={manager.numericValue(habit)}
                completed={manager.isCompleted(habit)}
                onToggle={(next) => manager.toggleHabit(habit, next)}
                onNumericChange={(raw) => manager.setNumericValue(habit, raw)}
              />
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="flex items-center gap-3">
              <label
                htmlFor="weight"
                className="w-24 shrink-0 text-sm font-medium text-surface-900/70 dark:text-surface-100/70"
              >
                Gewicht
              </label>
              <div className="flex flex-1 items-center gap-1.5">
                <Input
                  id="weight"
                  type="text"
                  inputMode="decimal"
                  placeholder="z. B. 82,4"
                  value={manager.weight}
                  onChange={(e) => manager.setWeight(e.target.value)}
                  className="py-2 text-right tabular-nums"
                />
                <span className="text-sm text-surface-900/50 dark:text-surface-100/50">
                  kg
                </span>
              </div>
            </div>
            <div>
              <label
                htmlFor="note"
                className="mb-1 block text-sm font-medium text-surface-900/70 dark:text-surface-100/70"
              >
                Tagesnotiz
              </label>
              <Textarea
                id="note"
                rows={2}
                maxLength={500}
                placeholder="Wie lief dein Tag?"
                value={manager.note}
                onChange={(e) => manager.setNote(e.target.value)}
              />
            </div>
          </div>
        </Card>
      )}

      {/* ------------------------------------------------ Gruppe heute */}
      <Card className="animate-fade-up">
        <h2 className="text-base font-semibold">Eure Gruppe heute</h2>
        <ul className="mt-3 space-y-3">
          {members.map((member) => {
            const checkin = groupCheckins.find((c) => c.user_id === member.user_id);
            const completion = computeDayCompletion(
              today,
              challenge.habits,
              checkin?.habit_entries,
            );
            const isMe = member.user_id === user?.id;
            return (
              <li key={member.user_id} className="flex items-center gap-3">
                <Avatar
                  name={member.profiles.display_name}
                  avatarUrl={member.profiles.avatar_url}
                  size={40}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {member.profiles.display_name}
                    {isMe && (
                      <span className="text-surface-900/40 dark:text-surface-100/40">
                        {' '}
                        (du)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-surface-900/50 dark:text-surface-100/50">
                    {completion.completed} / {completion.total} erledigt
                  </p>
                </div>
                {completion.isFull ? (
                  <Badge tone="brand">Komplett</Badge>
                ) : (
                  <span className="text-sm font-semibold tabular-nums text-surface-900/60 dark:text-surface-100/60">
                    {Math.round(completion.ratio * 100)}%
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <Link
          to="/group"
          className="mt-4 block text-center text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
        >
          Zur Gruppe & Erinnerungen
        </Link>
      </Card>

      {/* ------------------------------------------------ Aktivitäten */}
      {recentActivity.length > 0 && (
        <Card className="animate-fade-up">
          <h2 className="text-base font-semibold">Letzte Aktivitäten</h2>
          <ul className="mt-3 space-y-2.5">
            {recentActivity.slice(0, 6).map((activity) => {
              const member = members.find((m) => m.user_id === activity.user_id);
              const name =
                activity.user_id === user?.id
                  ? 'Du'
                  : (member?.profiles.display_name ?? 'Mitglied');
              const done = activity.habit_entries.filter((e) => e.completed).length;
              return (
                <li
                  key={activity.id}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{name}</span>{' '}
                    <span className="text-surface-900/60 dark:text-surface-100/60">
                      hat eingecheckt · {done}/{challenge.habits.length} erledigt
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-surface-900/40 dark:text-surface-100/40">
                    {formatRelativeTime(activity.updated_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
