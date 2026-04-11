/**
 * JumpDocFields — reusable field components for JumpDoc template cards.
 *
 * Components:
 *  - FieldRow         — labeled form row (label + content)
 *  - BlurInput        — text input that commits on blur, syncs from store
 *  - BlurNumberInput  — re-exported from @/ui/BlurNumberInput
 *  - DescriptionArea  — auto-sizing description textarea
 *  - SimpleValueEditor — edits a single {amount, currency} pair (OriginTemplate.cost)
 *  - ValueEditor       — edits SimpleValue[] (PurchaseTemplate.cost)
 *  - OriginMultiselect — pill-based multiselect for origins grouped by category
 *  - AllowMultipleRow  — checkbox row for allowMultiple
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus, X } from "lucide-react";
import { BlurNumberInput } from "@/ui/BlurNumberInput";
export { BlurNumberInput } from "@/ui/BlurNumberInput";
import {
  useJumpDocCurrencyIds,
  useJumpDocCurrency,
  useJumpDocOriginsGrouped,
  useJumpDocPurchaseSubtypeIds,
  useJumpDocPurchaseSubtype,
} from "@/jumpdoc/state/hooks";
import type { Id } from "@/chain/data/types";
import { TID, LID } from "@/chain/data/types";
import type { SimpleValue } from "@/chain/data/Purchase";

// ─────────────────────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────────────────────

/** Labeled two-column form row. Label is fixed-width on the left. */
export function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 min-w-0 justify-items-center font-semibold">
      <span className="text-xs text-muted shrink-0 py-1 leading-none">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────────────────────

/** Text input — controlled locally, commits to store on blur, syncs when unfocused. */
export function BlurInput({
  value,
  onCommit,
  className = "",
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "onBlur" | "value"> & {
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
      step={50}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        onCommit(local.trim());
      }}
      className={`bg-canvas border border-edge rounded px-2 py-1 text-sm text-ink focus:outline-none focus:border-accent-ring transition-colors ${className}`}
    />
  );
}


