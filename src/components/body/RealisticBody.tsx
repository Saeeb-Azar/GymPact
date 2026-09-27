// Realistischer Körper (anatomische Illustration, Vorder- & Rückseite) mit
// anklickbaren Muskelmasken. 3D-Effekt: Die Figur ist eine Karte, die sich
// per Wischen oder Auswahl um die Y-Achse dreht; bei Auswahl zoomt die
// Kamera auf den Muskel und er pulsiert rot.
//
// Illustrationen & Masken: js-rich-body-highlighter (MIT).

import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  PX2MM,
  VIEWBOX_HEIGHT,
  VIEWBOX_WIDTH,
  defaultBody,
  getMuscles,
  type BodyView,
  type Gender,
} from 'js-rich-body-highlighter';
import type { MuscleGroup } from '@/lib/database.types';

/** Gruppen der Illustration → Muskelgruppen der App. */
const GROUP_MAP: Record<string, MuscleGroup> = {
  chest: 'chest',
  abs: 'abs',
  obliques: 'abs',
  shoulders: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'forearms',
  upper_back: 'traps',
  lats: 'back',
  lower_back: 'back',
  glutes: 'glutes',
  quads: 'quads',
  hamstrings: 'hamstrings',
  calves: 'calves',
};

export function groupsInView(gender: Gender, view: BodyView): Set<MuscleGroup> {
  return new Set(getMuscles(gender, view).map((m) => GROUP_MAP[m.group]).filter(Boolean));
}

const SELECT = '#f43f5e';
const HEAT = '#0fcb84';

export function RealisticBody({
  gender,
  view,
  onViewChange,
  heat,
  selected,
  onSelect,
  onHover,
  dark,
}: {
  gender: Gender;
  view: BodyView;
  onViewChange: (v: BodyView) => void;
  heat: Map<MuscleGroup, number>;
  selected: MuscleGroup | null;
  onSelect: (m: MuscleGroup | null) => void;
  onHover?: (m: MuscleGroup | null) => void;
  dark: boolean;
}) {
  const rot = useMotionValue(view === 'back' ? 180 : 0);
  const panned = useRef(false);
  const dragging = useRef(false);
  const start = useRef({ x: 0, rot: 0 });
  // Leichter Schatten/Glanz, der mit der Drehung wandert
  const shine = useTransform(rot, (r) => {
    const a = ((r % 360) + 360) % 360;
    const side = Math.sin((a * Math.PI) / 180);
    return `linear-gradient(${90 + side * 40}deg, transparent 30%, rgba(255,255,255,${0.06 + Math.abs(side) * 0.12}) 50%, transparent 70%)`;
  });

  useEffect(() => {
    const target = view === 'back' ? 180 : 0;
    const cur = rot.get();
    // kürzester Weg zur Zielseite
    const turns = Math.round((cur - target) / 360);
    const c = animate(rot, target + turns * 360, { type: 'spring', stiffness: 90, damping: 16 });
    return () => c.stop();
  }, [view, rot]);

  return (
    <div
      className="relative h-full w-full touch-pan-y select-none"
      style={{ perspective: 1400 }}
      onPointerDown={(e) => {
        panned.current = false;
        dragging.current = true;
        start.current = { x: e.clientX, rot: rot.get() };
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const dx = e.clientX - start.current.x;
        if (Math.abs(dx) > 8) panned.current = true;
        if (panned.current) rot.set(start.current.rot + dx * 0.6);
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        if (!panned.current) return;
        const dx = e.clientX - start.current.x;
        const next: BodyView =
          Math.abs(dx) > 50 ? (view === 'front' ? 'back' : 'front') : view;
        if (next !== view) onViewChange(next);
        else {
          const target = view === 'back' ? 180 : 0;
          const turns = Math.round((rot.get() - target) / 360);
          animate(rot, target + turns * 360, { type: 'spring', stiffness: 120, damping: 18 });
        }
      }}
      onPointerCancel={() => {
        dragging.current = false;
        panned.current = false;
      }}
      onPointerLeave={(e) => {
        if (dragging.current && panned.current) {
          dragging.current = false;
          const dx = e.clientX - start.current.x;
          if (Math.abs(dx) > 50) onViewChange(view === 'front' ? 'back' : 'front');
          else {
            const target = view === 'back' ? 180 : 0;
            const turns = Math.round((rot.get() - target) / 360);
            animate(rot, target + turns * 360, { type: 'spring', stiffness: 120, damping: 18 });
          }
        }
      }}
    >
      <motion.div
        className="relative h-full w-full"
        style={{ rotateY: rot, transformStyle: 'preserve-3d' }}
      >
        <Face
          gender={gender}
          view="front"
          dark={dark}
          heat={heat}
          selected={view === 'front' ? selected : null}
          onSelect={(m) => !panned.current && onSelect(m)}
          onHover={onHover}
        />
        <Face
          gender={gender}
          view="back"
          dark={dark}
          heat={heat}
          selected={view === 'back' ? selected : null}
          onSelect={(m) => !panned.current && onSelect(m)}
          onHover={onHover}
          flipped
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: shine, transform: 'translateZ(1px)' }}
        />
      </motion.div>
    </div>
  );
}

