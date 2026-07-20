// „Gruppe“: erstellen/beitreten, Einladungscode teilen, Mitglieder mit
// Tagesstatus, freundliche Erinnerungen senden, Gruppe verlassen.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/context/AuthProvider';
import { useActiveGroup } from '@/hooks/useActiveGroup';
import { useToday } from '@/hooks/useToday';
import {
  useActiveChallenge,
  useCreateGroup,
  useGroupCheckins,
  useGroupMembers,
  useJoinGroup,
  useLeaveGroup,
  useRegenerateInviteCode,
  useSendReminder,
} from '@/hooks/queries';
import {
  groupSchema,
  joinGroupSchema,
  type GroupValues,
  type JoinGroupValues,
} from '@/lib/validation';
import { formatDate } from '@/lib/dates';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageTitle,
  Select,
  Spinner,
} from '@/components/ui/basics';
import { Avatar } from '@/components/ui/Avatar';
import { useToast } from '@/components/ui/toast';
import { IconBell, IconCopy, IconShare } from '@/components/icons';

export function GroupPage() {
  const { user } = useAuth();
  const {
    memberships,
    activeGroupId,
    activeMembership,
    setActiveGroupId,
    isLoading,
  } = useActiveGroup();

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  }

  if (memberships.length === 0 || !activeGroupId) {
    return <GroupOnboarding />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <PageTitle>Gruppe</PageTitle>
        {memberships.length > 1 && (
          <Select
            aria-label="Gruppe wechseln"
            value={activeGroupId}
            onChange={(e) => setActiveGroupId(e.target.value)}
            className="w-44 py-2 text-sm"
          >
            {memberships.map((m) => (
              <option key={m.group_id} value={m.group_id}>
                {m.groups.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      <GroupDetail
        groupId={activeGroupId}
        groupName={activeMembership?.groups.name ?? ''}
        inviteCode={activeMembership?.groups.invite_code ?? ''}
        isOwner={activeMembership?.role === 'owner'}
        userId={user!.id}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Onboarding
function GroupOnboarding() {
  const createGroup = useCreateGroup();
  const joinGroup = useJoinGroup();
  const { showToast } = useToast();

  const createForm = useForm<GroupValues>({ resolver: zodResolver(groupSchema) });
  const joinForm = useForm<JoinGroupValues>({ resolver: zodResolver(joinGroupSchema) });

  return (
    <div className="space-y-4">
      <PageTitle>Los geht’s</PageTitle>

      <Card>
        <h2 className="text-base font-semibold">Neue Gruppe erstellen</h2>
        <p className="mt-1 text-sm text-surface-900/60 dark:text-surface-100/60">
          Für dich und deine Trainingspartner – ihr bekommt einen Einladungscode.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={createForm.handleSubmit(async (values) => {
            try {
              await createGroup.mutateAsync(values.name);
              showToast('Gruppe erstellt!', 'success');
            } catch (err) {
              showToast(err instanceof Error ? err.message : 'Fehler beim Erstellen', 'error');
            }
          })}
        >
          <Field
            label="Gruppenname"
            htmlFor="group-name"
            error={createForm.formState.errors.name?.message}
          >
            <Input
              id="group-name"
              placeholder="z. B. Team Eisen"
              {...createForm.register('name')}
            />
          </Field>
          <Button type="submit" loading={createGroup.isPending} className="w-full">
            Gruppe erstellen
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="text-base font-semibold">Mit Code beitreten</h2>
        <form
          className="mt-4 space-y-3"
          onSubmit={joinForm.handleSubmit(async (values) => {
            try {
              const group = await joinGroup.mutateAsync(values.inviteCode);
              showToast(`Du bist „${group.name}“ beigetreten!`, 'success');
            } catch {
              showToast('Ungültiger Einladungscode', 'error');
            }
          })}
        >
          <Field
            label="Einladungscode"
            htmlFor="invite-code"
            error={joinForm.formState.errors.inviteCode?.message}
          >
            <Input
              id="invite-code"
              placeholder="z. B. 7F3A21BC"
              autoCapitalize="characters"
              autoCorrect="off"
              className="uppercase tracking-widest"
              {...joinForm.register('inviteCode')}
            />
          </Field>
          <Button
            type="submit"
            variant="secondary"
            loading={joinGroup.isPending}
            className="w-full"
          >
            Beitreten
          </Button>
        </form>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- Detail
function GroupDetail({
  groupId,
  groupName,
  inviteCode,
  isOwner,
  userId,
}: {
  groupId: string;
  groupName: string;
  inviteCode: string;
  isOwner: boolean;
  userId: string;
}) {
  const navigate = useNavigate();
  const today = useToday();
  const { showToast } = useToast();
  const { data: members = [] } = useGroupMembers(groupId);
  const { data: challenge } = useActiveChallenge(groupId);
  const { data: groupCheckins = [] } = useGroupCheckins(challenge?.id, today);
  const sendReminder = useSendReminder();
  const leaveGroup = useLeaveGroup();
  const regenerateCode = useRegenerateInviteCode();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [pendingReminder, setPendingReminder] = useState<string | null>(null);

  const inviteLink = `${window.location.origin}/join/${inviteCode}`;

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      showToast('Einladungslink kopiert', 'success');
    } catch {
      showToast(`Einladungscode: ${inviteCode}`, 'info');
    }
  };

  const shareInvite = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'GymPact',
          text: `Mach mit bei unserer Gruppe „${groupName}“ auf GymPact!`,
          url: inviteLink,
        });
        return;
      } catch {
        // Nutzer hat abgebrochen → nichts tun
        return;
      }
    }
    await copyInvite();
  };

  const remind = async (recipientId: string, habitId: string) => {
    const key = `${recipientId}-${habitId}`;
    setPendingReminder(key);
    try {
      await sendReminder.mutateAsync({ recipientId, habitId });
      showToast('Erinnerung gesendet 💪', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Senden fehlgeschlagen', 'error');
    } finally {
      setPendingReminder(null);
    }
  };

  return (
    <>
      {/* Einladung */}
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{groupName}</h2>
            <p className="mt-0.5 text-sm text-surface-900/60 dark:text-surface-100/60">
              Code:{' '}
              <span className="font-mono font-semibold tracking-widest">{inviteCode}</span>
            </p>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={copyInvite}
              aria-label="Einladungslink kopieren"
              className="touch-target flex items-center justify-center rounded-full text-surface-900/60 hover:bg-surface-100 dark:text-surface-100/60 dark:hover:bg-surface-800"
            >
              <IconCopy size={22} />
            </button>
            <button
              type="button"
              onClick={shareInvite}
              aria-label="Einladung teilen"
              className="touch-target flex items-center justify-center rounded-full text-surface-900/60 hover:bg-surface-100 dark:text-surface-100/60 dark:hover:bg-surface-800"
            >
              <IconShare size={22} />
            </button>
          </div>
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={async () => {
              await regenerateCode.mutateAsync(groupId);
              showToast('Neuer Einladungscode erstellt', 'success');
            }}
            className="mt-2 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
          >
            Code erneuern (alter Link wird ungültig)
          </button>
        )}
      </Card>

      {/* Challenge */}
      <Card>
        <h2 className="text-base font-semibold">Challenge</h2>
        {challenge ? (
          <div className="mt-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{challenge.name}</p>
              <Badge tone="brand">Aktiv</Badge>
            </div>
            {challenge.description && (
              <p className="mt-1 text-sm text-surface-900/60 dark:text-surface-100/60">
                {challenge.description}
              </p>
            )}
            <p className="mt-2 text-sm text-surface-900/60 dark:text-surface-100/60">
              {formatDate(challenge.start_date, true)} –{' '}
              {formatDate(challenge.end_date, true)}
            </p>
            <p className="mt-1 text-xs text-surface-900/50 dark:text-surface-100/50">
              {challenge.habits.length} tägliche{' '}
              {challenge.habits.length === 1 ? 'Gewohnheit' : 'Gewohnheiten'}
            </p>
          </div>
        ) : (
          <div className="mt-2">
            <p className="text-sm text-surface-900/60 dark:text-surface-100/60">
              Es gibt noch keine aktive Challenge.
            </p>
            {isOwner ? (
              <Button
                className="mt-3 w-full"
                onClick={() => navigate('/group/new-challenge')}
              >
                Challenge erstellen
              </Button>
            ) : (
              <p className="mt-2 text-xs text-surface-900/50 dark:text-surface-100/50">
                Nur der Gruppen-Owner kann eine Challenge anlegen.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Mitglieder + Erinnerungen */}
      <Card>
        <h2 className="text-base font-semibold">
          Mitglieder ({members.length})
        </h2>
        <ul className="mt-3 space-y-4">
          {members.map((member) => {
            const isMe = member.user_id === userId;
            const checkin = groupCheckins.find((c) => c.user_id === member.user_id);
            const completedIds = new Set(
              (checkin?.habit_entries ?? [])
                .filter((e) => e.completed)
                .map((e) => e.habit_id),
            );
            const openHabits = (challenge?.habits ?? []).filter(
              (h) => !completedIds.has(h.id),
            );

            return (
              <li key={member.user_id}>
                <div className="flex items-center gap-3">
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
                      {member.role === 'owner' ? 'Owner' : 'Mitglied'}
                      {challenge &&
                        ` · heute ${completedIds.size}/${challenge.habits.length}`}
                    </p>
                  </div>
                </div>

                {/* Offene Gewohnheiten → freundlich erinnern */}
                {!isMe && challenge && openHabits.length > 0 && (
                  <div className="ml-[52px] mt-2 flex flex-wrap gap-1.5">
                    {openHabits.map((habit) => {
                      const key = `${member.user_id}-${habit.id}`;
                      return (
                        <button
                          key={habit.id}
                          type="button"
                          disabled={pendingReminder === key}
                          onClick={() => remind(member.user_id, habit.id)}
                          className="inline-flex items-center gap-1 rounded-full border border-surface-200 px-3 py-1.5 text-xs font-medium text-surface-900/70 transition-colors hover:border-brand-400 hover:text-brand-700 disabled:opacity-50 dark:border-surface-800 dark:text-surface-100/70 dark:hover:text-brand-300"
                          aria-label={`${member.profiles.display_name} an „${habit.name}“ erinnern`}
                        >
                          <IconBell size={13} />
                          {habit.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {challenge && members.length > 1 && (
          <p className="mt-4 text-xs text-surface-900/40 dark:text-surface-100/40">
            Tippe auf eine offene Gewohnheit, um freundlich zu erinnern. Erinnerungen
            sind nie anonym.
          </p>
        )}
      </Card>

      {/* Gruppe verlassen */}
      <Card>
        {confirmLeave ? (
          <div className="space-y-3">
            <p className="text-sm">
              Wirklich verlassen? Dein Fortschritt bleibt gespeichert, aber du siehst
              die Gruppe nicht mehr.
            </p>
            <div className="flex gap-2">
              <Button
                variant="danger"
                className="flex-1"
                loading={leaveGroup.isPending}
                onClick={async () => {
                  try {
                    await leaveGroup.mutateAsync(groupId);
                    showToast('Du hast die Gruppe verlassen', 'info');
                  } catch (err) {
                    showToast(
                      err instanceof Error ? err.message : 'Fehler beim Verlassen',
                      'error',
                    );
                  }
                }}
              >
                Verlassen
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setConfirmLeave(false)}
              >
                Abbrechen
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmLeave(true)}
            className="touch-target w-full text-sm font-medium text-red-600 dark:text-red-400"
          >
            Gruppe verlassen
          </button>
        )}
      </Card>
    </>
  );
}
