/**
 * PurchaseSubtypeSection — one CollapsibleSection per purchase subtype.
 * Rendered once per subtype (perks first, then items) by JumpDocEditor.
 */

import { memo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { CollapsibleSection } from "@/ui/CollapsibleSection";
import { Checkbox } from "@/ui/Checkbox";
import { BoolSegment } from "@/ui/SegmentedControl";
import { OriginBenefitSection } from "./OriginBenefitSection";
import { TemplateCard } from "./TemplateCard";
import {
  DescriptionArea,
  BoostedEditor,
  ChoiceContextEditor,
  InternalTagsField,
} from "./JumpDocFields";
import { AlternativeCostEditor } from "./AlternativeCostEditor";
import { VariableCostEditor } from "./VariableCostEditor";
import { RareFieldsGroup } from "./RareFieldsGroup";
import { CostDropdown } from "@/ui/CostDropdown";
import type { SectionSharedProps } from "./sectionTypes";
import {
  useJumpDocPurchaseSubtype,
  useJumpDocPurchaseIdsBySubtype,
  useJumpDocPurchase,
  useJumpDocDrawback,
  useJumpDocScenario,
  useModifyJumpDocPurchase,
  useModifyJumpDocPurchaseSubtype,
  useAddJumpDocPurchase,
  useRemoveJumpDocPurchase,
  useRemoveBoundFromPurchase,
  useJumpDocCurrenciesRegistry,
  useJumpDocFirstCurrencyId,
  useJumpDocCapstoneBoosterItems,
  useJumpDocDiscountOriginGroups,
  useJumpDocPrerequisiteItems,
  useAddJumpDocPrereq,
  useRemoveJumpDocPrereq,
  type OriginGroup,
  useJumpDocOrigin,
  useDuplicateJumpDocPurchase,
  useJumpDocCompanion,
} from "@/jumpdoc/state/hooks";
import type { PurchasePrerequisite, VariableCost } from "@/chain/data/JumpDoc";
import { PickerModal, PickerGroup } from "./PickerModal";
import type { Id } from "@/chain/data/types";
import { TID } from "@/chain/data/types";
import { CostModifier, PurchaseType } from "@/chain/data/Purchase";

// ─────────────────────────────────────────────────────────────────────────────
// Section (one per purchase subtype)
// ─────────────────────────────────────────────────────────────────────────────

export function PurchaseSubtypeSection({
  subtypeId,
  open,
  forceOpenNonce,
  onAddBoundsRequest,
  addBoundsTarget,
  registerRef,
  activeScrollKey,
  singleId,
}: {
  subtypeId: Id<TID.PurchaseSubtype>;
  open?: boolean;
  forceOpenNonce?: number;
  singleId?: number;
} & SectionSharedProps<TID.Purchase>) {
  const sub = useJumpDocPurchaseSubtype(subtypeId);
  const modifySub = useModifyJumpDocPurchaseSubtype(subtypeId);
  const purchaseIds = useJumpDocPurchaseIdsBySubtype(subtypeId);
  const addPurchase = useAddJumpDocPurchase();
  const capstoneBoosterItems = useJumpDocCapstoneBoosterItems();
  const discountGroups = useJumpDocDiscountOriginGroups();
  const currencies = useJumpDocCurrenciesRegistry();

  if (!sub) return null;

  const toolKey = `purchase-${subtypeId}`;
  const color = sub.type === PurchaseType.Perk ? "#38bdf8" : "#f59e0b";

  const displayedIds =
    singleId !== undefined
      ? purchaseIds.filter(id => (id as number) === singleId)
      : purchaseIds;

  return (
    <CollapsibleSection
      title={sub.name}
      defaultOpen
      open={singleId !== undefined ? true : open}
      forceOpenNonce={forceOpenNonce}
      styled
      action={
        singleId === undefined ? (
          <button
            title={`Add ${sub.name}`}
            onClick={() => addPurchase(subtypeId)}
            className="p-0.5 rounded text-ghost hover:text-accent hover:bg-accent/10 transition-colors"
          >
            <Plus size={11} />
          </button>
        ) : undefined
      }
    >
      {singleId === undefined && currencies && (
        <div className="flex items-center justify-center gap-2 px-1 pb-1">
          <span className="text-xs text-muted shrink-0">Stipend:</span>
          <CostDropdown<TID.Currency>
            value={sub.stipend}
            cost={{ modifier: CostModifier.Full }}
            currencies={currencies}
            hideModifier
            defaultCurrency={sub.defaultCurrency}
            freeLabel="None"
            onChange={v =>
              modifySub("Set Stipend", s => {
                s.stipend = v;
              })
            }
          />
        </div>
      )}
      {displayedIds.length === 0 && (
        <p className="text-xs text-ghost italic px-1 py-1">No entries yet.</p>
      )}
      {displayedIds.map(id => (
        <PurchaseCard
          key={id}
          id={id}
          toolKey={toolKey}
          color={color}
          addBoundsTarget={addBoundsTarget}
          registerRef={registerRef}
          isScrollTarget={activeScrollKey === `purchase-${id as number}`}
          isAnyScrollTarget={activeScrollKey !== null}
          onAddBoundsRequest={onAddBoundsRequest}
          capstoneBoosterItems={capstoneBoosterItems}
          discountGroups={discountGroups}
          defaultCurrency={sub.defaultCurrency}
        />
      ))}
    </CollapsibleSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PurchaseCard
// ─────────────────────────────────────────────────────────────────────────────

const PurchaseCard = memo(function PurchaseCard({
  id,
  toolKey,
  color,
  addBoundsTarget,
  registerRef,
  isScrollTarget,
  isAnyScrollTarget,
  onAddBoundsRequest,
  capstoneBoosterItems,
  discountGroups,
  defaultCurrency,
}: {
  id: Id<TID.Purchase>;
  toolKey: string;
  color: string;
  addBoundsTarget: SectionSharedProps<TID.Purchase>["addBoundsTarget"];
  registerRef: SectionSharedProps<TID.Purchase>["registerRef"];
  isScrollTarget: boolean;
  isAnyScrollTarget: boolean;
  onAddBoundsRequest: SectionSharedProps<TID.Purchase>["onAddBoundsRequest"];
  capstoneBoosterItems: {
    id: number;
    name: string;
    kind: "purchase" | "drawback";
  }[];
  discountGroups: OriginGroup[];
  defaultCurrency?: Id<TID.Currency>;
}) {
  const purchase = useJumpDocPurchase(id);
  const modify = useModifyJumpDocPurchase(id);
  const removePurchase = useRemoveJumpDocPurchase();
  const duplicatePurchase = useDuplicateJumpDocPurchase();
  const removeBound = useRemoveBoundFromPurchase();
  const addPrereq = useAddJumpDocPrereq("purchase", id);
  const removePrereq = useRemoveJumpDocPrereq("purchase", id);
  const currencies = useJumpDocCurrenciesRegistry();
  const firstCurrencyId = useJumpDocFirstCurrencyId();
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [prereqPickerOpen, setPrereqPickerOpen] = useState(false);
  const [showBoost, setShowBoost] = useState(false);
  if (!purchase) return null;

  // Exclude this purchase from its own booster list.
  const availableBoosterItems = capstoneBoosterItems.filter(
    b => !(b.kind === "purchase" && b.id === id),
  );

  const key = `purchase-${id}`;
  const fullCost = { modifier: CostModifier.Full } as const;

  const selectedOriginIds = new Set(purchase.origins ?? []);
  const selectedDiscountOrigins = discountGroups
    .flatMap(g => g.origins)
    .filter(o => selectedOriginIds.has(o.id));

  return (
    <TemplateCard
      type={toolKey}
      showTemplateTip
      color={color}
      id={id}
      name={purchase.name}
      bounds={purchase.bounds}
      addBoundsTarget={addBoundsTarget}
      isScrollTarget={isScrollTarget}
      isAnyScrollTarget={isAnyScrollTarget}
      cardRef={el => registerRef(key, el)}
      onNameCommit={v =>
        modify("Rename Purchase", t => {
          t.name = v;
        })
      }
      onDuplicate={() => duplicatePurchase(id)}
      onAddBound={() => onAddBoundsRequest(toolKey, id)}
      onRemoveBound={i => removeBound(id, i)}
      onDelete={() => removePurchase(id)}
      onBecomeScrollTarget={() => descriptionRef.current?.focus()}
      headerExtra={
        <div className="flex items-center gap-1 shrink-0">
          {currencies && Array.isArray(purchase.cost) && (
            <CostDropdown<TID.Currency>
              value={purchase.cost}
              cost={fullCost}
              currencies={currencies}
              hideModifier
              defaultCurrency={defaultCurrency}
              onChange={v =>
                modify("Set Purchase Cost", t => {
                  t.cost = v;
                })
              }
            />
          )}
          {!Array.isArray(purchase.cost) && (
            <span className="text-xs text-muted mx-1">Variable Value</span>
          )}
          {discountGroups.length > 0 &&
            (selectedDiscountOrigins.length === 0 ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 whitespace-nowrap">
                Undiscounted
              </span>
            ) : selectedDiscountOrigins.length <= 2 ? (
              selectedDiscountOrigins.map(o => (
                <span
                  key={o.id}
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap"
                >
                  {o.name}
                </span>
              ))
            ) : (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                Multi-Origin
              </span>
            ))}
        </div>
      }
    >
      <DescriptionArea
        value={purchase.description}
        onCommit={v =>
          modify("Set Purchase Description", t => {
            t.description = v;
          })
        }
        textareaRef={descriptionRef}
      />

      <ChoiceContextEditor
        name={purchase.name}
        description={purchase.description}
        cost={Array.isArray(purchase.cost) ? undefined : purchase.cost}
        choiceContext={purchase.choiceContext}
        onCommit={v =>
          modify("Set Choice Context", t => {
            t.choiceContext = v;
          })
        }
      />

      {/* Per-category discount origin pills + benefit control */}
      <OriginBenefitSection
        selectedOriginIds={selectedOriginIds}
        originBenefit={purchase.originBenefit}
        discountGroups={discountGroups}
        onToggleOrigin={(id, willBeSelected) =>
          willBeSelected
            ? modify("Add Origin to Purchase", t => {
                if (!t.origins) t.origins = [];
                t.origins.push(id);
              })
            : modify("Remove Origin from Purchase", t => {
                if (!t.origins) t.origins = [];

                t.origins = t.origins.filter(o => o !== id);
                if (t.origins.length === 0) t.originBenefit = undefined;
              })
        }
        onBenefitChange={v =>
          modify("Set Origin Benefit", t => {
            t.originBenefit = v;
          })
        }
      />

      {/* Duration segmented control */}
      <BoolSegment
        value={purchase.temporary}
        onChange={v =>
          modify("Set Temporary", t => {
            t.temporary = v;
          })
        }
        falseLabel="Permanent"
        trueLabel="Expires at end of jump"
      />

      {/* Checkbox row: Capstone Booster · Allow Multiple */}
      <div className="flex items-center gap-4 flex-wrap">
        <Checkbox
          checked={purchase.capstoneBooster}
          onChange={v =>
            modify("Toggle Capstone Booster", t => {
              t.capstoneBooster = v;
            })
          }
        >
          Capstone Booster or Combo Trigger
        </Checkbox>
        <Checkbox
          checked={purchase.allowMultiple}
          onChange={v =>
            modify("Toggle Allow Multiple", t => {
              t.allowMultiple = v;
            })
          }
        >
          Can Be Taken Multiple Times
        </Checkbox>
      </div>

      <RareFieldsGroup
        fields={[
          {
            key: "variableCost",
            isActive: !Array.isArray(purchase.cost),
            dormant: () => (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-ghost hover:text-accent transition-colors"
                onClick={() =>
                  modify("Enable Variable Cost", t => {
                    t.cost = { [defaultCurrency ?? firstCurrencyId]: "" } as VariableCost;
                  })
                }
              >
                use variable cost
              </button>
            ),
            active: () => (
              <div className="pt-1.5 border-t border-line">
                <VariableCostEditor
                  value={purchase.cost as VariableCost}
                  onCommit={(name, updated) => modify(name, t => { t.cost = updated; })}
                  onRemove={() => modify("Disable Variable Cost", t => { t.cost = []; })}
                />
              </div>
            ),
          },
          ...(availableBoosterItems.length > 0
            ? [
                {
                  key: "boost",
                  isActive: purchase.boosted.length > 0 || showBoost,
                  dormant: () => (
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-ghost hover:text-accent transition-colors"
                      onClick={() => setShowBoost(true)}
                    >
                      <Plus size={8} /> add boost
                    </button>
                  ),
                  active: () => (
                    <div className="pt-1.5 border-t border-line">
                      <BoostedEditor
                        boosted={purchase.boosted}
                        capstoneBoosterItems={availableBoosterItems}
                        onAdd={(boosterId, boosterKind) =>
                          modify("Add Boosted Version", t => {
                            t.boosted.push({
                              description: "",
                              booster: boosterId,
                              boosterKind,
                            });
                          })
                        }
                        onRemove={boosterId =>
                          modify("Remove Boosted Version", t => {
                            t.boosted = t.boosted.filter(
                              b => b.booster !== boosterId,
                            );
                          })
                        }
                        onCommitDescription={(boosterId, desc) =>
                          modify("Set Boosted Description", t => {
                            const entry = t.boosted.find(
                              b => b.booster === boosterId,
                            );
                            if (entry) entry.description = desc;
                          })
                        }
                      />
                    </div>
                  ),
                },
              ]
            : []),
          {
            key: "altCosts",
            isActive: !!purchase.alternativeCosts?.length,
            dormant: () => (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-ghost hover:text-accent transition-colors"
                onClick={() =>
                  modify("Add Alternative Cost", t => {
                    if (!t.alternativeCosts) t.alternativeCosts = [];
                    t.alternativeCosts.push({
                      value: [{ amount: 0, currency: firstCurrencyId }],
                      prerequisites: [],
                      mandatory: false,
                    });
                  })
                }
              >
                <Plus size={8} /> add alternative cost
              </button>
            ),
            active: () => (
              <AlternativeCostEditor
                alternativeCosts={purchase.alternativeCosts}
                showDiscountToggle
                onAdd={cost =>
                  modify("Add Alternative Cost", t => {
                    if (!t.alternativeCosts) t.alternativeCosts = [];
                    t.alternativeCosts.push(cost);
                  })
                }
                onRemove={i =>
                  modify("Remove Alternative Cost", t => {
                    t.alternativeCosts?.splice(i, 1);
                  })
                }
                onModify={(i, updated) =>
                  modify("Update Alternative Cost", t => {
                    if (t.alternativeCosts) t.alternativeCosts[i] = updated;
                  })
                }
              />
            ),
          },
          {
            key: "prereqs",
            isActive: !!purchase.prerequisites?.length,
            dormant: () => (
              <>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-ghost hover:text-accent transition-colors"
                  onClick={() => setPrereqPickerOpen(true)}
                >
                  <Plus size={8} /> add prerequisite
                </button>
                {prereqPickerOpen && (
                  <PurchasePrerequisitePickerModal
                    onSelect={prereq => {
                      addPrereq(prereq);
                      setPrereqPickerOpen(false);
                    }}
                    onClose={() => setPrereqPickerOpen(false)}
                  />
                )}
              </>
            ),
            active: () => (
              <PurchasePrerequisiteEditor
                prerequisites={purchase.prerequisites}
                onAdd={addPrereq}
                onRemove={removePrereq}
              />
            ),
          },
          {
            key: "internalTags",
            isActive: purchase.internalTags !== undefined,
            dormant: () => (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-ghost hover:text-accent transition-colors"
                onClick={() => modify("Add Internal Tags", t => { t.internalTags = []; })}
              >
                <Plus size={8} /> add internal tag
              </button>
            ),
            active: () => (
              <InternalTagsField
                tags={purchase.internalTags!}
                onChange={tags => modify("Edit Internal Tags", t => { t.internalTags = tags; })}
                onUndefined={() => modify("Remove Internal Tags", t => { t.internalTags = undefined; })}
              />
            ),
          },
        ]}
      />
    </TemplateCard>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Purchase prerequisites editor
// ─────────────────────────────────────────────────────────────────────────────

export function PurchasePrerequisiteEditor({
  prerequisites,
  onAdd,
  onRemove,
}: {
  prerequisites: PurchasePrerequisite[] | undefined;
  onAdd: (prereq: PurchasePrerequisite) => void;
  onRemove: (index: number) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const list = prerequisites ?? [];

  return (
    <div className="flex flex-col gap-1.5 pt-1.5 border-t border-line">
      {list.length > 0 && (
        <>
          <p className="text-[10px] font-semibold text-ghost uppercase tracking-wider">
            Prerequisites
          </p>
          <div className="flex flex-col gap-1">
            {list.map((prereq, i) => (
              <PurchasePrereqChip
                key={i}
                prereq={prereq}
                onRemove={() => onRemove(i)}
              />
            ))}
          </div>
        </>
      )}
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="self-start text-xs text-ghost hover:text-accent transition-colors py-0.5 group flex items-center gap-1"
      >
        <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full">
          <Plus size={8} />
        </span>
        add prerequisite / incompatibility
      </button>
      {pickerOpen && (
        <PurchasePrerequisitePickerModal
          onSelect={prereq => {
            onAdd(prereq);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

function PurchasePrereqChip({
  prereq,
  onRemove,
}: {
  prereq: PurchasePrerequisite;
  onRemove: () => void;
}) {
  if (prereq.type === "purchase")
    return (
      <PurchasePrereqChipInner
        id={prereq.id}
        positive={prereq.positive}
        label="purchase"
        onRemove={onRemove}
      />
    );
  if (prereq.type === "scenario")
    return (
      <ScenarioPrereqChipInner
        id={prereq.id}
        positive={prereq.positive}
        label="scenario"
        onRemove={onRemove}
      />
    );
  if (prereq.type === "drawback")
    return (
      <DrawbackPrereqChipInner
        id={prereq.id}
        positive={prereq.positive}
        label="drawback"
        onRemove={onRemove}
      />
    );
  if (prereq.type === "companion")
    return (
      <CompanionPrereqChipInner
        id={prereq.id}
        positive={prereq.positive}
        label="companion"
        onRemove={onRemove}
      />
    );

  else
    return (
      <OriginPrereqChipInner
        id={prereq.id}
        positive={prereq.positive}
        label="origin"
        onRemove={onRemove}
      />
    );
}

function PurchasePrereqChipInner({
  id,
  positive,
  label,
  onRemove,
}: {
  id: Id<TID.Purchase>;
  positive: boolean;
  label: string;
  onRemove: () => void;
}) {
  const item = useJumpDocPurchase(id);
  return (
    <PrereqChipPill
      name={item?.name ?? "(deleted)"}
      label={label}
      positive={positive}
      onRemove={onRemove}
    />
  );
}

function DrawbackPrereqChipInner({
  id,
  positive,
  label,
  onRemove,
}: {
  id: Id<TID.Drawback>;
  positive: boolean;
  label: string;
  onRemove: () => void;
}) {
  const item = useJumpDocDrawback(id);
  return (
    <PrereqChipPill
      name={item?.name ?? "(deleted)"}
      label={label}
      positive={positive}
      onRemove={onRemove}
    />
  );
}

function CompanionPrereqChipInner({
  id,
  positive,
  label,
  onRemove,
}: {
  id: Id<TID.Companion>;
  positive: boolean;
  label: string;
  onRemove: () => void;
}) {
  const item = useJumpDocCompanion(id);
  return (
    <PrereqChipPill
      name={item?.name ?? "(deleted)"}
      label={label}
      positive={positive}
      onRemove={onRemove}
    />
  );
}


function OriginPrereqChipInner({
  id,
  positive,
  label,
  onRemove,
}: {
  id: Id<TID.Origin>;
  positive: boolean;
  label: string;
  onRemove: () => void;
}) {
  const item = useJumpDocOrigin(id);
  return (
    <PrereqChipPill
      name={item?.name ?? "(deleted)"}
      label={label}
      positive={positive}
      onRemove={onRemove}
    />
  );
}

function ScenarioPrereqChipInner({
  id,
  positive,
  label,
  onRemove,
}: {
  id: Id<TID.Scenario>;
  positive: boolean;
  label: string;
  onRemove: () => void;
}) {
  const item = useJumpDocScenario(id);
  return (
    <PrereqChipPill
      name={item?.name ?? "(deleted)"}
      label={label}
      positive={positive}
      onRemove={onRemove}
    />
  );
}

function PrereqChipPill({
  name,
  label,
  positive,
  onRemove,
}: {
  name: string;
  label: string;
  positive: boolean;
  onRemove: () => void;
}) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] max-w-full ${
        positive
          ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
          : "bg-red-500/10 border-red-500/25 text-red-400"
      }`}
    >
      <span className="font-bold shrink-0">{positive ? "+" : "−"}</span>
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

export function PurchasePrerequisitePickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (prereq: PurchasePrerequisite) => void;
  onClose: () => void;
}) {
  const { origins, drawbacks, purchases, scenarios, companions } =
    useJumpDocPrerequisiteItems();
  const [filter, setFilter] = useState("");
  const lc = filter.toLowerCase();

  const filteredOrigins = origins.filter(o =>
    o.name.toLowerCase().includes(lc),
  );
  const filteredDrawbacks = drawbacks.filter(d =>
    d.name.toLowerCase().includes(lc),
  );
  const filteredPurchases = purchases.filter(p =>
    p.name.toLowerCase().includes(lc),
  );
  const filteredScenarios = scenarios.filter(s =>
    s.name.toLowerCase().includes(lc),
  );
    const filteredCompanions = companions.filter(s =>
    s.name.toLowerCase().includes(lc),
  );


  const purchasesBySubtype = new Map<
    string,
    { subtypeName: string; items: typeof filteredPurchases }
  >();
  for (const p of filteredPurchases) {
    const key = String(p.subtypeId as number);
    if (!purchasesBySubtype.has(key))
      purchasesBySubtype.set(key, { subtypeName: p.subtypeName, items: [] });
    purchasesBySubtype.get(key)!.items.push(p);
  }

  const originsByCategory = new Map<
    string,
    { categoryName: string; items: typeof filteredOrigins }
  >();
  for (const o of filteredOrigins) {
    const key = String(o.categoryId as number);
    if (!originsByCategory.has(key))
      originsByCategory.set(key, { categoryName: o.categoryName, items: [] });
    originsByCategory.get(key)!.items.push(o);
  }

  const isEmpty =
    origins.length === 0 &&
    drawbacks.length === 0 &&
    purchases.length === 0 &&
    scenarios.length === 0;
  const hasMatches =
    filteredOrigins.length > 0 ||
    filteredDrawbacks.length > 0 ||
    filteredPurchases.length > 0 ||
    filteredScenarios.length > 0;

  function twoActionRow(
    name: string,
    onRequires: () => void,
    onIncompatible: () => void,
  ) {
    return (
      <div className="flex items-center gap-1 px-1 py-1 rounded hover:bg-tint transition-colors">
        <span className="text-sm text-ink flex-1 truncate">
          {name || "(unnamed)"}
        </span>
        <button
          type="button"
          onClick={onRequires}
          className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
        >
          Requires
        </button>
        <button
          type="button"
          onClick={onIncompatible}
          className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
        >
          Incompatible
        </button>
      </div>
    );
  }

  return (
    <PickerModal
      title="Add Prerequisite / Incompatibility"
      filter={filter}
      onFilterChange={setFilter}
      onClose={onClose}
    >
      {isEmpty && (
        <p className="text-xs text-ghost px-1 py-1">No items defined yet.</p>
      )}

      {filteredOrigins.length > 0 && (
        <PickerGroup label="Origins">
          {[...originsByCategory.entries()].map(
            ([key, { categoryName, items }]) => (
              <div key={key}>
                {originsByCategory.size > 1 && (
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wider px-1 pt-1 pb-0.5">
                    {categoryName}
                  </p>
                )}
                {items.map(o =>
                  twoActionRow(
                    o.name,
                    () =>
                      onSelect({ type: "origin", id: o.id, positive: true }),
                    () =>
                      onSelect({ type: "origin", id: o.id, positive: false }),
                  ),
                )}
              </div>
            ),
          )}
        </PickerGroup>
      )}

      {filteredDrawbacks.length > 0 && (
        <PickerGroup label="Drawbacks">
          {filteredDrawbacks.map(d =>
            twoActionRow(
              d.name,
              () => onSelect({ type: "drawback", id: d.id, positive: true }),
              () => onSelect({ type: "drawback", id: d.id, positive: false }),
            ),
          )}
        </PickerGroup>
      )}

      {filteredPurchases.length > 0 && (
        <PickerGroup label="Purchases">
          {[...purchasesBySubtype.entries()].map(
            ([key, { subtypeName, items }]) => (
              <div key={key}>
                {purchasesBySubtype.size > 1 && (
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wider px-1 pt-1 pb-0.5">
                    {subtypeName}
                  </p>
                )}
                {items.map(p =>
                  twoActionRow(
                    p.name,
                    () =>
                      onSelect({ type: "purchase", id: p.id, positive: true }),
                    () =>
                      onSelect({ type: "purchase", id: p.id, positive: false }),
                  ),
                )}
              </div>
            ),
          )}
        </PickerGroup>
      )}

      {filteredScenarios.length > 0 && (
        <PickerGroup label="Scenarios">
          {filteredScenarios.map(s =>
            twoActionRow(
              s.name,
              () => onSelect({ type: "scenario", id: s.id, positive: true }),
              () => onSelect({ type: "scenario", id: s.id, positive: false }),
            ),
          )}
        </PickerGroup>
      )}

      {filteredCompanions.length > 0 && (
        <PickerGroup label="Companions">
          {filteredCompanions.map(s =>
            twoActionRow(
              s.name,
              () => onSelect({ type: "companion", id: s.id, positive: true }),
              () => onSelect({ type: "companion", id: s.id, positive: false }),
            ),
          )}
        </PickerGroup>
      )}


      {!isEmpty && !hasMatches && (
        <p className="text-xs text-ghost px-1">No matches.</p>
      )}
    </PickerModal>
  );
}
