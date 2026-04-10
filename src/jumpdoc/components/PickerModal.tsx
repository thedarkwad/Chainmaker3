/**
 * PickerModal — shared portal-based picker modal shell for JumpDoc editor pickers.
 * Used by scenario reward pickers and alternative cost prerequisite pickers.
 */

import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function PickerModal({
  title,
  filter,
  onFilterChange,
  onClose,
  children,
  footer,
}: {
  title: string;
  filter: string;
  onFilterChange: (v: string) => void;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  // Portal into the overlay div (a sibling of the scroll container) so that
  // mounting the modal never causes the panel to scroll.
  const overlay = document.getElementById("jumpdoc-editor-overlay");
  const mouseDownOnBackdrop = useRef(false);

  if (!overlay) return null;

  return createPortal(
    <div
      className="absolute inset-0 flex items-center justify-center bg-canvas/60 backdrop-blur-sm pointer-events-auto"
      onMouseDown={(e) => {
        mouseDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && mouseDownOnBackdrop.current) onClose();
        mouseDownOnBackdrop.current = false;
      }}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col bg-canvas border border-edge rounded-lg shadow-xl w-120 max-h-[80%] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-edge shrink-0">
          <span className="text-sm font-semibold text-ink">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="text-ghost hover:text-ink transition-colors p-1"
          >
            <X size={14} />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-line shrink-0">
          <input
            type="text"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            className="w-full bg-surface border border-edge rounded px-2 py-1 text-sm text-ink focus:outline-none focus:border-accent-ring transition-colors"
            autoFocus
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-2 py-2">{children}</div>

        {/* Optional footer */}
        {footer && <div className="border-t border-edge shrink-0">{footer}</div>}
      </div>
    </div>,
    overlay,
  );
}

export function PickerGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <p className="text-[10px] font-semibold text-ghost uppercase tracking-wider px-1 mb-1">
        {label}
      </p>
      {children}
    </div>
  );
}

export function PickerItem({
  name,
  subtitle,
  onClick,
}: {
  name: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-2 py-1.5 rounded hover:bg-tint transition-colors flex items-baseline gap-2"
    >
      <span className="text-sm text-ink flex-1 truncate">{name || "(unnamed)"}</span>
      {subtitle && <span className="text-xs text-ghost shrink-0">{subtitle}</span>}
    </button>
  );
}
