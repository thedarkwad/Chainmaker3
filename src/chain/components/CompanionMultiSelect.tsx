import { ChevronDown, Plus, UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { GID, Id } from "@/chain/data/types";

const FILTER_THRESHOLD = 10;

export function CompanionMultiSelect({
  selected,
  available,
  onAdd,
  onRemove,
  onNew,
  max,
}: {
  selected: { id: Id<GID.Character>; name: string }[];
  available: { id: Id<GID.Character>; name: string }[];
  onAdd: (id: Id<GID.Character>) => void;
  onRemove: (id: Id<GID.Character>) => void;
  onNew?: () => void;
  max?: number;
}) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const focusSinkRef = useRef<HTMLDivElement>(null);
  const atLimit = max !== undefined && selected.length >= max;
  const showFilter = available.length > FILTER_THRESHOLD;

  const filtered = showFilter && filter.trim()
    ? available.filter((c) =>
        (c.name || "(Unnamed)").toLowerCase().includes(filter.toLowerCase())
      )
    : available;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Autofocus filter input when dropdown opens.
  useEffect(() => {
    if (open && showFilter) {
      setTimeout(() => filterRef.current?.focus(), 0);
    }
    if (!open) setFilter("");
  }, [open, showFilter]);

  function handleOpen() {
    if (atLimit) return;
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setDropUp(rect.bottom > window.innerHeight - 200);
    }
    setOpen((o) => !o);
  }

  function handleFilterKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const top = filtered[0];
      if (top) { onAdd(top.id); }
      focusSinkRef.current?.focus();
      setOpen(false);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      focusSinkRef.current?.focus();
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((c) => (
        <span
          key={c.id}
          className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-accent2-tint text-accent2 border border-accent2/30"
        >
          {c.name || "(Unnamed)"}
          <button
            type="button"
            onClick={() => onRemove(c.id)}
            className="ml-0.5 rounded-full text-accent2/50 hover:text-accent2 transition-colors"
          >
            <X size={10} />
          </button>
        </span>
      ))}

      {/* Focus sink — receives focus on Enter/Escape to keep parent focused without closing it */}
      <div ref={focusSinkRef} tabIndex={-1} className="sr-only" aria-hidden />

      <div className="relative" ref={ref}>
        <button
          type="button"
          disabled={atLimit}
          onClick={handleOpen}
          className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full border border-dashed border-accent-ring/50 bg-surface/50 text-accent/50 hover:text-accent hover:border-accent-ring transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={10} />
          Add Companion
          <ChevronDown size={9} className="ml-0.5 opacity-60" />
        </button>

        {open && (
          <div
            className={`absolute left-0 z-20 flex flex-col bg-surface border border-edge rounded-lg shadow-lg overflow-hidden min-w-44 ${
              dropUp ? "bottom-full mb-1" : "top-full mt-1"
            }`}
          >
            {showFilter && (
              <div className="border-b border-edge px-2 py-1.5">
                <input
                  ref={filterRef}
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  onKeyDown={handleFilterKeyDown}
                  placeholder="Filter companions…"
                  className="w-full bg-transparent text-xs text-ink placeholder:text-ghost focus:outline-none"
                />
              </div>
            )}

            <div className="overflow-y-auto max-h-52">
              {filtered.length > 0 ? (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { onAdd(c.id); setOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-ink hover:bg-tint transition-colors"
                  >
                    {c.name || "(Unnamed)"}
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-xs text-ghost italic">
                  {showFilter && filter ? "No matches" : "No other companions available"}
                </p>
              )}
            </div>

            {onNew && (
              <button
                type="button"
                onClick={() => { onNew(); setOpen(false); }}
                className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs text-accent font-medium hover:bg-accent-tint transition-colors border-t border-edge shrink-0"
              >
                <UserPlus size={12} />
                New Companion
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
