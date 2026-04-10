import { SegmentedControl } from "@/ui/SegmentedControl";
import type { PurchaseListContent, PurchaseListGroupBy, PurchaseListOptions } from "../types";

type Props = {
  options: PurchaseListOptions;
  onChange: (options: PurchaseListOptions) => void;
};

function GroupLabel({ label }: { label: string }) {
  return (
    <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">{label}</p>
  );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-accent" />
      {label}
    </label>
  );
}

const CONTENT_OPTIONS: { value: PurchaseListContent; label: string }[] = [
  { value: "both", label: "Both" },
  { value: "perks", label: "Perks" },
  { value: "items", label: "Items" },
];

const GROUP_BY_OPTIONS: { value: PurchaseListGroupBy; label: string }[] = [
  { value: "category", label: "Category" },
  { value: "tag", label: "Tag" },
  { value: "none", label: "None" },
];

export function PurchaseListOptionsPanel({ options, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <section>
        <GroupLabel label="Content" />
        <SegmentedControl
          value={options.content}
          onChange={(v) => onChange({ ...options, content: v as PurchaseListContent })}
          options={CONTENT_OPTIONS}
        />
      </section>

      <section>
        <GroupLabel label="Group By" />
        <SegmentedControl
          value={options.groupBy}
          onChange={(v) => onChange({ ...options, groupBy: v as PurchaseListGroupBy })}
          options={GROUP_BY_OPTIONS}
        />
      </section>

      <section>
        <GroupLabel label="Display" />
        <CheckRow
          label="Show origin jump"
          checked={options.showJump}
          onChange={() => onChange({ ...options, showJump: !options.showJump })}
        />
      </section>
    </div>
  );
}
