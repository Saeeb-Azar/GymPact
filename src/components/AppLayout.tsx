import { AnimatePresence, motion } from 'framer-motion';
import { Link, NavLink, useLocation, useOutlet } from 'react-router-dom';
import { useProfile } from '@/hooks/queries';
import { Avatar } from './ui/Avatar';
import { OnboardingGuide, useOnboarding } from './OnboardingGuide';
import { IconChart, IconDumbbell, IconFood, IconHome, IconUser } from './icons';

const navItems = [
  { to: '/', label: 'Heute', icon: IconHome },
  { to: '/nutrition', label: 'Essen', icon: IconFood },
  { to: '/training', label: 'Training', icon: IconDumbbell },
  { to: '/stats', label: 'Statistik', icon: IconChart },
  { to: '/settings', label: 'Profil', icon: IconUser },
];

/** App-Shell: Kopfzeile, animierter Seitenwechsel, schwebende Navigation. */
export function AppLayout() {
  const onboarding = useOnboarding();
  const location = useLocation();
  const outlet = useOutlet();
  const { data: profile } = useProfile();

  if (onboarding.open) {
    return <OnboardingGuide onClose={onboarding.close} />;
  }

  // Unterseiten (z. B. /training/workout/…) gehören zum Tab des ersten Segments
  const section = '/' + (location.pathname.split('/')[1] ?? '');

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header
        className="sticky top-0 z-30 flex items-center justify-between bg-surface-50/75 px-4 pb-2 backdrop-blur-xl dark:bg-surface-950/75"
        style={{ paddingTop: 'calc(var(--safe-top) + 0.75rem)' }}
      >
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600 text-white dark:bg-brand-500 dark:text-surface-950">
            <IconDumbbell size={18} strokeWidth={2.4} />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">GymPact</span>
        </Link>
        <Link to="/settings" aria-label="Profil" className="touch-target flex items-center justify-center">
          <Avatar name={profile?.display_name ?? '?'} avatarUrl={profile?.avatar_url} size={34} />
        </Link>
      </header>

      <main className="flex-1 px-4 pb-32 pt-2">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {outlet}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav
        aria-label="Hauptnavigation"
        className="fixed inset-x-0 bottom-0 z-40 px-3"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 0.6rem)' }}
      >
        <div className="glass mx-auto flex max-w-md rounded-[1.75rem] p-1.5 shadow-2xl shadow-black/20">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = to === '/' ? section === '/' : section === to;
            return (
              <NavLink
                key={to}
                to={to}
                className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[10px] font-semibold transition-colors ${
                  active ? 'text-white dark:text-surface-950' : 'muted hover:text-surface-900 dark:hover:text-surface-100'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-2xl bg-brand-600 dark:bg-brand-500"
                    transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                  />
                )}
                <Icon size={22} className="relative z-10" strokeWidth={active ? 2.2 : 1.8} />
                <span className="relative z-10">{label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
