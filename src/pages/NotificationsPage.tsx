// In-App-Benachrichtigungen: Erinnerungen von Gruppenmitgliedern,
// automatische Erinnerungen und Systemmeldungen.

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useMarkNotificationsRead,
  useNotifications,
} from '@/hooks/queries';
import { formatRelativeTime } from '@/lib/dates';
import { Card, EmptyState, PageTitle, Spinner } from '@/components/ui/basics';
import { IconBell, IconChevronLeft } from '@/components/icons';
import type { NotificationRow } from '@/lib/database.types';

function typeLabel(type: NotificationRow['type']): string {
  switch (type) {
    case 'reminder':
      return 'Erinnerung';
    case 'auto_reminder':
      return 'Automatische Erinnerung';
    case 'group':
      return 'Gruppe';
    default:
      return 'System';
  }
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const { data: notifications, isLoading } = useNotifications();
  const markRead = useMarkNotificationsRead();

  // Beim Öffnen alles als gelesen markieren
  const hasUnread = (notifications ?? []).some((n) => !n.read_at);
  useEffect(() => {
    if (hasUnread && !markRead.isPending) {
      markRead.mutate(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnread]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Zurück"
          className="touch-target flex items-center justify-center rounded-full text-surface-900/60 hover:bg-surface-100 dark:text-surface-100/60 dark:hover:bg-surface-800"
        >
          <IconChevronLeft size={22} />
        </button>
        <PageTitle>Benachrichtigungen</PageTitle>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : !notifications || notifications.length === 0 ? (
        <EmptyState
          title="Alles ruhig"
          description="Hier erscheinen Erinnerungen deiner Gruppe und automatische Hinweise zu offenen Gewohnheiten."
        />
      ) : (
        <ul className="space-y-2.5">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <Card
                className={`flex gap-3 ${
                  notification.read_at ? 'opacity-75' : ''
                }`}
              >
                <span
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    notification.read_at
                      ? 'bg-surface-100 text-surface-900/40 dark:bg-surface-800 dark:text-surface-100/40'
                      : 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300'
                  }`}
                >
                  <IconBell size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{notification.title}</p>
                    <span className="shrink-0 text-xs text-surface-900/40 dark:text-surface-100/40">
                      {formatRelativeTime(notification.created_at)}
                    </span>
                  </div>
                  {notification.body && (
                    <p className="mt-0.5 text-sm text-surface-900/70 dark:text-surface-100/70">
                      {notification.body}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-surface-900/40 dark:text-surface-100/40">
                    {typeLabel(notification.type)}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