/** Auto-resizing description textarea. */
export function DescriptionArea({
  value,
  onCommit,
  textareaRef,
  placeholder = "Description…",
  className,
  maxHeight,
}: {
  value: string;
  onCommit: (v: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  placeholder?: string;
  className?: string;
  maxHeight?: string;
}) {
  const local = useRef(value);
  const focused = useRef(false);
  const internalRef = useRef<HTMLTextAreaElement>(null);

  // Sync store → local when not focused (including after PDF text extraction).
  useEffect(() => {
    if (!focused.current) local.current = value;
  }, [value]);

  useEffect(() => {
    return () => {
      if (local.current !== value) onCommit(local.current);
    };
  }, []);

  // Auto-resize on mount.
  useEffect(() => {
    const el = internalRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  return (
    <textarea
      ref={(el) => {
        (internalRef as React.RefObject<HTMLTextAreaElement | null>).current = el;
        if (textareaRef) (textareaRef as React.RefObject<HTMLTextAreaElement | null>).current = el;
      }}
      defaultValue={value}
      onChange={(e) => {
        local.current = e.target.value;
        const el = e.currentTarget;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        if (local.current !== value) onCommit(local.current.trim());
      }}
      placeholder={placeholder}
      style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
      className={`w-full text-xs text-ink bg-canvas border border-edge rounded px-2 py-1.5 resize-none overflow-hidden focus:outline-none focus:border-accent-ring placeholder-ghost transition-colors min-h-10 ${className ?? ""}`}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Currency helpers
// ─────────────────────────────────────────────────────────────────────────────

export function CurrencySelect<T extends LID.Currency | TID.Currency = TID.Currency>({
  value,
  onChange,
}: {
  value: Id<T>;
  onChange: (id: Id<T>) => void;
}) {
  const currencyIds = useJumpDocCurrencyIds();
  return (
    <div className="relative shrink-0">
      <select
        value={String(value)}
        onChange={(e) => onChange(+e.target.value as Id<T>)}
        className="appearance-none bg-canvas border border-edge rounded px-2 py-1 pr-6 text-xs text-ink focus:outline-none focus:border-accent-ring transition-colors"
      >
        {currencyIds.length === 0 && <option value="0">—</option>}
        {currencyIds.map((cid) => (
          <CurrencyOption key={cid} id={cid} />
        ))}
      </select>
      <ChevronDown
        size={10}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted"
      />
    </div>
  );
}

function CurrencyOption({ id }: { id: Id<TID.Currency> }) {
  const c = useJumpDocCurrency(id);
  return <option value={String(id)}>{c?.abbrev ?? "?"}</option>;
}

export function PurchaseSubtypeSelect<T extends TID.PurchaseSubtype = TID.PurchaseSubtype>({
  value,
  onChange,
}: {
  value: Id<T>;
  onChange: (id: Id<T>) => void;
}) {
  const subtypeIds = useJumpDocPurchaseSubtypeIds();
  return (
    <div className="relative shrink-0">
      <select
        value={String(value)}
        onChange={(e) => onChange(+e.target.value as Id<T>)}
        className="appearance-none bg-canvas border border-edge rounded px-2 py-1 pr-6 text-xs text-ink focus:outline-none focus:border-accent-ring transition-colors"
      >
        {subtypeIds.length === 0 && <option value="0">—</option>}
        {subtypeIds.map((sid) => (
          <SubtypeOption key={sid} id={sid} />
        ))}
      </select>
      <ChevronDown
        size={10}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted"
      />
    </div>
  );
}

function SubtypeOption({ id }: { id: Id<TID.PurchaseSubtype> }) {
  const s = useJumpDocPurchaseSubtype(id);
  return <option value={String(id)}>{s?.name ?? "?"}</option>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SimpleValueEditor — single {amount, currency} cost entry (Origins)
// ─────────────────────────────────────────────────────────────────────────────

export function SimpleValueEditor({
  value,
  onChange,
}: {
  value: SimpleValue;
  onChange: (v: SimpleValue) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <BlurNumberInput
        value={value.amount}
        onCommit={(n) => onChange({ ...value, amount: n })}
        className="w-16"
        min={-99999}
      />
      <CurrencySelect
        value={value.currency}
        onChange={(cid) => onChange({ ...value, currency: cid })}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ValueEditor — editable SimpleValue[] list (Purchases / Drawbacks)
// ─────────────────────────────────────────────────────────────────────────────

export function ValueEditor({
  value,
  onChange,
}: {
  value: SimpleValue<TID.Currency>[];
  onChange: (v: SimpleValue<TID.Currency>[]) => void;
}) {
  const currencyIds = useJumpDocCurrencyIds();

  const updateEntry = (i: number, entry: SimpleValue<TID.Currency>) => {
    const next = [...value];
    next[i] = entry;
    onChange(next);
  };

  const removeEntry = (i: number) => {
    onChange(value.filter((_, idx) => idx !== i));
  };

  const addEntry = () => {
    const defaultCurrency = currencyIds[0];
    onChange([...value, { amount: 0, currency: defaultCurrency }]);
  };

  if (value.length === 0) {
    return (
      <button
        onClick={addEntry}
        className="flex items-center gap-1 text-xs text-ghost hover:text-accent transition-colors"
      >
        <Plus size={10} /> Add cost
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {value.map((sv, i) => (
        <div key={i} className="flex items-center gap-1">
          <BlurNumberInput
            value={sv.amount}
            onCommit={(n) => updateEntry(i, { ...sv, amount: n })}
            className="w-16"
            min={-99999}
          />
          <CurrencySelect
            value={sv.currency}
            onChange={(cid) => updateEntry(i, { ...sv, currency: cid })}
          />
          <button
            onClick={() => removeEntry(i)}
            className="text-ghost hover:text-red-400 transition-colors p-0.5"
          >
            <X size={10} />
          </button>
        </div>
      ))}
      <button
        onClick={addEntry}
        className="flex items-center gap-1 text-xs text-ghost hover:text-accent transition-colors mt-0.5"
      >
        <Plus size={10} /> Add entry
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OriginMultiselect — pills for PurchaseTemplate.origins
// ─────────────────────────────────────────────────────────────────────────────

const ORIGIN_COLOR = "#22c55e";

// DELETED

// ─────────────────────────────────────────────────────────────────────────────
// ChoiceContextEditor — tag pill display + choiceContext textarea
// ─────────────────────────────────────────────────────────────────────────────

const TAG_RE = /\$\{([^}]+)\}/g;

export function extractUniqueTags(...texts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of texts) {
    for (const [, tag] of text.matchAll(TAG_RE)) {
      const key = tag.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(tag);
      }
    }
  }
  return out;
}

function toTitleCase(tag: string): string {
  return tag.replace(/[\s_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Displays the ${TAG} and $${TAG} placeholders found in `name` and `description`
 * as labelled pills, and provides a textarea to edit `choiceContext`.
 * Renders nothing when no tags are present.
 */
export function ChoiceContextEditor({
  name,
  description,
  choiceContext,
  onCommit,
}: {
  name: string;
  description: string;
  choiceContext: string | undefined;
  onCommit: (v: string | undefined) => void;
}) {
  const customTags = extractUniqueTags(name, description);
  if (customTags.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] font-semibold text-ghost uppercase tracking-wider">
        Customizable Fields
      </p>
      <div className="flex flex-wrap gap-1">
        {customTags.map((tag) => (
          <span
            key={tag.toLowerCase()}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20"
          >
            <span className="opacity-50 font-mono text-[10px]">{"{}"}</span>
            {toTitleCase(tag)}
          </span>
        ))}
      </div>
      <DescriptionArea
        value={choiceContext ?? ""}
        onCommit={(v) => onCommit(v.trim() || undefined)}
        placeholder="Explain what readers should enter for each field…"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AllowMultipleRow — checkbox for allowMultiple field
// ─────────────────────────────────────────────────────────────────────────────

export function AllowMultipleRow({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-accent w-3.5 h-3.5"
      />
      <span className="text-xs text-muted">Allow multiple</span>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BoostedEditor — capstone booster UI for purchases
// ─────────────────────────────────────────────────────────────────────────────

const BOOSTER_COLOR = "#8b5cf6";

/** Portal dropdown for selecting which capstone booster purchase or drawback applies. */
function BoostedByMultiselect({
  available,
  selected,
  onAdd,
  onRemove,
}: {
  available: { id: number; name: string; kind: "purchase" | "drawback" }[];
  selected: number[];
  onAdd: (id: number, kind: "purchase" | "drawback") => void;
  onRemove: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!containerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selectedSet = new Set(selected);
  const availableOptions = available.filter((b) => !selectedSet.has(b.id));
  const selectedItems = available.filter((b) => selectedSet.has(b.id));

  function handleToggle() {
    if (!open && containerRef.current) {
      const r = containerRef.current.getBoundingClientRect();
      setDropdownPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen((o) => !o);
  }

  const dropdown =
    open && availableOptions.length > 0
      ? createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: dropdownPos.top,
              left: dropdownPos.left,
              zIndex: 9999,
            }}
            className="w-52 bg-canvas border border-edge rounded-md shadow-lg max-h-52 overflow-y-auto"
          >
            {availableOptions.map((b) => (
              <button
                key={b.id}
                onClick={() => {
                  onAdd(b.id, b.kind);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-ink hover:bg-tint transition-colors"
              >
                {b.name}
                {b.kind === "drawback" && (
                  <span className="ml-1.5 text-[10px] text-red-400 opacity-70">drawback</span>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={containerRef} className="flex flex-wrap gap-1 items-center">
      {selectedItems.map((b) => (
        <span
          key={b.id}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
          style={{
            color: BOOSTER_COLOR,
            backgroundColor: BOOSTER_COLOR + "18",
            borderColor: BOOSTER_COLOR + "40",
          }}
        >
          {b.name}
          <button onClick={() => onRemove(b.id)} className="hover:opacity-70 transition-opacity">
            <X size={9} />
          </button>
        </span>
      ))}
      <button
        onClick={handleToggle}
        disabled={availableOptions.length === 0}
        className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs border border-dashed border-edge text-ghost hover:border-accent/60 hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus size={10} />
        Add
      </button>
      {selected.length === 0 && availableOptions.length === 0 && (
        <span className="text-xs text-ghost italic">None</span>
      )}
      {dropdown}
    </div>
  );
}

/**
 * Renders the boosted-version UI for a purchase template.
 *
 * - 0 available boosters (or only self): renders nothing.
 * - 1 available booster: "Boosted Version" checkbox + textarea.
 * - 2+ available boosters: multiselect pills + per-booster textarea.
 *
 * `purchaseId` is used to exclude the current purchase from its own booster list.
 * `boosted[i].booster` stores a purchase ID cast to Id<TID.Origin> (existing type).
 */
export function BoostedEditor({
  boosted,
  capstoneBoosterItems,
  onAdd,
  onRemove,
  onCommitDescription,
}: {
  boosted: { description: string; booster: number; boosterKind?: "purchase" | "drawback" }[];
  capstoneBoosterItems: { id: number; name: string; kind: "purchase" | "drawback" }[];
  onAdd: (boosterId: number, boosterKind: "purchase" | "drawback") => void;
  onRemove: (boosterId: number) => void;
  onCommitDescription: (boosterId: number, desc: string) => void;
}) {
  const available = capstoneBoosterItems;
  const selectedIds = boosted.map((b) => b.booster);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted shrink-0">Boosted by</span>
        <BoostedByMultiselect
          available={available}
          selected={selectedIds}
          onAdd={onAdd}
          onRemove={onRemove}
        />
      </div>
      {boosted.map((entry) => {
        const idNum = entry.booster;
        const boosterName = available.find((b) => b.id === idNum)?.name ?? "Booster";
        return (
          <div
            key={idNum}
            className="flex flex-col gap-1 pl-2 border-l-2"
            style={{ borderColor: BOOSTER_COLOR + "60" }}
          >
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: BOOSTER_COLOR }}
            >
              {boosterName}
            </span>
            <DescriptionArea
              value={entry.description}
              onCommit={(desc) => onCommitDescription(idNum, desc)}
            />
          </div>
        );
      })}
    </div>
  );
}
