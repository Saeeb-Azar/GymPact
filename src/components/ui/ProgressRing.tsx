// Fortschrittsring (SVG) – zentrales visuelles Element des Dashboards.

interface ProgressRingProps {
  /** 0..1 */
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
}

export function ProgressRing({
  value,
  size = 132,
  strokeWidth = 10,
  label,
  sublabel,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      role="img"
      aria-label={`Fortschritt ${Math.round(clamped * 100)} Prozent`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-surface-200 dark:stroke-surface-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="stroke-brand-500 transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums">
          {label ?? `${Math.round(clamped * 100)}%`}
        </span>
        {sublabel && (
          <span className="text-xs text-surface-900/50 dark:text-surface-100/50">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}

/** Kleiner Ring für Mitglieder-Listen. */
export function MiniRing({ value, size = 40 }: { value: number; size?: number }) {
  return <ProgressRing value={value} size={size} strokeWidth={4} label="" sublabel="" />;
}
