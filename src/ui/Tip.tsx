import { Info } from "lucide-react";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

const TIP_W = 256;
const TIP_GAP = 6;

/** Hover tooltip with an info icon trigger. Portals to body to avoid overflow clipping. */
export function Tip({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);

  const show = () => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const above = r.top > window.innerHeight - r.bottom && r.top > 80;
    let left = r.left + r.width / 2 - TIP_W / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - TIP_W - 8));
    setStyle(
      above
        ? { position: "fixed", bottom: window.innerHeight - r.top + TIP_GAP, left, width: TIP_W, zIndex: 9999 }
        : { position: "fixed", top: r.bottom + TIP_GAP, left, width: TIP_W, zIndex: 9999 },
    );
  };

  return (
    <div
      ref={ref}
      className="inline-flex items-center shrink-0 -mt-0.5"
      onMouseEnter={show}
      onMouseLeave={() => setStyle(null)}
    >
      <Info size={12} className="cursor-help text-muted hover:text-ink transition-colors" />
      {style &&
        createPortal(
          <div
            style={style}
            className="bg-surface border border-edge rounded-lg shadow-lg p-2.5 text-xs text-muted leading-relaxed select-none pointer-events-none"
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}
