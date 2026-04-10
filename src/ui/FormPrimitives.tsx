import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Small form primitives shared across chain/jumpdoc config pages.
// ---------------------------------------------------------------------------

/** Text input that commits to the store on blur, not on every keystroke.
 *  Syncs from the store whenever the field is not focused (so undo works). */
export function BlurInput({
  value,
  onCommit,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "onBlur" | "value"> & {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);

  return (
    <input
      {...props}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        onCommit(local);
      }}
      className={`bg-transparent border border-edge rounded px-2 py-1 text-sm text-ink focus:outline-none focus:border-accent-ring ${className ?? ""}`}
    />
  );
}

/** Toggle pill for registry item lists. `size` defaults to "sm". */
export function Pill({
  active,
  onClick,
  children,
  size = "sm",
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  size?: "xs" | "sm";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-0.5 rounded-full ${size === "xs" ? "text-xs" : "text-sm"} border transition-colors ${
        active
          ? "bg-accent2-tint text-accent2 border-accent2"
          : "bg-surface text-ink border-edge hover:border-accent2 hover:text-accent2"
      }`}
    >
      {children}
    </button>
  );
}

/** Dashed "Add" pill at the end of a pill row. */
export function AddPill({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-dashed border-edge text-muted hover:border-accent2 hover:text-accent2 transition-colors"
    >
      <Plus size={11} />
      Add
    </button>
  );
}

/** Danger delete button for expanded item editors. */
export function DeleteButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-danger border border-danger/40 hover:bg-danger/10 transition-colors"
    >
      <Trash2 size={11} />
      Delete
    </button>
  );
}

/** Small icon-only "add" button for section headers. */
export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="p-0.5 rounded transition-colors hover:bg-accent/20"
    >
      <Plus size={14} />
    </button>
  );
}
