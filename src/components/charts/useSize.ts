import { useEffect, useRef, useState } from 'react';

/** Breite eines Elements (ResizeObserver) für responsive SVG/3D-Diagramme. */
export function useWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(node.clientWidth || fallback);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width || fallback));
    ro.observe(node);
    return () => ro.disconnect();
  }, [fallback]);
  return { ref, width };
}
