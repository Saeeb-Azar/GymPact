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
      <div className="mb-8 flex flex-col items-center text-center">
        <span className="mb-3 flex h-16 w-16 animate-float items-center justify-center rounded-3xl bg-gradient-to-br from-brand-300 to-brand-600 text-3xl shadow-glow">
          🏋️
        </span>
        <span className="font-display text-4xl font-bold tracking-tight">
          Gym<span className="text-gradient">Pact</span>
        </span>
        <p className="mt-1 text-sm muted">Ernährung · Training · Fortschritt</p>
      </div>
      <div className="card animate-fade-up p-6">
        <h1 className="font-display text-2xl font-bold">{title}</h1>
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
