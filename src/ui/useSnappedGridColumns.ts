import { useCallback, useRef, useState } from "react";

/** Largest divisor of `n` that is ≤ `max`. */
function largestDivisorUpTo(n: number, max: number): number {
  let best = 1;
  for (let d = 1; d * d <= n; d++) {
    if (n % d === 0) {
      if (d <= max) best = d;
      const other = n / d;
      if (other <= max) best = Math.max(best, other);
    }
  }
  return best;
}

/**
 * Returns a ref callback for the grid container and a `gridStyle` object whose
 * column count is snapped to the largest divisor of `pageSize` that fits within
 * the container width. This ensures the last row is never partially filled.
 *
 * Pass `columns` to override with a fixed column count instead.
 */
export function useSnappedGridColumns({
  pageSize,
  minCardWidth,
  columns,
}: {
  pageSize: number;
  minCardWidth: number;
  columns?: number;
}): { gridRef: (el: HTMLDivElement | null) => void; gridStyle: React.CSSProperties } {
  const [containerWidth, setContainerWidth] = useState(0);
  const roRef = useRef<ResizeObserver | null>(null);

  const gridRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    setContainerWidth(el.getBoundingClientRect().width);
    roRef.current = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    roRef.current.observe(el);
  }, []);

  let gridStyle: React.CSSProperties;
  if (columns) {
    gridStyle = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };
  } else if (!containerWidth) {
    gridStyle = { gridTemplateColumns: `repeat(auto-fit, minmax(${minCardWidth}px, 1fr))` };
  } else {
    const natural = Math.max(1, Math.floor(containerWidth / minCardWidth));
    const snapped = largestDivisorUpTo(pageSize, natural);
    gridStyle = { gridTemplateColumns: `repeat(${snapped}, minmax(0, 1fr))` };
  }

  return { gridRef, gridStyle };
}
