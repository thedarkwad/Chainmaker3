import { useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Tag, X, Plus } from "lucide-react";

type TagFieldProps = {
  label?: string;
  values: string[];
  onAdd: (val: string) => void;
  onRemove: (val: string) => void;
  placeholder?: string;
  /**
   * When provided, shows a filtered autocomplete dropdown.
   * By default, only values from this list can be added.
   * Pass freeEntry={true} to also allow arbitrary values.
   */
  suggestions?: string[];
  /** Allow free-text entry even when suggestions are provided. Default: false. */
  freeEntry?: boolean;
};

/**
 * Reusable tag field.
 *
 * - Without `suggestions`: free-entry input; commit on Enter, comma, or blur.
 * - With `suggestions`: filtered autocomplete dropdown; only matching values
 *   can be submitted (unless freeEntry={true}).
 *
 * Uses absolute dropdown positioning — the nearest `relative` ancestor will
 * clip it, so callers inside an overflow-hidden container should ensure the
 * dropdown can escape (e.g. the container itself is not overflow-hidden).
 */
export function TagField({
  label,
  values,
  onAdd,
  onRemove,
  placeholder = "Add…",
  suggestions,
  freeEntry = false,
}: TagFieldProps) {
  const [input, setInput] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const inputValueRef = useRef(""); // avoids stale closure in blur handler
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredSuggestions =
    suggestions
      ?.filter((s) => !values.includes(s))
      .filter((s) => s.toLowerCase().includes(input.toLowerCase())) ?? [];

  // Close dropdown when clicking outside.
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  // Compute fixed position for the portaled dropdown whenever it opens.
  useEffect(() => {
    if (!dropdownOpen || !inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      minWidth: Math.max(rect.width, 192),
      maxHeight: 192,
      zIndex: 9999,
    });
  }, [dropdownOpen]);

  const commit = useCallback(
    (rawValue?: string) => {
      const trimmed = (rawValue ?? inputValueRef.current).trim();
      inputValueRef.current = "";
      setInput("");
      setDropdownOpen(false);
      setHighlightedIndex(-1);
      if (!trimmed || values.includes(trimmed)) return;
      if (suggestions && !freeEntry && !suggestions.includes(trimmed)) return;
      onAdd(trimmed);
    },
    [values, suggestions, freeEntry, onAdd],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, filteredSuggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, -1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (highlightedIndex >= 0 && filteredSuggestions[highlightedIndex]) {
          commit(filteredSuggestions[highlightedIndex]);
        } else if (freeEntry || !suggestions) {
          commit();
        }
        return;
      }
      if (e.key === "Escape") {
        setDropdownOpen(false);
        setHighlightedIndex(-1);
        return;
      }
    } else {
      // Free-entry: commit on Enter or comma
      if ((e.key === "Enter" || e.key === ",") && inputValueRef.current.length) {
        e.preventDefault();
        e.stopPropagation();
        commit();
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    }
  };

  return (
    <div className="flex items-start gap-2">
      {label && (
        <span className="text-xs text-muted shrink-0 pt-0.5">{label}</span>
      )}
      <div className="flex flex-wrap items-center gap-1.5 flex-1">
        {/* Selected tags */}
        {(values ?? []).map((val) => (
          <span
            key={val}
            className="flex items-center gap-1 text-xs bg-tint border border-edge text-ink rounded px-2 py-0.5"
          >
            <Tag size={10} />
            {val}
            <button
              type="button"
              onClick={() => onRemove(val)}
              className="text-muted hover:text-ink transition-colors"
            >
              <X size={10} />
            </button>
          </span>
        ))}

        {/* Input area */}
        <div ref={containerRef} className="relative flex items-center gap-1">
          <input
            ref={inputRef}
            className="text-xs border border-edge rounded px-1.5 py-0.5 w-28 focus:outline-none focus:border-accent-ring bg-surface text-ink"
            placeholder={placeholder}
            value={input}
            onChange={(e) => {
              inputValueRef.current = e.target.value;
              setInput(e.target.value);
              if (suggestions) {
                setDropdownOpen(true);
                setHighlightedIndex(-1);
              }
            }}
            onFocus={() => {
              if (suggestions) setDropdownOpen(true);
            }}
            onBlur={() => {
              if (!suggestions) {
                commit();
              } else {
                // Delay to let mousedown on dropdown item fire first
                setTimeout(() => setDropdownOpen(false), 150);
              }
            }}
            onKeyDown={handleKeyDown}
          />

          {/* + button for free-entry mode */}
          {!suggestions && (
            <button
              type="button"
              onClick={() => commit()}
              className="text-muted hover:text-ink transition-colors p-0.5"
            >
              <Plus size={13} />
            </button>
          )}

          {/* Autocomplete dropdown — portaled to body to escape overflow-hidden ancestors */}
          {suggestions && dropdownOpen && filteredSuggestions.length > 0 &&
            createPortal(
              <ul
                className="overflow-y-auto bg-canvas border border-edge rounded shadow-lg"
                style={dropdownStyle}
              >
                {filteredSuggestions.map((s, i) => (
                  <li
                    key={s}
                    onMouseDown={(e) => {
                      e.preventDefault(); // prevent blur from firing first
                      commit(s);
                      inputRef.current?.focus();
                    }}
                    className={`px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                      i === highlightedIndex
                        ? "bg-accent-tint text-accent"
                        : "text-ink hover:bg-tint"
                    }`}
                  >
                    {s}
                  </li>
                ))}
              </ul>,
              document.body,
            )}
        </div>
      </div>
    </div>
  );
}
