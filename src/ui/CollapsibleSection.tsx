import { ChevronDown, ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

type CollapsibleSectionProps = {
  title: string;
  /**
   * When true the body is wrapped in a bordered `bg-surface` panel.
   * When false the children are rendered directly with no extra chrome.
   */
  styled?: boolean;
  altColor?: boolean;
  /**
   * When true, renders a quieter header (no accent fill, smaller text) suitable
   * for sub-sections nested beneath a primary CollapsibleSection.
   */
  secondary?: boolean;
  /** Element rendered at the right edge of the header (e.g. an Add button).
   *  Click events on this element do not toggle the section open/closed. */
  action?: ReactNode;
  defaultOpen?: boolean;
  /** When provided, forces the section open or closed (overrides internal toggle state). */
  open?: boolean;
  /**
   * When this number changes, force the section open — even if `open` hasn't changed.
   * Used to re-open a section the user manually collapsed when an overlay item is clicked.
   */
  forceOpenNonce?: number;
  children: ReactNode;
  className?: string;
};

/**
 * A collapsible section with a colored accent-tint header and an optional
 * styled (bordered + bg-surface) body panel.
 *
 * The `action` slot is rendered at the right edge of the header and its clicks
 * are stopped from bubbling to the collapse toggle.
 */
export function CollapsibleSection({
  title,
  styled = false,
  action,
  defaultOpen = true,
  open,
  forceOpenNonce,
  children,
  altColor,
  secondary,
  className,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Force-open when nonce changes; otherwise follow the controlled `open` prop.
  useEffect(() => {
    if (forceOpenNonce !== undefined) setIsOpen(true);
    else if (open !== undefined) setIsOpen(open);
  }, [open, forceOpenNonce]);

  const headerClass = secondary
    ? "relative flex items-center gap-1.5 w-full px-2.5 py-1 rounded text-xs font-medium text-muted hover:text-ink bg-tint hover:bg-surface select-none transition-colors cursor-pointer border border-edge"
    : `relative flex items-center gap-2 w-full px-3 py-1 rounded-md ${altColor ? "bg-accent2-tint text-accent2 hover:bg-accent2 border-accent2" : "bg-accent/25 text-accent/80 hover:bg-accent"} text-sm font-semibold select-none transition-colors hover:text-surface cursor-pointer border border-edge`;

  return (
    <div className={className}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className={headerClass}
      >
        {isOpen
          ? <ChevronDown  size={13} className="shrink-0" />
          : <ChevronRight size={13} className="shrink-0" />}
        <span className="flex-1 text-center">{title}</span>
        {action && (
          /* Swallow clicks so they don't toggle the section; open if closed */
          <span
            role="none"
            onClick={(e) => { e.stopPropagation(); if (!isOpen) setIsOpen(true); }}
            className="absolute right-2 top-1/2 -translate-y-1/2"
          >
            {action}
          </span>
        )}
      </button>

      {/* Body */}
      {isOpen && (
        styled ? (
          <div className="mt-1 border border-edge rounded-lg bg-surface flex flex-col p-2">
            {children}
          </div>
        ) : (
          <div className="mt-1 flex flex-col gap-1">
            {children}
          </div>
        )
      )}
    </div>
  );
}