function Face({
  gender,
  view,
  dark,
  heat,
  selected,
  onSelect,
  onHover,
  flipped,
}: {
  gender: Gender;
  view: BodyView;
  dark: boolean;
  heat: Map<MuscleGroup, number>;
  selected: MuscleGroup | null;
  onSelect: (m: MuscleGroup | null) => void;
  onHover?: (m: MuscleGroup | null) => void;
  flipped?: boolean;
}) {
  const muscles = useMemo(() => getMuscles(gender, view), [gender, view]);
  const src = defaultBody(gender, view, dark ? 'dark' : 'light');
  const refs = useRef(new Map<string, SVGPathElement>());
  const [zoom, setZoom] = useState({ s: 1, x: '0%', y: '0%' });
  const [hover, setHover] = useState<MuscleGroup | null>(null);

  // Kamera-Zoom auf den ausgewählten Muskel (Bounding-Box aller Masken der Gruppe)
  useLayoutEffect(() => {
    if (!selected) {
      setZoom({ s: 1, x: '0%', y: '0%' });
      return;
    }
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const m of muscles) {
      if (GROUP_MAP[m.group] !== selected) continue;
      const el = refs.current.get(m.id);
      if (!el) continue;
      const b = el.getBBox();
      const ox = (m.offset?.x ?? 0) * PX2MM;
      const oy = (m.offset?.y ?? 0) * PX2MM;
      x1 = Math.min(x1, b.x + ox);
      y1 = Math.min(y1, b.y + oy);
      x2 = Math.max(x2, b.x + b.width + ox);
      y2 = Math.max(y2, b.y + b.height + oy);
    }
    if (!Number.isFinite(x1)) return;
    const w = x2 - x1;
    const h = y2 - y1;
    const s = Math.max(1.25, Math.min(2.1, (VIEWBOX_WIDTH * 0.7) / w, (VIEWBOX_HEIGHT * 0.5) / h));
    const cx = (x1 + x2) / 2 / VIEWBOX_WIDTH;
    const cy = (y1 + y2) / 2 / VIEWBOX_HEIGHT;
    // Mittelpunkt ins Bild holen, ohne über den Rand hinauszuschieben
    const maxShift = ((s - 1) / 2) * 100;
    const clamp = (v: number) => Math.max(-maxShift, Math.min(maxShift, v));
    setZoom({ s, x: `${clamp(-s * (cx - 0.5) * 100)}%`, y: `${clamp(-s * (cy - 0.5) * 100)}%` });
  }, [selected, muscles]);

  const blend = dark ? 'overlay' : 'multiply';

  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-[inherit]"
      style={{
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        transform: flipped ? 'rotateY(180deg)' : undefined,
      }}
    >
      <motion.div
        className="h-full w-full"
        animate={{ scale: zoom.s, x: zoom.x, y: zoom.y }}
        transition={{ type: 'spring', stiffness: 110, damping: 20 }}
      >
        <svg
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          className="h-full w-full"
          style={{ isolation: 'isolate' }}
          role="img"
          aria-label={view === 'front' ? 'Körper Vorderseite' : 'Körper Rückseite'}
        >
          <image href={src} width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} />
          {muscles.map((m) => {
            const g = GROUP_MAP[m.group];
            const isSel = g === selected;
            const h = heat.get(g) ?? 0;
            const isHover = g === hover;
            const fill = isSel ? SELECT : h > 0 || isHover ? HEAT : '#000';
            const opacity = isSel ? 1 : selected ? h * 0.35 : isHover ? Math.max(0.55, h) : h > 0 ? 0.3 + h * 0.65 : 0;
            return (
              <motion.path
                key={m.id}
                ref={(el: SVGPathElement | null) => {
                  if (el) refs.current.set(m.id, el);
                  else refs.current.delete(m.id);
                }}
                d={m.d}
                transform={m.offset ? `translate(${m.offset.x * PX2MM} ${m.offset.y * PX2MM})` : undefined}
                fill={fill}
                style={{ mixBlendMode: blend as CSSProperties['mixBlendMode'], cursor: 'pointer' }}
                initial={false}
                animate={isSel ? { opacity: [0.75, 1, 0.75] } : { opacity }}
                transition={isSel ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.35 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(isSel ? null : g);
                }}
                onPointerEnter={(e) => {
                  if (e.pointerType !== 'mouse') return;
                  setHover(g);
                  onHover?.(g);
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType !== 'mouse') return;
                  setHover(null);
                  onHover?.(null);
                }}
              >
                <title>{m.name}</title>
              </motion.path>
            );
          })}
        </svg>
      </motion.div>
    </div>
  );
}
