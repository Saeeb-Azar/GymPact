import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useNotificationsRealtime, useUnreadCount } from '@/hooks/queries';
import { useToast } from './ui/toast';
import {
  IconBell,
  IconGroup,
  IconProgress,
  IconSettings,
  IconToday,
} from './icons';

const navItems = [
  { to: '/', label: 'Heute', icon: IconToday },
  { to: '/group', label: 'Gruppe', icon: IconGroup },
  { to: '/progress', label: 'Fortschritt', icon: IconProgress },
  { to: '/settings', label: 'Einstellungen', icon: IconSettings },
];

/** App-Shell: Kopfzeile mit Benachrichtigungen, Inhalt, Bottom-Navigation. */
export function AppLayout() {
  const unread = useUnreadCount();
  const navigate = useNavigate();
  const { showToast } = useToast();

  // Neue Benachrichtigungen live als Toast anzeigen
  useNotificationsRealtime((notification) => {
    showToast(notification.title, 'info');
  });

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header
        className="sticky top-0 z-30 flex items-center justify-between bg-surface-50/90 px-4 pb-2 backdrop-blur dark:bg-surface-950/90"
        style={{ paddingTop: 'calc(var(--safe-top) + 0.75rem)' }}
      >
        <span className="text-lg font-bold tracking-tight text-brand-700 dark:text-brand-300">
          GymPact
        </span>
        <button
          type="button"
          onClick={() => navigate('/notifications')}
          className="touch-target relative flex items-center justify-center rounded-full text-surface-900/70 hover:bg-surface-100 dark:text-surface-100/70 dark:hover:bg-surface-850"
          aria-label={
            unread > 0
              ? `Benachrichtigungen, ${unread} ungelesen`
              : 'Benachrichtigungen'
          }
        >
          <IconBell size={24} />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </header>

      <main className="flex-1 px-4 pb-28 pt-1">
        <Outlet />
      </main>

      <nav
        aria-label="Hauptnavigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-surface-200 bg-white/95 backdrop-blur dark:border-surface-800 dark:bg-surface-900/95"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="mx-auto flex max-w-lg">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'text-brand-700 dark:text-brand-300'
                    : 'text-surface-900/50 hover:text-surface-900/80 dark:text-surface-100/50 dark:hover:text-surface-100/80'
                }`
              }
            >
              <Icon size={24} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
