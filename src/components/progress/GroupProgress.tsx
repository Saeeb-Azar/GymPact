// Gemeinsame Gruppenansicht: wie weit ist jede*r heute, was fehlt noch,
// und der Gesamt-Fortschritt aller über die ganze Challenge – visuell,
// ruhig und ohne aggressive Ranglisten.

import { useMemo } from 'react';
import {
  useChallengeHabitTargets,
  type ChallengeWithHabits,
  type CheckinWithEntries,
  type MemberWithProfile,
} from '@/hooks/queries';
import {
  computeDayCompletion,
  computeDayCompletions,
  currentStreak,
  fullDayCount,
  overallCompletionRate,
  type DayCompletion,
  type EntryLite,
} from '@/lib/stats';
import type { DateString } from '@/lib/dates';
import type { HabitRow } from '@/lib/database.types';
import { Badge, Card } from '@/components/ui/basics';
import { ProgressRing, MiniRing } from '@/components/ui/ProgressRing';
import { Avatar } from '@/components/ui/Avatar';
import { IconCheck, IconFlame } from '@/components/icons';

interface MemberProgress {
  member: MemberWithProfile;
  today: DayCompletion;
  overall: number;
  fullDays: number;
  streak: number;
}

interface GroupProgressProps {
  challenge: ChallengeWithHabits;
  members: MemberWithProfile[];
  checkins: CheckinWithEntries[];
  today: DateString;
  currentUserId: string;
}

