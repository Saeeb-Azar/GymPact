import { motion } from 'framer-motion';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
  /** Anzeige hinter dem Prozentwert, z. B. "142 g" */
  detail?: string;
}

/** Gekippter Donut mit Materialstärke (gestapelte Ebenen) + Legende. */
export function Donut3D({
  slices,
  size = 136,
  centerTop,
  centerBottom,
}: {
  slices: DonutSlice[];
  size?: number;
  centerTop?: string;
  centerBottom?: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  const stroke = 22;
  const layers = 9;
  const gap = 2; // Surface-Lücke zwischen Segmenten

  let acc = 0;
  const arcs = slices.map((s) => {
    const frac = total > 0 ? s.value / total : 0;
    const arc = { ...s, frac, offset: acc };
    acc += frac;
    return arc;
  });

  const ringSvg = (shadeAmt: number, key: string, animateIn: boolean) => (
    <svg key={key} width={size} height={size} className="absolute inset-0 -rotate-90">
      {total <= 0 ? (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-200 dark:stroke-white/[0.07]"
        />
      ) : (
        arcs.map((a) => {
          const len = Math.max(0, a.frac * c - gap);
          return (
            <motion.circle
              key={a.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${c}`}
              strokeDashoffset={-a.offset * c}
              style={{ filter: shadeAmt < 0 ? `brightness(${1 + shadeAmt})` : undefined }}
              initial={animateIn ? { strokeDasharray: `0 ${c}` } : false}
              animate={{ strokeDasharray: `${len} ${c}` }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            />
          );
        })
      )}
    </svg>
  );

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size, perspective: 700 }}>
        <motion.div
          className="absolute inset-0"
          style={{ transformStyle: 'preserve-3d' }}
          initial={{ rotateX: 0, rotateZ: -90 }}
          animate={{ rotateX: 52, rotateZ: 0 }}
          transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {Array.from({ length: layers }, (_, i) => (
            <div
              key={i}
              className="absolute inset-0"
              style={{ transform: `translateZ(${-(layers - i) * 1.6}px)` }}
            >
              {ringSvg(-0.45 + (i / layers) * 0.2, `l${i}`, false)}
            </div>
          ))}
          <div className="absolute inset-0">{ringSvg(0, 'top', true)}</div>
        </motion.div>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-1 text-center">
          {centerTop && <span className="font-display text-xl font-bold num">{centerTop}</span>}
          {centerBottom && <span className="text-[10px] muted">{centerBottom}</span>}
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2.5">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-2.5">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{s.label}</span>
              {s.detail && <span className="block text-xs muted num">{s.detail}</span>}
            </span>
            <span className="text-sm font-semibold num">
              {total > 0 ? Math.round((s.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
