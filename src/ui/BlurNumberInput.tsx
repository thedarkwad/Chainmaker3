import { useEffect, useRef, useState } from "react";

/** Number input — controlled locally, commits on blur, clamps to min (default 0). */
export function BlurNumberInput({
  value,
  onCommit,
  className = "",
  min = 0,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "onBlur" | "value" | "type"> & {
  value: number;
  onCommit: (v: number) => void;
  min?: number;
}) {
  const [local, setLocal] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setLocal(String(value));
  }, [value]);

  return (
    <input
      step={50}
      {...props}
      type="number"
      min={min}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        const n = +local;
        const clamped = isNaN(n) ? min : Math.max(min, n);
        setLocal(String(clamped));
        onCommit(clamped);
      }}
      className={`bg-canvas border border-edge rounded px-2 py-1 text-sm text-ink focus:outline-none focus:border-accent-ring tabular-nums text-right transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden ${className}`}
    />
  );
}