export function GroupProgress({
  challenge,
  members,
  checkins,
  today,
  currentUserId,
}: GroupProgressProps) {
  // Persönliche Zielwerte aller Mitglieder ("35 / 180 g" statt nur ✓/✗)
  const { data: allTargets = [] } = useChallengeHabitTargets(challenge);
  const targetFor = (habit: HabitRow, userId: string): number | null => {
    const personal = allTargets.find(
      (t) => t.habit_id === habit.id && t.user_id === userId,
    );
    return personal?.target_value ?? habit.target_value;
  };
  const perMember = useMemo<MemberProgress[]>(() => {
    const until = today < challenge.end_date ? today : challenge.end_date;
    return members.map((member) => {
      const memberCheckins = checkins.filter((c) => c.user_id === member.user_id);
      const entriesByDate = new Map<DateString, EntryLite[]>(
        memberCheckins.map((c) => [c.date, c.habit_entries]),
      );
      const days = computeDayCompletions(
        challenge.start_date,
        until,
        challenge.habits,
        entriesByDate,
      );
      const todayCheckin = memberCheckins.find((c) => c.date === today);
      return {
        member,
        today: computeDayCompletion(today, challenge.habits, todayCheckin?.habit_entries),
        overall: overallCompletionRate(days),
        fullDays: fullDayCount(days),
        streak: currentStreak(days, today),
      };
    });
  }, [challenge, members, checkins, today]);

  // Heutige Rangfolge – dezent, ohne Platznummern oder Medaillen
  const todayStandings = useMemo(
    () => [...perMember].sort((a, b) => b.today.ratio - a.today.ratio),
    [perMember],
  );

  // Gruppen-Durchschnitt heute
  const groupTodayRatio =
    perMember.length === 0
      ? 0
      : perMember.reduce((acc, m) => acc + m.today.ratio, 0) / perMember.length;
  const fullToday = perMember.filter((m) => m.today.isFull).length;

  // Wer hat welche Gewohnheit heute noch offen?
  const perHabitToday = useMemo(() => {
    return challenge.habits.map((habit) => {
      const done: MemberWithProfile[] = [];
      const open: MemberWithProfile[] = [];
      for (const { member, today: t } of perMember) {
        const checkin = checkins.find(
          (c) => c.user_id === member.user_id && c.date === today,
        );
        const completed = (checkin?.habit_entries ?? []).some(
          (e) => e.habit_id === habit.id && e.completed,
        );
        void t;
        (completed ? done : open).push(member);
      }
      return { habit, done, open };
    });
  }, [challenge.habits, perMember, checkins, today]);

  return (
    <div className="space-y-4">
      {/* Gruppen-Überblick heute */}
      <Card className="animate-fade-up">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Heute als Gruppe</h2>
            <p className="mt-0.5 text-sm text-surface-900/60 dark:text-surface-100/60">
              {fullToday} von {perMember.length}{' '}
              {perMember.length === 1 ? 'Person' : 'Personen'} schon komplett
            </p>
          </div>
          <ProgressRing
            value={groupTodayRatio}
            size={92}
            strokeWidth={8}
            sublabel="Schnitt"
          />
        </div>
      </Card>

      {/* Detail-Karten je Mitglied: alle Werte im Vergleich zum Ziel */}
      <div className="space-y-3">
        {todayStandings.map(({ member, today: t, streak }) => {
          const isMe = member.user_id === currentUserId;
          const checkin = checkins.find(
            (c) => c.user_id === member.user_id && c.date === today,
          );
          return (
            <Card key={member.user_id} className="animate-fade-up">
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <Avatar
                    name={member.profiles.display_name}
                    avatarUrl={member.profiles.avatar_url}
                    size={44}
                  />
                  <span className="absolute -bottom-1 -right-1">
                    <MiniRing value={t.ratio} size={22} />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {member.profiles.display_name}
                    {isMe && (
                      <span className="font-normal text-surface-900/40 dark:text-surface-100/40">
                        {' '}
                        (du)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-surface-900/50 dark:text-surface-100/50">
                    {t.completed}/{t.total} erledigt
                    {!checkin && ' · noch kein Check-in heute'}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-2">
                  {streak > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-500">
                      <IconFlame size={14} />
                      {streak}
                    </span>
                  )}
                  {t.isFull && <Badge tone="brand">Komplett</Badge>}
                </span>
              </div>

              {/* Alle Gewohnheiten mit echten Werten */}
              <ul className="mt-3 space-y-2 border-t border-surface-100 pt-3 dark:border-surface-800">
                {challenge.habits.map((habit) => {
                  const entry = (checkin?.habit_entries ?? []).find(
                    (e) => e.habit_id === habit.id,
                  );
                  const completed = entry?.completed ?? false;

                  if (habit.type === 'boolean') {
                    return (
                      <li
                        key={habit.id}
                        className="flex items-center justify-between gap-3"
                      >
                        <span
                          className={`min-w-0 truncate text-sm ${
                            completed
                              ? 'text-surface-900/50 line-through dark:text-surface-100/50'
                              : ''
                          }`}
                        >
                          {habit.name}
                        </span>
                        {completed ? (
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
                            <IconCheck size={12} strokeWidth={3} />
                          </span>
                        ) : (
                          <span className="h-5 w-5 shrink-0 rounded-full border-2 border-surface-200 dark:border-surface-800" />
                        )}
                      </li>
                    );
                  }

                  const target = targetFor(habit, member.user_id);
                  const value = entry?.value_numeric ?? 0;
                  const ratio =
                    target && target > 0 ? Math.min(1, value / target) : 0;
                  return (
                    <li key={habit.id}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-sm">{habit.name}</span>
                        <span
                          className={`shrink-0 text-sm font-semibold tabular-nums ${
                            completed
                              ? 'text-brand-700 dark:text-brand-300'
                              : 'text-surface-900/70 dark:text-surface-100/70'
                          }`}
                        >
                          {value % 1 === 0 ? value : value.toFixed(1)}
                          {' / '}
                          {target ?? '–'}
                          {habit.unit ? ` ${habit.unit}` : ''}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-100 dark:bg-surface-800">
                        <div
                          className={`h-full rounded-full transition-[width] duration-300 ${
                            completed ? 'bg-brand-500' : 'bg-brand-300 dark:bg-brand-700'
                          }`}
                          style={{ width: `${ratio * 100}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>

      {/* Was fehlt heute noch – je Gewohnheit */}
      <Card className="animate-fade-up">
        <h2 className="text-base font-semibold">Was fehlt heute noch?</h2>
        <ul className="mt-3 space-y-3">
          {perHabitToday.map(({ habit, done, open }) => {
            const total = members.length;
            const ratio = total === 0 ? 0 : done.length / total;
            return (
              <li key={habit.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{habit.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-surface-900/50 dark:text-surface-100/50">
                    {done.length}/{total}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-100 dark:bg-surface-800">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-[width] duration-300"
                      style={{ width: `${ratio * 100}%` }}
                    />
                  </div>
                  {open.length === 0 ? (
                    <Badge tone="brand">alle ✓</Badge>
                  ) : (
                    <div className="flex -space-x-1.5">
                      {open.slice(0, 5).map((member) => (
                        <span
                          key={member.user_id}
                          className="ring-2 ring-white dark:ring-surface-850"
                          title={`${member.profiles.display_name} – offen`}
                        >
                          <Avatar
                            name={member.profiles.display_name}
                            avatarUrl={member.profiles.avatar_url}
                            size={24}
                          />
                        </span>
                      ))}
                      {open.length > 5 && (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-200 text-[10px] font-medium ring-2 ring-white dark:bg-surface-800 dark:ring-surface-850">
                          +{open.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-surface-900/40 dark:text-surface-100/40">
          Du kannst deine Mitglieder unter „Gruppe“ freundlich an offene Ziele erinnern.
        </p>
      </Card>

      {/* Gesamt-Fortschritt über die Challenge */}
      <Card className="animate-fade-up">
        <h2 className="text-base font-semibold">Gesamt-Fortschritt</h2>
        <p className="mt-0.5 text-xs text-surface-900/50 dark:text-surface-100/50">
          Durchschnittliche Erfüllung seit dem Start
        </p>
        <ul className="mt-3 space-y-3">
          {[...perMember]
            .sort((a, b) => b.overall - a.overall)
            .map(({ member, overall, fullDays }) => (
              <li key={member.user_id} className="flex items-center gap-3">
                <Avatar
                  name={member.profiles.display_name}
                  avatarUrl={member.profiles.avatar_url}
                  size={32}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {member.profiles.display_name}
                    </span>
                    <span className="shrink-0 text-xs text-surface-900/50 dark:text-surface-100/50">
                      {fullDays} volle Tage · {Math.round(overall * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-100 dark:bg-surface-800">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-[width] duration-500"
                      style={{ width: `${overall * 100}%` }}
                    />
                  </div>
                </div>
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}
