import { motion } from 'framer-motion';
import { useId, useMemo, useState } from 'react';
import { useWidth } from './useSize';

export interface LinePoint {
  key: string;
  /** kurze Achsenbeschriftung */
  label: string;
  /** ausführliche Beschriftung im Tooltip */
  title: string;
  value: number | null;
}

/** Linien-/Flächendiagramm mit Fadenkreuz-Tooltip und animiertem Zeichnen. */
export function LineChart({
  data,
  color = '#0fcb84',
  unit = '',
  goal,
  height = 170,
  decimals = 0,
  emptyLabel = 'Noch keine Daten',
}: {
  data: LinePoint[];
  color?: string;
  unit?: string;
  goal?: number;
  height?: number;
  decimals?: number;
  emptyLabel?: string;
}) {
  const id = useId().replace(/:/g, '');
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const padL = 36;
  const padR = 10;
  const padT = 14;
  const padB = 24;
  const w = Math.max(100, width);
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;

  const values = data.map((d) => d.value).filter((v): v is number => v !== null);
  const hasData = values.length > 0;

  const { min, max } = useMemo(() => {
    const all = goal !== undefined ? [...values, goal] : values;
    if (all.length === 0) return { min: 0, max: 1 };
    let lo = Math.min(...all);
    let hi = Math.max(...all);
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.15;
    return { min: lo - pad, max: hi + pad };
  }, [values, goal]);

  const x = (i: number) => padL + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - ((v - min) / (max - min)) * innerH;

  const pts = data
    .map((d, i) => (d.value === null ? null : { i, x: x(i), y: y(d.value), v: d.value }))
    .filter((p): p is { i: number; x: number; y: number; v: number } => !!p);

  const line = smoothPath(pts);
  const area =
    pts.length > 1
      ? `${line} L ${pts[pts.length - 1].x} ${padT + innerH} L ${pts[0].x} ${padT + innerH} Z`
      : '';

  const ticks = [min + (max - min) * 0.15, (min + max) / 2, max - (max - min) * 0.15];
  const fmt = (v: number) =>
    v.toLocaleString('de-DE', { maximumFractionDigits: decimals, minimumFractionDigits: 0 });

  const nearest = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left;
    let best: number | null = null;
    let dist = Infinity;
    for (const p of pts) {
      const dd = Math.abs(p.x - px);
      if (dd < dist) {
        dist = dd;
        best = p.i;
      }
    }
    return best;
  };

  const hp = hover !== null ? pts.find((p) => p.i === hover) : undefined;
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));

  return (
    <div ref={ref} className="relative select-none">
      {!hasData && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm muted">
          {emptyLabel}
        </div>
      )}
      <svg
        width={w}
        height={height}
        className="touch-pan-y overflow-visible"
        onPointerMove={(e) => setHover(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onPointerDown={(e) => setHover(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="Liniendiagramm"
      >
        <defs>
          <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              x2={w - padR}
              y1={y(t)}
              y2={y(t)}
              className="stroke-surface-200 dark:stroke-white/[0.06]"
              strokeWidth={1}
            />
            <text
              x={padL - 6}
              y={y(t) + 3}
              textAnchor="end"
              className="fill-surface-900/45 text-[10px] dark:fill-surface-100/45"
            >
              {fmt(t)}
            </text>
          </g>
        ))}

        {goal !== undefined && (
          <line
            x1={padL}
            x2={w - padR}
            y1={y(goal)}
            y2={y(goal)}
            stroke="#8b5cf6"
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
        )}

        {area && (
          <motion.path
            d={area}
            fill={`url(#area-${id})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          />
        )}
        {pts.length > 1 && (
          <motion.path
            key={line}
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
            style={{ filter: `drop-shadow(0 4px 10px ${color}66)` }}
          />
        )}
        {pts.length === 1 && <circle cx={pts[0].x} cy={pts[0].y} r={5} fill={color} />}

        {pts.length > 0 && !hp && (
          <circle
            cx={pts[pts.length - 1].x}
            cy={pts[pts.length - 1].y}
            r={5}
            fill={color}
            className="stroke-white dark:stroke-surface-850"
            strokeWidth={2}
          />
        )}

        {data.map((d, i) =>
          i % labelEvery === 0 || i === data.length - 1 ? (
            <text
              key={d.key}
              x={x(i)}
              y={height - 6}
              textAnchor="middle"
              className="fill-surface-900/45 text-[10px] dark:fill-surface-100/45"
            >
              {d.label}
            </text>
          ) : null,
        )}

        {hp && (
          <g>
            <line
              x1={hp.x}
              x2={hp.x}
              y1={padT}
              y2={padT + innerH}
              className="stroke-surface-900/30 dark:stroke-white/30"
              strokeWidth={1}
            />
            <circle cx={hp.x} cy={hp.y} r={6} fill={color} className="stroke-white dark:stroke-surface-850" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hp && (
        <div
          className="pointer-events-none absolute top-0 z-20 -translate-x-1/2 -translate-y-full rounded-xl bg-surface-900 px-2.5 py-1.5 text-xs text-white shadow-lg dark:bg-white dark:text-surface-900"
          style={{ left: Math.min(Math.max(hp.x, 50), w - 50) }}
        >
          <div className="opacity-70">{data[hp.i].title}</div>
          <div className="font-semibold num">
            {fmt(hp.v)} {unit}
          </div>
        </div>
      )}
    </div>
  );
}

/** Weiche Kurve (monotone Catmull-Rom-Näherung). */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = 0.18;
    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}
