import { motion } from 'framer-motion';
import { useId, type ReactNode } from 'react';

/** Animierter Fortschrittsring mit Verlauf und Glow; über 100 % läuft eine zweite Runde in Rot. */
export function Ring({
  value,
  max,
  size = 180,
  stroke = 16,
  from = '#6cf2bb',
  to = '#0fcb84',
  children,
  label,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  from?: string;
  to?: string;
  children?: ReactNode;
  label?: string;
}) {
  const id = useId().replace(/:/g, '');
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = max > 0 ? value / max : 0;
  const main = Math.min(1, ratio);
  const over = Math.min(1, Math.max(0, ratio - 1));

  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={`g-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
          <filter id={`glow-${id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-200 dark:stroke-white/[0.07]"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#g-${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          filter={`url(#glow-${id})`}
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - main) }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        />
        {over > 0 && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#f43f5e"
            strokeWidth={stroke * 0.55}
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - over) }}
            transition={{ duration: 1, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}
