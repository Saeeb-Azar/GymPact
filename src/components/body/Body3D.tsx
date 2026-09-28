// React-Hülle um die three.js-Szene (wird per lazy() nur bei Bedarf geladen).

import { useEffect, useRef, useState } from 'react';
import type { MuscleGroup } from '@/lib/database.types';
import { BodyScene3D, loadBodyData } from './BodyScene3D';

let dataPromise: ReturnType<typeof loadBodyData> | null = null;

export default function Body3D({
  heat,
  selected,
  onSelect,
  onHover,
  female,
  side,
  dark,
  onFail,
}: {
  heat: Map<MuscleGroup, number>;
  selected: MuscleGroup | null;
  onSelect: (m: MuscleGroup | null) => void;
  onHover?: (m: MuscleGroup | null) => void;
  female: boolean;
  /** Bei Änderung dreht sich die Figur zu dieser Seite */
  side: 'front' | 'back';
  dark: boolean;
  onFail: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scene = useRef<BodyScene3D | null>(null);
  const cb = useRef({ onSelect, onHover, onFail });
  cb.current = { onSelect, onHover, onFail };
  const [ready, setReady] = useState(false);
  const latest = useRef({ heat, selected, female, dark });
  latest.current = { heat, selected, female, dark };

  useEffect(() => {
    let cancelled = false;
    dataPromise ??= loadBodyData('/body/body.bin');
    dataPromise
      .then((data) => {
        if (cancelled || !ref.current) return;
        const s = new BodyScene3D(ref.current, data, {
          onSelect: (m) => cb.current.onSelect(m),
          onHover: (m) => cb.current.onHover?.(m),
        });
        scene.current = s;
        const l = latest.current;
        s.setDark(l.dark);
        s.setHeat(l.heat);
        s.setGender(l.female);
        s.setSelected(l.selected);
        setReady(true);
      })
      .catch(() => {
        dataPromise = null;
        if (!cancelled) cb.current.onFail();
      });
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => scene.current?.setHeat(heat), [heat]);
  useEffect(() => scene.current?.setSelected(selected), [selected]);
  useEffect(() => scene.current?.setGender(female), [female]);
  useEffect(() => scene.current?.setDark(dark), [dark]);
  useEffect(() => {
    if (!selected) scene.current?.face(side);
  }, [side]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="absolute inset-0" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500/30 border-t-brand-500" />
        </div>
      )}
    </div>
  );
}
