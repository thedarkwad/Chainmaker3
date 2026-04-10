/**
 * Reusable card for annotation interaction previews shown in the SweetAlert2 popup.
 *
 * Covers the common case: a header with typeName + name + optional cost,
 * an optional description block, a warning line, custom children, and a
 * confirm / cancel button row.
 * When errorMessage is set, renders an error state with only an OK button.
 */
import { convertWhitespace } from "@/utilities/miscUtilities";
import { useEffect, useRef, type ReactNode } from "react";

export type InteractionPreviewCardProps = {
  typeName: string;
  name: string;
  accentColor: string;
  /** Shown below the name when the user is adding (not removing). */
  costStr?: string;
  /** Multi-line descriptive text shown below the header. */
  description?: string;
  /** Amber warning line, e.g. "Will replace: X". */
  warning?: string;
  /** Neutral info line shown below the warning. */
  info?: string;
  /** If set, replaces the confirm/cancel buttons with an error message + OK. */
  errorMessage?: string;
  tooltip?: string;
  actions: {
    label: string;
    variant: "confirm" | "warn" | "danger";
    blocker?: string;
    /** When true, clicking this action does not auto-dismiss the modal. */
    noAutoClose?: boolean;
    onConfirm: () => void;
  }[];
  onClose: () => void;
  /** Extra content rendered between description and buttons (e.g. tag inputs). */
  children?: ReactNode;
};

const variantClass: Record<InteractionPreviewCardProps["actions"][number]["variant"], string> = {
  confirm: "bg-accent-tint border-accent text-accent hover:bg-accent/20",
  warn: "bg-accent-tint border-accent text-accent hover:bg-accent/20",
  danger: "bg-danger/10 border-danger/40 text-danger hover:bg-danger/20",
};

function getInputs(el: HTMLElement): HTMLInputElement[] {
  return Array.from(el.querySelectorAll<HTMLInputElement>("input[type=text],input:not([type]),textarea"));
}

export function InteractionPreviewCard({
  typeName,
  name,
  costStr,
  description,
  warning,
  info,
  errorMessage,
  actions,
  onClose,
  tooltip,
  children,
}: InteractionPreviewCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-focus first input on mount
  useEffect(() => {
    const inputs = containerRef.current ? getInputs(containerRef.current) : [];
    if (inputs.length > 0) inputs[0].focus();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Enter") {
        const active = document.activeElement;
        const container = containerRef.current;
        if (!container) return;
        const inputs = getInputs(container);
        const focusedIdx = inputs.findIndex((el) => el === active);
        if (focusedIdx !== -1 && !e.shiftKey && !e.ctrlKey) {
          // Focused in a field — advance to next input or confirm
          const next = inputs[focusedIdx + 1];
          if (next) {
            e.preventDefault();
            setTimeout(() => next.focus(), 0);
          } else {
            e.preventDefault();
            (document.activeElement as HTMLElement).blur();
          }
        } else if (focusedIdx === -1) {
          // No field focused — confirm
          e.preventDefault();
          const first = actions.find((a) => !a.blocker);
          if (first) { first.onConfirm(); if (!first.noAutoClose) onClose(); }
        }
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [actions, onClose]);

  return (
    <div ref={containerRef} className="px-4 pb-4 pt-3 flex flex-col gap-3 text-left">
      <div
        className={`flex flex-row flex-wrap gap-1 items-center justify-center ${errorMessage ? "border-l-2 border-edge pl-2" : ""}`}
      >
        <div className="text-xs text-ghost tracking-widest uppercase -mb-0.5">
          {typeName} {name ? "–" : ""}
        </div>
        {name ? <div className="text-sm font-semibold text-ink">{name}</div> : null}
        {!errorMessage && costStr && <div className="text-sm text-muted">[{costStr}]</div>}
      </div>

      {description && (
        <div className="text-xs text-muted flex flex-col gap-1.5 max-h-60 overflow-y-auto leading-relaxed bg-tint/30 p-2 border-accent-ring/15 rounded-sm border">
          {convertWhitespace(description)}
        </div>
      )}

      {errorMessage ? (
        <>
          <p className="text-xs text-danger">{errorMessage}</p>
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded bg-tint border border-edge text-muted hover:text-ink transition-colors"
          >
            OK
          </button>
        </>
      ) : (
        <>
          {warning && (
            <p className="text-xs text-warn">
              Will replace: <span className="font-medium">{warning}</span>
            </p>
          )}
          {info && <p className="text-xs text-muted">{info}</p>}
          {children}
          <div className="flex gap-2 mt-auto">
            {actions.map(({ label, variant, onConfirm, blocker, noAutoClose }) => (
              <button
                disabled={!!blocker}
                title={blocker}
                onClick={() => {
                  onConfirm();
                  if (!noAutoClose) onClose();
                }}
                className={`flex-1 text-xs px-3 py-1.5 rounded border font-medium transition-colors ${variantClass[variant]}`}
              >
                {label}
              </button>
            ))}
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded text-muted hover:text-ink transition-colors"
            >
              Cancel
            </button>
            {/* TODO: tip in modal */}
            {/* {tooltip ?? <Tip>tooltip</Tip>} */}
          </div>
        </>
      )}
    </div>
  );
}
