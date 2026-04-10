import { Check } from "lucide-react";
import type { ReactNode } from "react";

type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: ReactNode;
  className?: string;
};

/**
 * Custom checkbox with theme-aware styling. Uses a visually-hidden native
 * <input> under the hood so keyboard navigation and screen readers work
 * without extra ARIA ceremony.
 */
export function Checkbox({ checked, onChange, children, className }: CheckboxProps) {
  return (
    <label
      className={`group inline-flex items-center gap-2 cursor-pointer select-none ${className ?? ""}`}
    >
      {/* Hidden native input — handles Space, Enter, and screen-reader state */}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />

      {/* Custom visual box */}
      <span
        className={`flex items-center justify-center w-4 h-4 shrink-0 rounded-sm border transition-colors ${
          checked
            ? "bg-accent border-accent"
            : "bg-surface border-edge group-hover:border-accent-ring"
        }`}
      >
        {checked && <Check size={11} strokeWidth={2.5} className="text-surface" />}
      </span>

      {children && <span className="text-sm text-ink">{children}</span>}
    </label>
  );
}
