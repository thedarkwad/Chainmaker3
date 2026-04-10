import { ChevronRight, X } from "lucide-react";
import { useState, type ReactNode } from "react";

/**
 * A sidebar that is collapsible on small screens and always visible at the
 * given breakpoint and above.
 *
 * `breakpoint` — `"md"` (768 px, default) or `"lg"` (1024 px).
 * `label` — shown in the mobile header when the panel is open.
 * `children` — fill the panel below the mobile header.
 */
export function CollapsibleSidebar({
  label,
  breakpoint = "md",
  children,
}: {
  label: string;
  breakpoint?: "md" | "lg";
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isLg = breakpoint === "lg";

  return (
    <>
      {/* Mobile toggle tab — visible only when sidebar is closed */}
      <button
        type="button"
        className={
          isLg
            ? "lg:hidden fixed left-0 top-1/3 z-20 flex items-center bg-accent2-tint border border-l-0 border-accent2/80 rounded-r-md px-1 py-3 text-ghost hover:text-accent2 shadow-sm"
            : "md:hidden fixed left-0 top-1/3 z-20 flex items-center bg-accent2-tint border border-l-0 border-accent2/80 rounded-r-md px-1 py-3 text-ghost hover:text-accent2 shadow-sm"
        }
        style={{ opacity: mobileOpen ? 0 : 1, pointerEvents: mobileOpen ? "none" : "auto" }}
        onClick={() => setMobileOpen(true)}
      >
        <ChevronRight size={13} />
      </button>

      {/* Backdrop */}
      {mobileOpen && (
        <div
          className={isLg ? "lg:hidden fixed inset-0 z-30 bg-black/40" : "md:hidden fixed inset-0 z-30 bg-black/40"}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <div
        className={`
          fixed inset-y-0 left-0 z-40 w-72 flex flex-col border-r border-edge bg-linear-to-b from-tint to-accent2-tint
          transition-transform duration-200 ease-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          ${isLg
            ? "lg:relative lg:inset-auto lg:w-70 lg:z-auto lg:shrink-0 lg:translate-x-0"
            : "md:relative md:inset-auto md:w-70 md:z-auto md:shrink-0 md:translate-x-0"}
        `}
      >
        {/* Mobile header */}
        <div
          className={
            isLg
              ? "lg:hidden shrink-0 flex items-center justify-between px-3 py-2 border-b border-edge"
              : "md:hidden shrink-0 flex items-center justify-between px-3 py-2 border-b border-edge"
          }
        >
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">{label}</span>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="p-1 rounded text-muted hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 flex flex-col">
          {children}
        </div>
      </div>
    </>
  );
}
