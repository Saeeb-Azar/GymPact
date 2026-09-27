import { animate, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useWidth } from './useSize';

export interface Bar3DDatum {
  key: string;
  label: string;
  /** ausführliche Beschriftung für die Anzeige über dem Diagramm */
  title: string;
  value: number;
}

/**
 * Echter 3D-Balken-Chart aus CSS-3D-Quadern. Mit dem Finger/der Maus
 * drehbar; Tippen auf einen Balken zeigt dessen Wert oben an.
 */
export function Bars3D({
  data,
  goal,
  color = '#0fcb84',
  unit = '',
  format = (v: number) => Math.round(v).toLocaleString('de-DE'),
  height = 190,
  emptyLabel = 'Noch keine Daten',
}: {
  data: Bar3DDatum[];
  goal?: number;
  color?: string;
  unit?: string;
  format?: (v: number) => string;
  height?: number;
  emptyLabel?: string;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [selected, setSelected] = useState<string | null>(null);

  const rotY = useMotionValue(-70);
  const rotX = useMotionValue(22);
  const sy = useSpring(rotY, { stiffness: 120, damping: 18 });
  const sx = useSpring(rotX, { stiffness: 120, damping: 18 });
  const transform = useTransform(
    [sx, sy],
    ([x, y]) => `rotateX(${x}deg) rotateY(${y}deg)`,
  );

  useEffect(() => {
    // Einflug-Animation
    const c = animate(rotY, -24, { duration: 1.4, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [rotY]);

  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const n = Math.max(1, data.length);
  const stageW = Math.min(width * 0.78, 520);
  const slot = stageW / n;
  const barW = Math.max(8, Math.min(40, slot * 0.58));
  const depth = Math.min(barW, 28);
  const max = Math.max(1, ...data.map((d) => d.value), goal ?? 0) * 1.12;
  const scale = (v: number) => (v / max) * height;

  const current = data.find((d) => d.key === selected) ?? data[data.length - 1];
  const hasData = data.some((d) => d.value > 0);
  const labelEvery = n > 10 ? Math.ceil(n / 7) : 1;

  return (
    <div ref={ref} className="select-none">
      <div className="flex min-h-[44px] items-end justify-between px-1">
        <div>
          <p className="text-xs muted">{current?.title ?? '–'}</p>
          <p className="font-display text-2xl font-bold num">
            {current ? format(current.value) : '–'}
            <span className="ml-1 text-sm font-medium muted">{unit}</span>
          </p>
        </div>
        {goal !== undefined && goal > 0 && (
          <p className="text-xs muted">
            Ziel <span className="font-semibold num">{format(goal)}</span> {unit}
          </p>
        )}
      </div>

      <div
        className="relative mt-2 cursor-grab touch-pan-y active:cursor-grabbing"
        style={{ height: height + 70, perspective: 1100 }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.x;
          const dy = e.clientY - drag.current.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) drag.current.moved = true;
          rotY.set(Math.max(-65, Math.min(35, rotY.get() + dx * 0.35)));
          rotX.set(Math.max(4, Math.min(48, rotX.get() - dy * 0.25)));
          drag.current.x = e.clientX;
          drag.current.y = e.clientY;
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerLeave={() => {
          drag.current = null;
        }}
        aria-label="3D-Balkendiagramm, zum Drehen ziehen"
        role="img"
      >
        {!hasData && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm muted">
            {emptyLabel}
          </div>
        )}
        <motion.div
          className="absolute left-1/2 top-0"
          style={{
            width: stageW,
            height: height,
            marginLeft: -stageW / 2,
            marginTop: 30,
            transformStyle: 'preserve-3d',
            transform,
          }}
        >
          {/* Boden */}
          <div
            className="absolute rounded-xl border border-surface-300/60 dark:border-white/10"
            style={{
              left: -16,
              width: stageW + 32,
              bottom: -depth / 2 - 16,
              height: depth + 32,
              transform: 'rotateX(90deg)',
              transformOrigin: 'bottom',
              background:
                'repeating-linear-gradient(90deg, rgba(127,127,140,0.10) 0 1px, transparent 1px 24px), rgba(127,127,140,0.06)',
            }}
          />

          {/* Ziel-Ebene */}
          {goal !== undefined && goal > 0 && (
            <div
              className="pointer-events-none absolute"
              style={{
                left: -10,
                width: stageW + 20,
                bottom: scale(goal) - (depth + 20) / 2,
                height: depth + 20,
                transform: 'rotateX(90deg)',
                background: 'rgba(139, 92, 246, 0.14)',
                border: '1.5px dashed rgba(139, 92, 246, 0.7)',
                borderRadius: 6,
              }}
            />
          )}

          {data.map((d, i) => {
            const h = Math.max(d.value > 0 ? 3 : 0, scale(d.value));
            const isSel = current?.key === d.key;
            const c = isSel ? color : `${color}`;
            return (
              <div
                key={d.key}
                className="absolute bottom-0"
                style={{
                  left: i * slot + (slot - barW) / 2,
                  width: barW,
                  height: height,
                  transformStyle: 'preserve-3d',
                }}
                onClick={() => {
                  if (!drag.current?.moved) setSelected(d.key);
                }}
                onPointerEnter={(e) => {
                  if (e.pointerType === 'mouse') setSelected(d.key);
                }}
              >
                <motion.div
                  className="absolute bottom-0 left-0"
                  style={{ width: barW, transformStyle: 'preserve-3d', opacity: isSel ? 1 : 0.78 }}
                  initial={{ height: 0 }}
                  animate={{ height: h }}
                  transition={{ duration: 0.9, delay: 0.2 + i * 0.035, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Face style={{ inset: 0, transform: `translateZ(${depth / 2}px)`, background: c }} glow={isSel} />
                  <Face style={{ inset: 0, transform: `translateZ(${-depth / 2}px) rotateY(180deg)`, background: shade(c, -0.3) }} />
                  <Face
                    style={{
                      top: 0,
                      bottom: 0,
                      width: depth,
                      left: barW - depth / 2,
                      transform: 'rotateY(90deg)',
                      background: shade(c, -0.28),
                    }}
                  />
                  <Face
                    style={{
                      top: 0,
                      bottom: 0,
                      width: depth,
                      left: -depth / 2,
                      transform: 'rotateY(-90deg)',
                      background: shade(c, -0.28),
                    }}
                  />
                  <Face
                    style={{
                      left: 0,
                      width: barW,
                      height: depth,
                      top: -depth / 2,
                      transform: 'rotateX(90deg)',
                      background: shade(c, 0.25),
                    }}
                  />
                </motion.div>
                {i % labelEvery === 0 && (
                  <span
                    className={`absolute left-1/2 whitespace-nowrap text-[10px] font-medium ${isSel ? 'text-surface-900 dark:text-white' : 'muted'}`}
                    style={{
                      bottom: -20,
                      transform: `translateX(-50%) translateZ(${depth / 2 + 2}px)`,
                    }}
                  >
                    {d.label}
                  </span>
                )}
              </div>
            );
          })}
        </motion.div>
      </div>
      <p className="-mt-1 text-center text-[11px] muted">↔ Ziehen zum Drehen · Tippen für Details</p>
    </div>
  );
}

function Face({ style, glow }: { style: CSSProperties; glow?: boolean }) {
  return (
    <div
      className="absolute"
      style={{
        backfaceVisibility: 'hidden',
        borderRadius: 3,
        boxShadow: glow ? 'inset 0 0 0 1px rgba(255,255,255,0.35)' : undefined,
        ...style,
      }}
    />
  );
}

/** Hex-Farbe aufhellen (amount > 0) oder abdunkeln (amount < 0). */
function shade(hex: string, amount: number): string {
  const h = hex.replace('#', '').slice(0, 6);
  const num = parseInt(h, 16);
  const ch = (shift: number) => {
    const v = (num >> shift) & 0xff;
    const t = amount < 0 ? 0 : 255;
    return Math.round(v + (t - v) * Math.abs(amount));
  };
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}
