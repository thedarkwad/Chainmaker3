/**
 * OriginCategorySection — one CollapsibleSection per non-singleLine origin category.
 * Rendered once per category by JumpDocEditor.
 */

import { memo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { RareFieldsGroup } from "./RareFieldsGroup";
import { CollapsibleSection } from "@/ui/CollapsibleSection";
import { TemplateCard } from "./TemplateCard";
import { DescriptionArea, BlurNumberInput, ChoiceContextEditor } from "./JumpDocFields";
import { CostDropdown } from "@/ui/CostDropdown";
import { CostModifier } from "@/chain/data/Purchase";
import type { SectionSharedProps } from "./sectionTypes";
import {
  useJumpDocOriginCategory,
  useJumpDocOriginIdsByCategory,
  useJumpDocOrigin,
  useModifyJumpDocOrigin,
  useAddJumpDocOrigin,
  useRemoveJumpDocOrigin,
  useRemoveBoundFromOrigin,
  useJumpDocCurrenciesRegistry,
  useJumpDocCurrencyIds,
  useJumpDocPurchaseSubtypeIdsSorted,
  useJumpDocPurchaseSubtype,
  useJumpDocOriginsGrouped,
} from "@/jumpdoc/state/hooks";
import type { Id } from "@/chain/data/types";
import { TID } from "@/chain/data/types";
import type { OriginStipendEntry } from "@/chain/data/JumpDoc";
import { OriginBenefitSection } from "./OriginBenefitSection";

// ─────────────────────────────────────────────────────────────────────────────
// Stipend pills
// ─────────────────────────────────────────────────────────────────────────────

function StipendPills({
  entries,
  onChange,
}: {
  entries: OriginStipendEntry[];
  onChange: (next: OriginStipendEntry[]) => void;
}) {
  const currencyIds = useJumpDocCurrencyIds();
  const currencies = useJumpDocCurrenciesRegistry();
  const subtypeIds = useJumpDocPurchaseSubtypeIdsSorted();

  const addEntry = () => {
    const firstCurrency = currencyIds[0];
    const firstSubtype = subtypeIds[0];
    if (firstCurrency === undefined || firstSubtype === undefined) return;
    onChange([...entries, { currency: firstCurrency, purchaseSubtype: firstSubtype, amount: 0 }]);
  };

  const removeEntry = (i: number) => {
    onChange(entries.filter((_, idx) => idx !== i));
  };

  const updateEntry = (i: number, patch: Partial<OriginStipendEntry>) => {
    onChange(entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  };

  const multiCurrency = currencyIds.length > 1;

  return (
    <div className="flex flex-col gap-1">
      {entries.map((entry, i) => (
        <div
          key={i}
          className="inline-flex w-fit items-center gap-0.5 rounded border border-accent bg-accent2-surface text-xs overflow-hidden"
        >
          {/* Amount */}
          <BlurNumberInput
            value={entry.amount}
            onCommit={(v) => updateEntry(i, { amount: v })}
            className="w-14 px-1 py-0.5 text-right bg-transparent border-none focus:outline-none text-xs"
          />
          {/* Currency — dropdown only when >1 option */}
          {multiCurrency ? (
            <select
              value={entry.currency as number}
              onChange={(e) =>
                updateEntry(i, { currency: Number(e.target.value) as Id<TID.Currency> })
              }
              className="px-1 py-0.5 bg-transparent border-none focus:outline-none text-xs text-default font-mono"
            >
              {currencyIds.map((cid) => (
                <option key={cid as number} value={cid as number}>
                  {currencies?.O[cid]?.abbrev ?? "?"}
                </option>
              ))}
            </select>
          ) : (
            <span className="px-1 text-muted">{currencies?.O[entry.currency]?.abbrev ?? "?"}</span>
          )}
          <span className="px-0.5 text-ghost">for</span>
          {/* Purchase subtype selector */}
          <select
            value={entry.purchaseSubtype}
            onChange={(e) =>
              updateEntry(i, { purchaseSubtype: Number(e.target.value) as Id<TID.PurchaseSubtype> })
            }
            className="px-1 py-0.5 bg-transparent border-none focus:outline-none text-xs text-default"
          >
            {subtypeIds.map((sid) => (
              <StipendPillOption key={sid} subtypeId={sid} />
            ))}
          </select>
          {/* Remove */}
          <button
            title="Remove stipend"
            onClick={() => removeEntry(i)}
            className="p-0.5 mr-0.5 text-ghost hover:text-red-400 transition-colors"
          >
            <X size={10} />
          </button>
        </div>
      ))}
      <button
        onClick={addEntry}
        disabled={currencyIds.length === 0 || subtypeIds.length === 0}
        className="inline-flex items-center gap-0.5 text-xs text-ghost hover:text-green-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Plus size={10} />
        Add Stipend
      </button>
    </div>
  );
}

/** Option element for a purchase subtype inside a <select>. */
function StipendPillOption({ subtypeId }: { subtypeId: Id<TID.PurchaseSubtype> }) {
  const sub = useJumpDocPurchaseSubtype(subtypeId);
  return <option value={subtypeId as number}>{sub?.name ?? "?"}</option>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section (one per non-singleLine origin category)
// ─────────────────────────────────────────────────────────────────────────────

export function OriginCategorySection({
  catId,
  open,
  forceOpenNonce,
  onAddBoundsRequest,
  addBoundsTarget,
  registerRef,
  activeScrollKey,
  singleId,
}: {
  catId: Id<TID.OriginCategory>;
  open?: boolean;
  forceOpenNonce?: number;
  singleId?: number;
} & SectionSharedProps<TID.Origin>) {
  const cat = useJumpDocOriginCategory(catId);
  const originIds = useJumpDocOriginIdsByCategory(catId);
  const addOrigin = useAddJumpDocOrigin();

  if (!cat) return null;

  const displayedIds = singleId !== undefined
    ? originIds.filter((id) => (id as number) === singleId)
    : originIds;

  return (
    <CollapsibleSection
      title={cat.name}
      defaultOpen
      open={singleId !== undefined ? true : open}
      forceOpenNonce={forceOpenNonce}
      styled
      action={
        singleId === undefined ? (
          <button
            title={`Add origin in ${cat.name}`}
            onClick={() => {
              addOrigin(undefined, catId);
            }}
            className="p-0.5 rounded text-ghost hover:text-green-400 hover:bg-green-400/10 transition-colors"
          >
            <Plus size={11} />
          </button>
        ) : undefined
      }
    >
      {displayedIds.length === 0 && (
        <p className="text-xs text-ghost italic px-1 py-1">No origins yet.</p>
      )}
      {displayedIds.map((id) => (
        <OriginCard
          key={id as number}
          id={id}
          addBoundsTarget={addBoundsTarget}
          registerRef={registerRef}
          isScrollTarget={activeScrollKey === `origin-${id as number}`}
          isAnyScrollTarget={activeScrollKey !== null}
          onAddBoundsRequest={onAddBoundsRequest}
        />
      ))}
    </CollapsibleSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OriginCard
// ─────────────────────────────────────────────────────────────────────────────

const OriginCard = memo(function OriginCard({
  id,
  addBoundsTarget,
  registerRef,
  isScrollTarget,
  isAnyScrollTarget,
  onAddBoundsRequest,
}: {
  id: Id<TID.Origin>;
  addBoundsTarget: SectionSharedProps<TID.Origin>["addBoundsTarget"];
  registerRef: SectionSharedProps<TID.Origin>["registerRef"];
  isScrollTarget: boolean;
  isAnyScrollTarget: boolean;
  onAddBoundsRequest: SectionSharedProps<TID.Origin>["onAddBoundsRequest"];
}) {
  const origin = useJumpDocOrigin(id);
  let synergyCats = useJumpDocOriginsGrouped().filter(({ catId }) => catId !== origin?.type);
  const modify = useModifyJumpDocOrigin(id);
  const removeOrigin = useRemoveJumpDocOrigin();
  const removeBound = useRemoveBoundFromOrigin();
  const currencies = useJumpDocCurrenciesRegistry();
  const currencyIds = useJumpDocCurrencyIds();
  const subtypeIds = useJumpDocPurchaseSubtypeIdsSorted();
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [showSynergySection, setShowSynergySection] = useState(!!(origin?.synergies?.length));
  if (!origin) return null;

  const key = `origin-${id}`;
  const fullCost = { modifier: CostModifier.Full } as const;
  const costAsValue = origin.cost.amount !== 0 ? [origin.cost] : [];


  return (
    <TemplateCard<TID.Origin>
      type={`origin-${origin.type}`}
      showTemplateTip
      id={id}
      name={origin.name}
      bounds={origin.bounds}
      addBoundsTarget={addBoundsTarget}
      isScrollTarget={isScrollTarget}
      isAnyScrollTarget={isAnyScrollTarget}
      cardRef={(el) => registerRef(key, el)}
      onNameCommit={(v) =>
        modify("Rename Origin", (t) => {
          t.name = v;
        })
      }
      onAddBound={() => onAddBoundsRequest(`origin-${origin.type}`, id)}
      onRemoveBound={(i) => removeBound(id, i)}
      onDelete={() => removeOrigin(id)}
      onBecomeScrollTarget={() => descriptionRef.current?.focus()}
      headerExtra={
        currencies && (
          <CostDropdown<TID.Currency>
            value={costAsValue}
            cost={fullCost}
            currencies={currencies}
            hideModifier
            onChange={(v) =>
              modify("Set Origin Cost", (t) => {
                t.cost = v[0] ?? { amount: 0, currency: t.cost.currency };
              })
            }
          />
        )
      }
    >
      <DescriptionArea
        value={origin.description ?? ""}
        onCommit={(v) =>
          modify("Set Origin Description", (t) => {
            t.description = v;
          })
        }
        textareaRef={descriptionRef}
      />
      <ChoiceContextEditor
        name={origin.name}
        description={origin.description ?? ""}
        choiceContext={origin.choiceContext}
        onCommit={(v) =>
          modify("Set Choice Context", (t) => {
            t.choiceContext = v;
          })
        }
      />
      <RareFieldsGroup
        fields={[
          {
            key: "stipend",
            isActive: !!(origin.originStipend?.length),
            dormant: () => (
              <button
                type="button"
                className="flex items-center gap-0.5 text-xs text-ghost hover:text-green-400 transition-colors"
                disabled={currencyIds.length === 0 || subtypeIds.length === 0}
                onClick={() => {
                  const firstCurrency = currencyIds[0];
                  const firstSubtype = subtypeIds[0];
                  if (firstCurrency === undefined || firstSubtype === undefined) return;
                  modify("Add Stipend", (t) => {
                    t.originStipend = [
                      ...(t.originStipend ?? []),
                      { currency: firstCurrency, purchaseSubtype: firstSubtype, amount: 0 },
                    ];
                  });
                }}
              >
                <Plus size={10} /> Add Stipend
              </button>
            ),
            active: () => (
              <div className="flex flex-col gap-1 pt-1.5 border-t border-line">
                <StipendPills
                  entries={origin.originStipend ?? []}
                  onChange={(next) =>
                    modify("Set Origin Stipend", (t) => {
                      t.originStipend = next.length > 0 ? next : undefined;
                    })
                  }
                />
              </div>
            ),
          },
          ...(synergyCats.length > 0
            ? [
                {
                  key: "synergy",
                  isActive: showSynergySection,
                  dormant: () => (
                    <button
                      type="button"
                      className="inline-flex items-center gap-0.5 text-xs text-ghost hover:text-accent2 transition-colors"
                      onClick={() => setShowSynergySection(true)}
                    >
                      <Plus size={10} /> Add Synergy with Other Origin(s)
                    </button>
                  ),
                  active: () => (
                    <div className="pt-1.5 border-t border-line">
                      <OriginBenefitSection
                        selectedOriginIds={new Set(origin.synergies ?? [])}
                        originBenefit={origin.synergyBenefit}
                        discountGroups={synergyCats}
                        onToggleOrigin={(oid, willBeSelected) =>
                          willBeSelected
                            ? modify("Add Origin to Purchase", (t) => {
                                if (!t.synergies) t.synergies = [];
                                t.synergies.push(oid);
                              })
                            : modify("Remove Origin from Purchase", (t) => {
                                if (!t.synergies) return;
                                t.synergies = t.synergies.filter((o) => o !== oid);
                              })
                        }
                        onBenefitChange={(v) =>
                          modify("Set Origin Benefit", (t) => {
                            t.synergyBenefit = v;
                          })
                        }
                      />
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
    </TemplateCard>
  );
});
