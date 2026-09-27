import { useEffect, useRef, useState } from 'react';
import type { MuscleGroup } from '@/lib/database.types';
import { BodyScene } from './BodyScene';

/** React-Hülle um die three.js-Szene. */
export default function BodyModel({
  heat,
  selected,
  onSelect,
  onHover,
}: {
  heat: Map<MuscleGroup, number>;
  selected: MuscleGroup | null;
  onSelect: (m: MuscleGroup | null) => void;
  onHover?: (m: MuscleGroup | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scene = useRef<BodyScene | null>(null);
  const cb = useRef({ onSelect, onHover });
  cb.current = { onSelect, onHover };
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    try {
      scene.current = new BodyScene(ref.current, {
        onSelect: (m) => cb.current.onSelect(m),
        onHover: (m) => cb.current.onHover?.(m),
      });
    } catch {
      setFailed(true); // kein WebGL verfügbar
      return;
    }
    const html = document.documentElement;
    const syncTheme = () => scene.current?.setDark(html.classList.contains('dark'));
    syncTheme();
    const mo = new MutationObserver(syncTheme);
    mo.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => {
      mo.disconnect();
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => scene.current?.setHeat(heat), [heat]);
  useEffect(() => scene.current?.setSelected(selected), [selected]);

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-sm muted">
        3D wird auf diesem Gerät nicht unterstützt.
      </div>
    );
  }
  return <div ref={ref} className="h-full w-full" />;
}
