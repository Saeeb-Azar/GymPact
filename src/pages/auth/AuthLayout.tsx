import type { ReactNode } from 'react';

/** Gemeinsame Hülle für alle Auth-Seiten. */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10"
      style={{ paddingTop: 'calc(var(--safe-top) + 2rem)' }}
    >
      <div className="mb-8 text-center">
        <span className="text-3xl font-bold tracking-tight text-brand-700 dark:text-brand-300">
          GymPact
        </span>
        <p className="mt-1 text-sm text-surface-900/50 dark:text-surface-100/50">
          Eure private Fitness-Challenge
        </p>
      </div>
      <div className="card animate-fade-up p-6">
        <h1 className="text-xl font-bold">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-surface-900/60 dark:text-surface-100/60">
            {subtitle}
          </p>
        )}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
