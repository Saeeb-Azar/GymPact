// App-weiter Admin-Bereich: Übersicht über alle Gruppen, Challenges und
// registrierte Nutzer. Zugriff nur für Nutzer in public.app_admins
// (manuell im SQL-Editor vergeben, siehe README).
//
// Bewusst NICHT einsehbar: private Check-ins, Notizen, Gewicht,
// Erinnerungen, Benachrichtigungen oder Push-Abos anderer Nutzer –
// GymPact bleibt eine private App, kein Überwachungstool.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useAdminDeleteGroup,
  useAdminOverview,
  useAdminUserCount,
  useIsAdmin,
} from '@/hooks/queries';
import { formatDate } from '@/lib/dates';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageTitle,
  Spinner,
} from '@/components/ui/basics';
import { useToast } from '@/components/ui/toast';
import { IconChevronLeft, IconTrash } from '@/components/icons';

export function AdminPage() {
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();

  if (isAdmin === undefined) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <EmptyState
        title="Kein Zugriff"
        description="Dieser Bereich ist nur für App-Admins sichtbar."
        action={
          <Button variant="secondary" onClick={() => navigate('/')}>
            Zurück zu „Heute“
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/settings')}
          aria-label="Zurück"
          className="touch-target flex items-center justify-center rounded-full text-surface-900/60 hover:bg-surface-100 dark:text-surface-100/60 dark:hover:bg-surface-800"
        >
          <IconChevronLeft size={22} />
        </button>
        <PageTitle>Admin</PageTitle>
      </div>

      <AdminStats />
      <AdminGroupList />
    </div>
  );
}

function AdminStats() {
  const { data: userCount } = useAdminUserCount();
  const { data: groups } = useAdminOverview();

  return (
    <div className="grid grid-cols-2 gap-3">
      <Card className="py-3 text-center">
        <div className="text-2xl font-bold tabular-nums">{userCount ?? '–'}</div>
        <div className="mt-0.5 text-xs text-surface-900/50 dark:text-surface-100/50">
          Registrierte Nutzer
        </div>
      </Card>
      <Card className="py-3 text-center">
        <div className="text-2xl font-bold tabular-nums">{groups?.length ?? '–'}</div>
        <div className="mt-0.5 text-xs text-surface-900/50 dark:text-surface-100/50">
          Gruppen
        </div>
      </Card>
    </div>
  );
}

function AdminGroupList() {
  const { data: groups, isLoading } = useAdminOverview();
  const deleteGroup = useAdminDeleteGroup();
  const { showToast } = useToast();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }

  if (!groups || groups.length === 0) {
    return <EmptyState title="Noch keine Gruppen" description="Es wurde noch keine Gruppe erstellt." />;
  }

  return (
    <Card>
      <h2 className="text-base font-semibold">Alle Gruppen</h2>
      <ul className="mt-3 divide-y divide-surface-100 dark:divide-surface-800">
        {groups.map((group) => {
          const owner = group.group_members.find((m) => m.role === 'owner');
          const activeChallenge = group.challenges.find((c) => c.status === 'active');
          return (
            <li key={group.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{group.name}</p>
                  <p className="mt-0.5 text-xs text-surface-900/50 dark:text-surface-100/50">
                    Owner: {owner?.profiles.display_name ?? 'unbekannt'} ·{' '}
                    {group.group_members.length}{' '}
                    {group.group_members.length === 1 ? 'Mitglied' : 'Mitglieder'} ·
                    Code {group.invite_code}
                  </p>
                  <p className="mt-0.5 text-xs text-surface-900/40 dark:text-surface-100/40">
                    Erstellt am {formatDate(group.created_at.slice(0, 10), true)}
                  </p>
                  {activeChallenge ? (
                    <p className="mt-1.5 text-sm">
                      <Badge tone="brand">Aktive Challenge</Badge>{' '}
                      <span className="text-surface-900/70 dark:text-surface-100/70">
                        {activeChallenge.name}
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1.5">
                      <Badge>Keine aktive Challenge</Badge>
                    </p>
                  )}
                </div>

                {confirmId === group.id ? (
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <Button
                      variant="danger"
                      className="px-3 py-1.5 text-xs"
                      loading={deleteGroup.isPending}
                      onClick={async () => {
                        try {
                          await deleteGroup.mutateAsync(group.id);
                          showToast(`„${group.name}“ gelöscht`, 'info');
                        } catch (err) {
                          showToast(
                            err instanceof Error ? err.message : 'Löschen fehlgeschlagen',
                            'error',
                          );
                        } finally {
                          setConfirmId(null);
                        }
                      }}
                    >
                      Wirklich löschen
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => setConfirmId(null)}
                    >
                      Abbrechen
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(group.id)}
                    aria-label={`Gruppe „${group.name}“ löschen`}
                    className="touch-target flex shrink-0 items-center justify-center rounded-full text-surface-900/40 hover:text-red-600 dark:text-surface-100/40"
                  >
                    <IconTrash size={18} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
