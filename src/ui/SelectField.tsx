import { ChevronDown } from "lucide-react";
import { SelectHTMLAttributes } from "react";

/** A styled select that matches the height and look of other inline controls. */
export function SelectField({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative shrink-0">
      <select
        className={`appearance-none border border-edge rounded px-2 py-0.5 pr-6 text-sm font-semibold text-ink bg-surface focus:outline-none focus:border-accent-ring transition-colors ${className ?? ""}`}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={11}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted"
      />
    </div>
  );
}
