import { memo, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Crosshair, Trash2, X } from "lucide-react";
import { Tip } from "@/ui/Tip";
import type { PageRect } from "@/chain/data/JumpDoc";
import type { ToolType } from "./toolTypes";

function colorForType(type: string): string {
  if (type.startsWith("origin-")) return "#22c55e";
  if (type === "drawback") return "#ef4444";
  if (type === "scenario") return "#a855f7";
  return "#888";
}
import type { AddBoundsTarget } from "./sectionTypes";
import { Id, TID } from "@/chain/data/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TemplateCardProps<T extends TID> = {
  type: ToolType;
  /** Override the left-border color. Defaults to a color derived from `type`. */
  color?: string;
  id: Id<T>;
  name: string;
  /** Brief info shown in collapsed header (cost string, category name, etc.). */
  summary?: React.ReactNode;
  bounds?: PageRect[];
  addBoundsTarget: AddBoundsTarget | null;
  isScrollTarget: boolean;
  /** When true and isScrollTarget is false, collapse this card. */
  isAnyScrollTarget: boolean;
  cardRef: (el: HTMLDivElement | null) => void;
  onNameCommit: (value: string) => void;
  onDuplicate: () => void;
  onAddBound: () => void;
  onRemoveBound: (index: number) => void;
  onDelete: () => void;
  /**
   * Always-visible element rendered in the header after the name
   * (e.g. an inline CostDropdown).
   */
  headerExtra?: React.ReactNode;
  /** Type-specific form fields rendered in the expanded body. */
  children?: React.ReactNode;
  /** Called once when isScrollTarget transitions false → true (after expand + scroll). */
  onBecomeScrollTarget?: () => void;
  /** Show the templated-text tooltip next to the name input. */
  showTemplateTip?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatRect(r: PageRect): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return `p${r.page + 1} · ${pct(r.x)},${pct(r.y)} ${pct(r.width)}×${pct(r.height)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

function TemplateCardInner<T extends TID>({
  type,
  color: colorProp,
  id,
  name,
  summary,
  bounds = [],
  addBoundsTarget,
  isScrollTarget,
  isAnyScrollTarget,
  cardRef,
  onNameCommit,
  onDuplicate,
  onAddBound,
  onRemoveBound,
  onDelete,
  headerExtra,
  children,
  onBecomeScrollTarget,
  showTemplateTip,
}: TemplateCardProps<T>) {
  const color = colorProp ?? colorForType(type);
  const isAddTarget = addBoundsTarget?.id === id && addBoundsTarget.type === type;
  const nameRef = useRef<HTMLInputElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const wasScrollTarget = useRef(false);

  const nameDraftRef = useRef<string>(name);

  // Scroll into view + auto-expand + notify when this card becomes the scroll target.
  // Collapse when another card becomes active (isAnyScrollTarget && !isScrollTarget).
  useEffect(() => {
    if (isScrollTarget && !wasScrollTarget.current && innerRef.current) {
      setExpanded(true);
      const el = innerRef.current;
      requestAnimationFrame(() => {
        el.scrollIntoView({
          behavior: "smooth",
          block: "center",
          container: "nearest",
        } as ScrollIntoViewOptions);
      });
      setTimeout(() => onBecomeScrollTarget?.(), 80);
    } else if (!isScrollTarget && isAnyScrollTarget) {
      setExpanded(false);
    }
    wasScrollTarget.current = isScrollTarget;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScrollTarget, isAnyScrollTarget]);

  useEffect(() => {
    return () => {
      if (nameDraftRef.current !== name) onNameCommit(nameDraftRef.current);
    };
  }, [expanded]);

  return (
    <div
      ref={(el) => {
        (innerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        cardRef(el);
      }}
      className="rounded-md bg-surface border border-edge overflow-hidden border-l-3 border-l-accent2"
    >
      {/* ── Header row ── */}
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="shrink-0 text-ghost hover:text-muted transition-colors"
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        {/* Name input */}

        <input
          type="text"
          defaultValue={name}
          key={name}
          ref={nameRef}
          onChange={(e) => (nameDraftRef.current = e.target.value)}
          onFocus={() => setExpanded(true)}
          onBlur={(e) => {
            if (nameDraftRef.current !== name) onNameCommit(nameDraftRef.current.trim());
          }}
          className="flex-1 min-w-0 text-sm font-semibold bg-transparent text-ink focus:outline-none placeholder-ghost"
          placeholder="Name…"
        />

        {/* Templated text tip */}
        {showTemplateTip && (
          <Tip>
            <p className="font-semibold mb-1">Templated text</p>
            <p className="mb-1">
              Use tags in the name or description to prompt the user for custom text when the
              purchase is added to their chain:
            </p>
            <p>
              <code className="font-mono">{"${TAG}"}</code> — used a short one or two word
              insertions.
            </p>
            <p className="mt-1">
              <code className="font-mono">{"$${TAG}"}</code> — used when the user should enter an
              entire sentence or short paragraph.
            </p>
            <p className="mt-1 text-ghost">
              This feature is most commonly used for perks that have distinct benefits depending on
              jumper choice, like perks that grant proficiency in a single customizable skill or
              grant control of an unspecified element.
            </p>
          </Tip>
        )}

        {/* Always-visible header widget (e.g. CostDropdown) */}
        {headerExtra != null && <div className="shrink-0">{headerExtra}</div>}

        {/* Bound count badge */}
        {bounds.length > 0 && (
          <span
            className="shrink-0 text-xs px-1.5 py-0.5 rounded-full font-mono tabular-nums leading-none"
            style={{ color, backgroundColor: color + "22" }}
          >
            {bounds.length}
          </span>
        )}

        {/* Duplicate button */}
        <button
          title="Duplicate"
          onClick={onDuplicate}
          className="shrink-0 p-1 rounded text-ghost hover:text-ink hover:bg-tint transition-colors"
        >
          <Copy size={12} />
        </button>

        {/* Delete button */}
        <button
          title="Delete"
          onClick={onDelete}
          className="shrink-0 p-1 rounded text-ghost hover:text-red-400 hover:bg-red-400/10 transition-colors"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="border-t border-edge/40 px-3 pt-2 pb-3 flex flex-col gap-2.5">
          {children}

          {/* PDF Regions */}
          {bounds.length > 0 && (
            <div className="flex flex-col gap-1 mt-0.5">
              <p className="text-[10px] font-semibold text-ghost uppercase tracking-wider">
                PDF Regions
              </p>
              {bounds.map((b, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-tint border border-edge/50 text-xs"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="flex-1 font-mono text-[10px] text-muted">{formatRect(b)}</span>
                  <button
                    title="Remove region"
                    onClick={() => onRemoveBound(i)}
                    className="text-ghost hover:text-red-400 transition-colors"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add-bound button */}
          <button
            onClick={onAddBound}
            className={`flex items-center justify-center gap-1 text-xs py-1 rounded border transition-colors ${
              isAddTarget
                ? "border-amber-400/40 bg-amber-400/10 text-amber-400"
                : "border-dashed border-edge/60 text-ghost hover:border-accent/50 hover:text-accent"
            }`}
          >
            <Crosshair size={10} />
            {isAddTarget ? "Drag a rect on the PDF…" : "Add PDF region"}
          </button>
        </div>
      )}
    </div>
  );
}

export const TemplateCard = memo(TemplateCardInner) as typeof TemplateCardInner;
