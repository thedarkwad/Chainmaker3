import { ChevronDown, ChevronRight, Pencil, X, Check } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

type EditableSectionProps = {
  title: string;
  /** When true the section is treated as empty and collapses by default. */
  isEmpty?: boolean;
  /** When true the card mounts already in edit mode. */
  initiallyEditing?: boolean;
  /** Content rendered in view mode. */
  viewContent: ReactNode;
  /** Content rendered in edit mode. */
  editContent: ReactNode;
  /** Called when the user clicks the pencil icon to enter edit mode. */
  onEnterEdit?: () => void;
  /** Called when the user clicks Save. */
  onSave: () => void;
  /** Called when the user clicks Cancel. */
  onCancel: () => void;
  /** Extra element rendered at the right edge of the header alongside the pencil. */
  action?: ReactNode;
  /**
   * When true, the header and body are rendered as separate free-floating
   * elements with a small gap between them (body gets its own background and
   * rounded corners). When false (default), they form a single connected card
   * with a shared border.
   */
  separated?: boolean;
  className?: string;

  altColor?: boolean;
};

/**
 * A collapsible card with a view / edit toggle.
 *
 * - Collapses by default when `isEmpty` is true.
 * - In view mode: shows a pencil button to enter edit mode.
 * - In edit mode: shows Save and Cancel buttons.
 * - While editing, Enter (no Shift) saves and Esc cancels from any input/textarea.
 */
export function EditableSection({
  title,
  isEmpty = false,
  initiallyEditing = false,
  viewContent,
  editContent,
  onEnterEdit,
  onSave,
  onCancel,
  action,
  separated = false,
  className,
  altColor,
}: EditableSectionProps) {
  const [isOpen, setIsOpen] = useState(!isEmpty || initiallyEditing);
  const [isEditing, setIsEditing] = useState(initiallyEditing);

  // Call onEnterEdit on mount when starting in edit mode (e.g. newly-added cards).
  const onEnterEditRef = useRef(onEnterEdit);
  onEnterEditRef.current = onEnterEdit;
  useEffect(() => {
    if (initiallyEditing) onEnterEditRef.current?.();
  }, []); // intentionally runs once on mount only

  const handleEdit = () => {
    if (!isOpen) setIsOpen(true);
    onEnterEdit?.();
    setIsEditing(true);
  };

  const handleSave = () => {
    onSave();
    setIsEditing(false);
  };

  const handleCancel = () => {
    onCancel();
    setIsEditing(false);
  };

  // Enter (no Shift) → save; Escape → cancel — fired from any input/textarea inside.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isEditing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  };

  const header = (
    <div
      className={`flex items-center gap-1 px-3 py-1.5 ${altColor ? "bg-accent2-tint" : "bg-accent/25"} select-none border-edge ${
        separated || !isOpen ? "rounded-md" : "rounded-t-lg"
      } ${separated ? "border" : ""}`}
    >
      {/* Collapse toggle */}
      <button
        type="button"
        onClick={() => !isEditing && setIsOpen((o) => !o)}
        className={`flex items-center gap-2 flex-1 min-w-0 ${altColor ? "text-accent2" : "text-accent"} text-sm font-semibold cursor-pointer`}
      >
        {isOpen ? (
          <ChevronDown size={13} className="shrink-0" />
        ) : (
          <ChevronRight size={13} className="shrink-0" />
        )}
        <span className="truncate">{title}</span>
      </button>

      {/* Right-side controls */}
      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        {action}
        {isEditing ? (
          <>
            <button
              type="button"
              title="Save"
              onClick={handleSave}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${altColor ? "bg-accent2 hover:bg-accent2/80" : "bg-accent hover:bg-accent/80"} text-surface transition-colors`}
            >
              <Check size={11} />
              Save
            </button>
            <button
              type="button"
              title="Cancel"
              onClick={handleCancel}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-surface text-muted border border-edge ${altColor ? "hover:bg-accent2-tint" : "hover:bg-accent-tint"} transition-colors`}
            >
              <X size={11} />
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            title="Edit"
            onClick={handleEdit}
            className={`p-1 rounded ${altColor ? "text-accent2 hover:bg-accent2/20" : "text-accent hover:bg-accent/20"} transition-colors`}
          >
            <Pencil size={12} />
          </button>
        )}
      </div>
    </div>
  );

  if (separated) {
    return (
      <div className={className}>
        {header}
        {isOpen && (
          <div
            className="mt-2 bg-surface rounded-md border border-edge p-3"
            onKeyDown={handleKeyDown}
          >
            {isEditing ? editContent : viewContent}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`border border-edge h-min rounded-lg overflow-hidden ${className ?? ""}`}>
      {header}
      {isOpen && (
        <div className="bg-surface border-t border-edge p-3" onKeyDown={handleKeyDown}>
          {isEditing ? editContent : viewContent}
        </div>
      )}
    </div>
  );
}
