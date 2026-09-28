// Kleine, wiederverwendbare UI-Primitiven mit großen Touch-Flächen.

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

// ---------------------------------------------------------------- Button
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-card hover:bg-brand-700 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none dark:bg-brand-500 dark:text-surface-950 dark:hover:bg-brand-400',
  secondary:
    'bg-surface-100 text-surface-900 hover:bg-surface-200 dark:bg-white/[0.06] dark:text-surface-100 dark:hover:bg-white/10 border border-surface-200 dark:border-white/[0.06] active:scale-[0.98]',
  ghost:
    'bg-transparent text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-white/[0.06]',
  danger: 'bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 active:scale-[0.98]',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', loading, className = '', children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`touch-target inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-base font-semibold transition-all duration-150 disabled:cursor-not-allowed ${buttonVariants[variant]} ${className}`}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

// ---------------------------------------------------------------- Inputs
export const inputClasses =
  'w-full rounded-2xl border border-surface-200 bg-white px-4 py-3 text-base text-surface-900 placeholder:text-surface-900/40 transition-colors focus:border-brand-500 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-surface-100 dark:placeholder:text-surface-100/30';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => (
    <input ref={ref} className={`${inputClasses} ${className}`} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className = '', ...props }, ref) => (
  <textarea ref={ref} className={`${inputClasses} ${className}`} {...props} />
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', children, ...props }, ref) => (
    <select ref={ref} className={`${inputClasses} appearance-none ${className}`} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

// ---------------------------------------------------------------- Field
interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-surface-900/80 dark:text-surface-100/80"
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-surface-900/50 dark:text-surface-100/50">{hint}</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Toggle
interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 py-2 text-left disabled:opacity-50"
    >
      <span>
        <span className="block text-base font-medium">{label}</span>
        {description && (
          <span className="block text-sm text-surface-900/50 dark:text-surface-100/50">
            {description}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-brand-500' : 'bg-surface-200 dark:bg-white/10'
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- Sonstiges
export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="Lädt"
      role="status"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`card p-4 ${className}`}>{children}</div>;
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'brand' | 'warn';
}) {
  const tones = {
    neutral:
      'bg-surface-100 text-surface-900/70 dark:bg-white/[0.06] dark:text-surface-100/70',
    brand: 'bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300',
    warn: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      {icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/12 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
          {icon}
        </div>
      )}
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {description && (
        <p className="max-w-sm text-sm text-surface-900/60 dark:text-surface-100/60">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

export function PageTitle({
  children,
  eyebrow,
  action,
}: {
  children: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-400">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-3xl font-bold tracking-tight">{children}</h1>
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] muted">{children}</h2>
      {action}
    </div>
  );
}
