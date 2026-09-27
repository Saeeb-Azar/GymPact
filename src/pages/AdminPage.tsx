import { motion } from 'framer-motion';
import { Link, Navigate } from 'react-router-dom';
import { errorMessage, useAdminUserOverview, useIsAdmin } from '@/hooks/queries';
import { formatRelativeTime } from '@/lib/dates';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, PageTitle, Spinner } from '@/components/ui/basics';
import { AnimatedNumber } from '@/components/ui/motion';
import { IconChevronLeft } from '@/components/icons';

/** App-weite Übersicht für Admins: Nutzer und Aktivität (nur Zählwerte). */
export function AdminPage() {
  const isAdmin = useIsAdmin();
  const { data: users = [], isLoading, error } = useAdminUserOverview(isAdmin === true);

  if (isAdmin === undefined) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8 text-brand-500" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  const totals = users.reduce(
    (acc, u) => ({
      entries: acc.entries + Number(u.food_entries),
      workouts: acc.workouts + Number(u.workouts_done),
    }),
    { entries: 0, workouts: 0 },
  );

  return (
    <div className="space-y-4">
      <Link to="/settings" className="-ml-1 inline-flex items-center gap-1 text-sm font-medium muted">
        <IconChevronLeft size={18} /> Einstellungen
      </Link>
      <PageTitle eyebrow="Admin">Nutzer</PageTitle>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Nutzer', value: users.length },
          { label: 'Essens-Einträge', value: totals.entries },
          { label: 'Workouts', value: totals.workouts },
        ].map((k) => (
          <div key={k.label} className="card p-3">
            <p className="text-[11px] muted">{k.label}</p>
            <p className="font-display text-xl font-bold">
              <AnimatedNumber value={k.value} />
            </p>
          </div>
        ))}
      </div>

      {error && <p className="card p-4 text-sm text-rose-500">{errorMessage(error)}</p>}
      {isLoading && <div className="skeleton h-40" />}

      <div className="space-y-3">
        {users.map((u, i) => (
          <motion.div
            key={u.user_id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="card p-4"
          >
            <div className="flex items-center gap-3">
              <Avatar name={u.display_name || '?'} avatarUrl={u.avatar_url} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold">{u.display_name || 'Ohne Namen'}</p>
                  {u.is_admin && <Badge tone="brand">Admin</Badge>}
                </div>
                <p className="text-xs muted">
                  {u.last_activity ? `Aktiv ${formatRelativeTime(u.last_activity)}` : 'Noch keine Aktivität'}
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-surface-100 py-2 dark:bg-white/[0.04]">
                <p className="font-display font-bold num">{u.food_days}</p>
                <p className="text-[10px] muted">Tage getrackt</p>
              </div>
              <div className="rounded-xl bg-surface-100 py-2 dark:bg-white/[0.04]">
                <p className="font-display font-bold num">{u.training_weeks}</p>
                <p className="text-[10px] muted">Trainingswochen</p>
              </div>
              <div className="rounded-xl bg-surface-100 py-2 dark:bg-white/[0.04]">
                <p className="font-display font-bold num">{u.workouts_done}</p>
                <p className="text-[10px] muted">Workouts</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="card space-y-2 p-4 text-sm">
        <p className="font-semibold">Weitere Nutzer einladen</p>
        <p className="muted">
          Schick den Link zur App – neue Nutzer registrieren sich selbst unter <span className="font-mono">/register</span>.
          Jeder sieht nur seine eigenen Daten; du siehst hier nur Zählwerte, keine Inhalte.
        </p>
        <button
          type="button"
          className="font-semibold text-brand-600 dark:text-brand-400"
          onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/register`)}
        >
          Registrierungslink kopieren
        </button>
      </div>
    </div>
  );
}
