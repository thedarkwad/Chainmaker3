/**
 * AlternativeCostEditor — compact editor for alternative costs on purchases/drawbacks.
 * Each alternative cost has a value, a mandatory/optional flag, and a prerequisite list.
 */

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { CostDropdown } from "@/ui/CostDropdown";
import { CostModifier } from "@/chain/data/Purchase";
import { PickerModal, PickerGroup, PickerItem } from "./PickerModal";
import type { AlternativeCost, AlternativeCostPrerequisite } from "@/chain/data/JumpDoc";
import type { Id } from "@/chain/data/types";
import { TID } from "@/chain/data/types";
import {
  useJumpDocCurrenciesRegistry,
  useJumpDocFirstCurrencyId,
  useJumpDocPrerequisiteItems,
  useJumpDocOrigin,
  useJumpDocDrawback,
  useJumpDocPurchase,
} from "@/jumpdoc/state/hooks";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { Tip } from "@/ui/Tip";

// ─────────────────────────────────────────────────────────────────────────────
// AlternativeCostEditor
// ─────────────────────────────────────────────────────────────────────────────

export function AlternativeCostEditor({
  alternativeCosts,
  showDiscountToggle,
  onAdd,
  onRemove,
  onModify,
}: {
  alternativeCosts: AlternativeCost[] | undefined;
  showDiscountToggle?: boolean;
  onAdd: (cost: AlternativeCost) => void;
  onRemove: (index: number) => void;
  onModify: (index: number, updated: AlternativeCost) => void;
}) {
  const firstCurrencyId = useJumpDocFirstCurrencyId();
  const currencies = useJumpDocCurrenciesRegistry();
  const costs = alternativeCosts ?? [];

  function handleAdd() {
    onAdd({
      value: [{ amount: 0, currency: firstCurrencyId }],
      prerequisites: [],
      mandatory: false,
    });
  }

  return (
    <div className="flex flex-col gap-1.5 pt-1.5 border-t border-line">
      {costs.length > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-semibold text-ghost uppercase tracking-wider">
            Alternative Costs
          </span>
          <Tip>
            Do NOT use if the different costs have different effects, e.g. if a perk has an
            upgradabe version! In those cases create a duplicate annotation with the same bounding
            rectangle. <br />
            <br /> Go{" "}
            <a
              href="/guide#handling-user-choices"
              target="_blank"
              className="hover:underline text-accent2"
            >
              here
            </a>{" "}
            for more information.
          </Tip>
        </div>
      )}
      {costs.map((cost, i) => (
        <AltCostRow
          key={i}
          cost={cost}
          currencies={currencies}
          showDiscountToggle={showDiscountToggle}
          onRemove={() => onRemove(i)}
          onChange={(updated) => onModify(i, updated)}
        />
      ))}
      <button
        type="button"
        onClick={handleAdd}
        className="flex items-center gap-1 self-start text-xs text-ghost hover:text-accent transition-colors py-0.5 group"
      >
        <Plus size={8} />
        add alternative cost
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AltCostRow — one compact row per alternative cost entry
// ─────────────────────────────────────────────────────────────────────────────

function AltCostRow({
  cost,
  currencies,
  showDiscountToggle,
  onRemove,
  onChange,
}: {
  cost: AlternativeCost;
  currencies: ReturnType<typeof useJumpDocCurrenciesRegistry>;
  showDiscountToggle?: boolean;
  onRemove: () => void;
  onChange: (updated: AlternativeCost) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const fullCost = { modifier: CostModifier.Full } as const;

  function addPrereq(prereq: AlternativeCostPrerequisite) {
    onChange({ ...cost, prerequisites: [...cost.prerequisites, prereq] });
    setPickerOpen(false);
  }

  function removePrereq(index: number) {
    onChange({ ...cost, prerequisites: cost.prerequisites.filter((_, i) => i !== index) });
  }

  return (
    <div className="flex flex-col gap-1.5 bg-tint border border-edge rounded-md p-2 shadow-sm">
      {/* Top row: mandatory toggle + cost value + remove */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Cost value */}
        {currencies && (
          <CostDropdown<TID.Currency>
            value={cost.value}
            cost={fullCost}
            currencies={currencies}
            hideModifier
            onChange={(v) => onChange({ ...cost, value: v })}
          />
        )}
        {/* Mandatory / Optional segmented control — compact size */}
        <div className="scale-[0.85] origin-left shrink-0 -my-0.5">
          <SegmentedControl
            value={cost.mandatory ? "mandatory" : "optional"}
            onChange={(v) => onChange({ ...cost, mandatory: v === "mandatory" })}
            options={[
              { value: "optional", label: "User Choice" },
              { value: "mandatory", label: "Applies Automatically" },
            ]}
          />
        </div>
        {/* Discount interaction toggle — purchases and companions only */}
        {showDiscountToggle && (
          <div className="scale-[0.85] origin-left shrink-0 -my-0.5">
            <SegmentedControl
              value={cost.beforeDiscounts ? "stacks" : "overrides"}
              onChange={(v) => onChange({ ...cost, beforeDiscounts: v === "stacks" ? true : undefined })}
              options={[
                { value: "overrides", label: "Overrides discounts" },
                { value: "stacks", label: "Stacks with discounts" },
              ]}
            />
          </div>
        )}

        {/* Remove this whole alt cost */}
        <button
          type="button"
          onClick={onRemove}
          title="Remove alternative cost"
          className="ml-auto text-ghost hover:text-danger transition-colors p-0.5 shrink-0"
        >
          <X size={11} />
        </button>
      </div>

      {/* Prerequisites row */}
      <div className="flex items-center gap-1 flex-wrap min-h-5">
        <span className="text-[10px] text-muted shrink-0 font-medium">requires:</span>
        {cost.prerequisites.map((prereq, i) => (
          <PrereqChip key={i} prereq={prereq} onRemove={() => removePrereq(i)} />
        ))}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-dashed border-edge text-[10px] text-ghost hover:text-accent hover:border-accent/40 transition-colors"
        >
          <Plus size={9} /> prereq
        </button>
      </div>

      {pickerOpen && (
        <PrerequisitePickerModal onSelect={addPrereq} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PrereqChip — displays a single prerequisite with remove button
// ─────────────────────────────────────────────────────────────────────────────

export function PrereqChip({
  prereq,
  onRemove,
}: {
  prereq: AlternativeCostPrerequisite;
  onRemove: () => void;
}) {
  if (prereq.type === "origin") return <OriginPrereqChip id={prereq.id} onRemove={onRemove} />;
  if (prereq.type === "drawback") return <DrawbackPrereqChip id={prereq.id} onRemove={onRemove} />;
  return <PurchasePrereqChip id={prereq.id} onRemove={onRemove} />;
}

function OriginPrereqChip({ id, onRemove }: { id: Id<TID.Origin>; onRemove: () => void }) {
  const item = useJumpDocOrigin(id);
  return <ChipPill label="origin" name={item?.name ?? "(deleted)"} onRemove={onRemove} />;
}

function DrawbackPrereqChip({ id, onRemove }: { id: Id<TID.Drawback>; onRemove: () => void }) {
  const item = useJumpDocDrawback(id);
  return <ChipPill label="drawback" name={item?.name ?? "(deleted)"} onRemove={onRemove} />;
}

function PurchasePrereqChip({ id, onRemove }: { id: Id<TID.Purchase>; onRemove: () => void }) {
  const item = useJumpDocPurchase(id);
  return <ChipPill label="purchase" name={item?.name ?? "(deleted)"} onRemove={onRemove} />;
}

function ChipPill({
  label,
  name,
  onRemove,
}: {
  label: string;
  name: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-accent-tint border border-accent/25 text-[10px] text-accent max-w-56">
      <span className="text-muted shrink-0">{label}:</span>
      <span className="truncate">{name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 text-muted hover:text-danger transition-colors shrink-0"
      >
        <X size={9} />
      </button>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PrerequisitePickerModal
// ─────────────────────────────────────────────────────────────────────────────

export function PrerequisitePickerModal({
  title = "Add Prerequisite",
  onSelect,
  onClose,
}: {
  title?: string;
  onSelect: (prereq: AlternativeCostPrerequisite) => void;
  onClose: () => void;
}) {
  const { origins, drawbacks, purchases } = useJumpDocPrerequisiteItems();
  const [filter, setFilter] = useState("");
  const lc = filter.toLowerCase();

  const filteredOrigins = origins.filter((o) => o.name.toLowerCase().includes(lc));
  const filteredDrawbacks = drawbacks.filter((d) => d.name.toLowerCase().includes(lc));
  const filteredPurchases = purchases.filter((p) => p.name.toLowerCase().includes(lc));

  const isEmpty = origins.length === 0 && drawbacks.length === 0 && purchases.length === 0;
  const hasMatches =
    filteredOrigins.length > 0 || filteredDrawbacks.length > 0 || filteredPurchases.length > 0;

  // Group origins by category
  const originsByCategory = new Map<
    string,
    { categoryName: string; items: typeof filteredOrigins }
  >();
  for (const o of filteredOrigins) {
    const key = String(o.categoryId as number);
    if (!originsByCategory.has(key)) {
      originsByCategory.set(key, { categoryName: o.categoryName, items: [] });
    }
    originsByCategory.get(key)!.items.push(o);
  }

  // Group purchases by subtype
  const purchasesBySubtype = new Map<
    string,
    { subtypeName: string; items: typeof filteredPurchases }
  >();
  for (const p of filteredPurchases) {
    const key = String(p.subtypeId as number);
    if (!purchasesBySubtype.has(key)) {
      purchasesBySubtype.set(key, { subtypeName: p.subtypeName, items: [] });
    }
    purchasesBySubtype.get(key)!.items.push(p);
  }

  return (
    <PickerModal
      title={title}
      filter={filter}
      onFilterChange={setFilter}
      onClose={onClose}
    >
      {isEmpty && <p className="text-xs text-ghost px-1 py-1">No items defined yet.</p>}

      {filteredOrigins.length > 0 && (
        <PickerGroup label="Origins">
          {[...originsByCategory.entries()].map(([key, { categoryName, items }]) => (
            <div key={key}>
              {originsByCategory.size > 1 && (
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider px-1 pt-1 pb-0.5">
                  {categoryName}
                </p>
              )}
              {items.map((o) => (
                <PickerItem
                  key={o.id as number}
                  name={o.name}
                  subtitle={originsByCategory.size > 1 ? undefined : categoryName || undefined}
                  onClick={() => onSelect({ type: "origin", id: o.id })}
                />
              ))}
            </div>
          ))}
        </PickerGroup>
      )}

      {filteredDrawbacks.length > 0 && (
        <PickerGroup label="Drawbacks">
          {filteredDrawbacks.map((d) => (
            <PickerItem
              key={d.id as number}
              name={d.name}
              onClick={() => onSelect({ type: "drawback", id: d.id })}
            />
          ))}
        </PickerGroup>
      )}

      {filteredPurchases.length > 0 && (
        <PickerGroup label="Purchases">
          {[...purchasesBySubtype.entries()].map(([key, { subtypeName, items }]) => (
            <div key={key}>
              {purchasesBySubtype.size > 1 && (
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider px-1 pt-1 pb-0.5">
                  {subtypeName}
                </p>
              )}
              {items.map((p) => (
                <PickerItem
                  key={p.id as number}
                  name={p.name}
                  subtitle={purchasesBySubtype.size > 1 ? undefined : p.subtypeName || undefined}
                  onClick={() => onSelect({ type: "purchase", id: p.id })}
                />
              ))}
            </div>
          ))}
        </PickerGroup>
      )}

      {!isEmpty && !hasMatches && <p className="text-xs text-ghost px-1">No matches.</p>}
    </PickerModal>
  );
}
