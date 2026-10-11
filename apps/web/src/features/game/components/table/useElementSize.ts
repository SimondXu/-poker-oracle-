'use client';

import { useLayoutEffect, useRef, useState } from 'react';

export interface ElementSize {
  w: number;
  h: number;
}

/** Content-box size of an element, kept current with a ResizeObserver (null until measured). */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<ElementSize | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = (w: number, h: number) =>
      setSize((current) => (current && current.w === w && current.h === h ? current : { w, h }));
    const rect = element.getBoundingClientRect();
    update(Math.round(rect.width), Math.round(rect.height));
    const observer = new ResizeObserver(([entry]) => {
      if (entry) update(Math.round(entry.contentRect.width), Math.round(entry.contentRect.height));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}
