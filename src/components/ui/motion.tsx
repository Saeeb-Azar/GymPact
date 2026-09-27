// Animierte UI-Bausteine auf Basis von framer-motion.

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useSpring,
  useDragControls,
  useTransform,
} from 'framer-motion';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// ---------------------------------------------------------------- Zahl
/** Zählt weich zum Zielwert hoch. */
export function AnimatedNumber({
  value,
  decimals = 0,
  className = '',
}: {
  value: number;
  decimals?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const controls = animate(prev.current, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = v.toLocaleString('de-DE', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
      },
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, decimals]);
  return (
    <span ref={ref} className={`num ${className}`}>
      {(0).toFixed(decimals)}
    </span>
  );
}

// ---------------------------------------------------------------- Segment
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className = '',
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  size?: 'sm' | 'md';
}) {
  const id = useId();
  return (
    <div
      role="tablist"
      className={`relative flex rounded-2xl bg-surface-100 p-1 dark:bg-white/[0.05] ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`relative flex-1 rounded-xl font-semibold transition-colors ${
              size === 'sm' ? 'px-2 py-1.5 text-xs' : 'px-3 py-2.5 text-sm'
            } ${active ? 'text-surface-950' : 'muted hover:text-surface-900 dark:hover:text-surface-100'}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-xl bg-gradient-to-br from-brand-300 to-brand-500 shadow-glow"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative z-10">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Sheet
/** Bottom-Sheet (mobil) bzw. zentrierter Dialog; per Wischen nach unten schließbar. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const dragControls = useDragControls();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className="relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[2rem] border border-white/10 bg-white shadow-2xl dark:bg-surface-900 sm:rounded-[2rem]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            dragListener={false}
            dragControls={dragControls}
            dragSnapToOrigin
            onDragEnd={(_e, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
            style={{ paddingBottom: 'var(--safe-bottom)' }}
          >
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="cursor-grab touch-none active:cursor-grabbing"
            >
              <DragHandle />
            </div>
            {title && (
              <div
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return;
                  dragControls.start(e);
                }}
                className="flex touch-none items-center justify-between px-5 pb-2 pt-1"
              >
                <h2 className="font-display text-xl font-bold">{title}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="touch-target -mr-2 flex items-center justify-center rounded-full muted hover:bg-surface-100 dark:hover:bg-white/5"
                  aria-label="Schließen"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
            {footer && (
              <div className="border-t border-surface-200 px-5 py-3 dark:border-white/[0.06]">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function DragHandle() {
  return (
    <div className="flex justify-center pb-1 pt-3">
      <span className="h-1.5 w-10 rounded-full bg-surface-300 dark:bg-white/15" />
    </div>
  );
}

// ---------------------------------------------------------------- Tilt
/** 3D-Neigung, die dem Finger/der Maus folgt. */
export function TiltCard({
  children,
  className = '',
  max = 10,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(y, [0, 1], [max, -max]), { stiffness: 200, damping: 20 });
  const rotateY = useSpring(useTransform(x, [0, 1], [-max, max]), { stiffness: 200, damping: 20 });
  const glareX = useTransform(x, [0, 1], ['0%', '100%']);
  const glareY = useTransform(y, [0, 1], ['0%', '100%']);
  const glare = useTransform(
    [glareX, glareY],
    ([gx, gy]) =>
      `radial-gradient(circle at ${gx} ${gy}, rgba(255,255,255,0.18), transparent 55%)`,
  );

  return (
    <div style={{ perspective: 900 }}>
      <motion.div
        className={`relative ${className}`}
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          x.set((e.clientX - r.left) / r.width);
          y.set((e.clientY - r.top) / r.height);
        }}
        onPointerLeave={() => {
          x.set(0.5);
          y.set(0.5);
        }}
      >
        {children}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ background: glare }}
        />
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------- Liste
export const listItem = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, x: -40, transition: { duration: 0.18 } },
};

export function Stagger({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
    >
      {children}
    </motion.div>
  );
}

export const staggerChild = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 28 } },
} as const;

/** Konfetti-Burst für Erfolgsmomente (Workout erledigt, Ziel erreicht). */
export function useConfetti() {
  const [bursts, setBursts] = useState<number[]>([]);
  const fire = () => {
    const id = Date.now();
    setBursts((b) => [...b, id]);
    window.setTimeout(() => setBursts((b) => b.filter((x) => x !== id)), 1600);
  };
  const node = createPortal(
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {bursts.map((id) => (
        <ConfettiBurst key={id} />
      ))}
    </div>,
    document.body,
  );
  return { fire, node };
}

const CONFETTI_COLORS = ['#2ee39d', '#8b5cf6', '#f59e0b', '#ec4899', '#38bdf8', '#ffffff'];

function ConfettiBurst() {
  const pieces = useRef(
    Array.from({ length: 36 }, (_, i) => ({
      angle: (i / 36) * Math.PI * 2 + Math.random() * 0.3,
      dist: 120 + Math.random() * 160,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rot: Math.random() * 720 - 360,
      size: 6 + Math.random() * 6,
    })),
  ).current;
  return (
    <div className="absolute left-1/2 top-1/2">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-sm"
          style={{ width: p.size, height: p.size * 0.5, background: p.color }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{
            x: Math.cos(p.angle) * p.dist,
            y: Math.sin(p.angle) * p.dist + 180,
            opacity: 0,
            rotate: p.rot,
          }}
          transition={{ duration: 1.4, ease: [0.2, 0.7, 0.4, 1] }}
        />
      ))}
    </div>
  );
}
