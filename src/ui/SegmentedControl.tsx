/** Pill-style segmented control — one button per option, accent2 for the active state. */
export function SegmentedControl({
  value,
  onChange,
  options,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  /** Smaller padding and text size for use in tight layouts. */
  compact?: boolean;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-full p-0.5 max-w-max">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-full transition-colors ${
            compact ? "px-2 py-px text-xs" : "px-3 py-0.5 text-sm"
          } ${
            value === opt.value
              ? "bg-accent2-tint text-accent2 border border-accent2"
              : "text-ghost hover:text-ink"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Boolean two-option segmented control. `trueLabel` maps to `true`, `falseLabel` to `false`. */
export function BoolSegment({
  value,
  onChange,
  trueLabel,
  falseLabel,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  trueLabel: string;
  falseLabel: string;
}) {
  return (
    <SegmentedControl
      value={value ? "t" : "f"}
      onChange={(v) => onChange(v === "t")}
      options={[
        { value: "f", label: falseLabel },
        { value: "t", label: trueLabel },
      ]}
    />
  );
}
