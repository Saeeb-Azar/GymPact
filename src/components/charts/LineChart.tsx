// Schlichtes, responsives SVG-Liniendiagramm (z. B. Gewichtsverlauf).

interface Point {
  label: string;
  value: number;
}

interface LineChartProps {
  points: Point[];
  unit?: string;
  height?: number;
}

export function LineChart({ points, unit = '', height = 160 }: LineChartProps) {
  if (points.length === 0) return null;

  const width = 320;
  const padding = { top: 14, right: 10, bottom: 22, left: 38 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  // etwas Luft ober- und unterhalb
  const yMin = min - range * 0.15;
  const yMax = max + range * 0.15;

  const x = (i: number) =>
    padding.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => padding.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(' ');

  const first = points[0];
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Verlauf von ${first.value}${unit} bis ${last.value}${unit}`}
    >
      {/* Referenzlinien */}
      {[0, 0.5, 1].map((t) => {
        const value = yMin + (yMax - yMin) * t;
        const yy = y(value);
        return (
          <g key={t}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yy}
              y2={yy}
              className="stroke-surface-200 dark:stroke-surface-800"
              strokeDasharray="3 4"
              strokeWidth={1}
            />
            <text
              x={padding.left - 6}
              y={yy + 3.5}
              textAnchor="end"
              className="fill-surface-900/40 text-[10px] tabular-nums dark:fill-surface-100/40"
            >
              {value.toFixed(1)}
            </text>
          </g>
        );
      })}

      <path
        d={path}
        fill="none"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-brand-500"
      />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(p.value)}
          r={points.length > 40 ? 0 : 3}
          className="fill-brand-600"
        />
      ))}

      {/* Erster und letzter Zeitpunkt */}
      <text
        x={padding.left}
        y={height - 6}
        className="fill-surface-900/40 text-[10px] dark:fill-surface-100/40"
      >
        {first.label}
      </text>
      <text
        x={width - padding.right}
        y={height - 6}
        textAnchor="end"
        className="fill-surface-900/40 text-[10px] dark:fill-surface-100/40"
      >
        {last.label}
      </text>
    </svg>
  );
}
