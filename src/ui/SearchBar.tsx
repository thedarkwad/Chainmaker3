import { Search, X } from "lucide-react";
import { Tip } from "./Tip";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inverted?: boolean;
  autoFocus?: boolean;
  /**
   * Custom tip content rendered inside the Tip popover.
   * If omitted (and hideTip is false), falls back to the default perk-search syntax help.
   */
  tip?: React.ReactNode;
  /** Hide the search-syntax tip icon. Use when the search is non-functional or context makes it irrelevant. */
  hideTip?: boolean;
};

/**
 * Search input with an integrated clear button and search-syntax tip.
 * Controlled component — manages no state internally.
 *
 * `inverted` — use when the bar sits on a dark accent background. Switches to
 *  light-on-dark colors (semi-transparent white border/bg, surface-colored text).
 */
export function SearchBar({
  value,
  onChange,
  placeholder = "Search…",
  className,
  inverted = false,
  autoFocus = false,
  tip,
  hideTip = false,
}: SearchBarProps) {
  const wrapperCls = inverted
    ? "bg-surface/50 shadow-[inset_0rem_0rem_7px] shadow-accent-ring/90 focus-within:shadow-none text-ink/70"
    : "bg-surface border-edge focus-within:border-accent-ring text-ghost";

  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors ${wrapperCls} ${className ?? ""}`}
    >
      <Search
        size={14}
        className={`shrink-0`}
      />
      <input
        className={`flex-1 text-sm bg-transparent outline-none ${
          inverted ? "placeholder:text-ink/50" : "placeholder-ghost"
        }`}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className={`p-0.5 transition-colors ${inverted ? "hover:text-danger" : "text-ghost hover:text-muted"}`}
          title="Clear"
        >
          <X size={13} />
        </button>
      )}
      {!hideTip && (
        <Tip>
          {tip ?? (
            <>
              <p className="font-semibold text-ink mb-1.5">Search syntax</p>
              <div className="flex flex-col gap-1 leading-relaxed">
                <p><code className="font-mono bg-tint px-1 rounded">word</code>{" — "} name, description, or tag</p>
                <p><code className="font-mono bg-tint px-1 rounded">name:word</code>{" — "} name only</p>
                <p><code className="font-mono bg-tint px-1 rounded">description:word</code>{" — "} description only</p>
                <p><code className="font-mono bg-tint px-1 rounded">tag:word</code>{" — "} tag contains word</p>
                <p><code className="font-mono bg-tint px-1 rounded">{'tag:"exact tag"'}</code>{" — "} exact tag match</p>
                <p className="mt-1 text-ghost">Multiple terms are ANDed.</p>
              </div>
            </>
          )}
        </Tip>
      )}
    </div>
  );
}
