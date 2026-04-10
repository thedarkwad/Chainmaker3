/**
 * OriginBenefitSection — shared origin-discount/access picker used by both
 * PurchasesSection and CompanionsSection.
 *
 * Renders per-category origin pills (select/deselect) and, when at least one
 * origin is selected, a SegmentedControl for the benefit type plus a Tip
 * explaining each option.
 */

import { SegmentedControl } from "@/ui/SegmentedControl";
import { Tip } from "@/ui/Tip";
import { FieldRow } from "./JumpDocFields";
import type { OriginGroup } from "@/jumpdoc/state/hooks";
import type { Id } from "@/chain/data/types";
import { TID } from "@/chain/data/types";

export type OriginBenefit = "discounted" | "free" | "access";

export function OriginBenefitSection({
  selectedOriginIds,
  originBenefit,
  discountGroups,
  onToggleOrigin,
  onBenefitChange,
}: {
  /** Set of numeric origin IDs currently selected on this template. */
  selectedOriginIds: Set<Id<TID.Origin>>;
  originBenefit: OriginBenefit | undefined;
  discountGroups: OriginGroup[];
  /** Called when an origin pill is clicked. `willBeSelected` is the new state. */
  onToggleOrigin: (id: Id<TID.Origin>, willBeSelected: boolean) => void;
  onBenefitChange: (v: OriginBenefit) => void;
}) {
  if (discountGroups.length === 0) return null;

  const selectedCount = selectedOriginIds.size;
  const s = selectedCount === 1 ? "origin" : "origins";

  return (
    <>
      {discountGroups.map((group) => (
        <FieldRow key={group.catId} label={`${group.catName}:`}>
          <div className="flex flex-wrap gap-1">
            {group.origins.length === 0 ? (
              <span className="text-xs text-ghost italic">No origins defined</span>
            ) : (
              group.origins.map((origin) => {
                const isSelected = selectedOriginIds.has(origin.id);
                return (
                  <button
                    key={origin.id}
                    type="button"
                    onClick={() => onToggleOrigin(origin.id, !isSelected)}
                    className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                      isSelected
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : "bg-surface text-ghost border-edge hover:border-ink hover:text-ink"
                    }`}
                  >
                    {origin.name}
                  </button>
                );
              })
            )}
          </div>
        </FieldRow>
      ))}

      {selectedCount > 0 && (
        <div className="flex flex-row items-center gap-1">
          <SegmentedControl
            value={originBenefit ?? "discounted"}
            onChange={(v) => onBenefitChange(v as OriginBenefit)}
            options={[
              { value: "discounted", label: `Discounted for ${s}` },
              { value: "free", label: `Free for ${s}` },
              { value: "access", label: `Restricted to ${s}` },
            ]}
          />
          <Tip>
            <strong>Discounted for {s}:</strong> qualifying {s} halve this purchase's cost (or make it free if below the currency threshold).<br />
            <strong>Free for {s}:</strong> qualifying {s} always make this purchase free, regardless of cost.<br />
            <strong>Restricted to {s}:</strong> this purchase can only be made by characters holding a qualifying {s}; no price change.
          </Tip>
        </div>
      )}
    </>
  );
}
