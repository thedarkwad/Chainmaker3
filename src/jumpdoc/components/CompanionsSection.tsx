/**
 * CompanionsSection — list of companion-import templates in the JumpDoc editor.
 * Fields: name, description, cost, count, allowMultiple,
 * per-currency allowances, per-subtype stipend (with per-currency amounts).
 */

import { memo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { CollapsibleSection } from "@/ui/CollapsibleSection";
import { TemplateCard } from "./TemplateCard";
import { DescriptionArea, BlurNumberInput } from "./JumpDocFields";
import { OriginBenefitSection } from "./OriginBenefitSection";
import {
  AlternativeCostEditor,
  PrerequisitePickerModal,
  PrereqChip,
} from "./AlternativeCostEditor";
import { RareFieldsGroup } from "./RareFieldsGroup";
import type { AlternativeCostPrerequisite } from "@/chain/data/JumpDoc";
import { CostDropdown } from "@/ui/CostDropdown";
import { CostModifier } from "@/chain/data/Purchase";
import type { SectionSharedProps } from "./sectionTypes";
import {
  useJumpDocCompanionIds,
  useJumpDocCompanion,
  useModifyJumpDocCompanion,
  useAddJumpDocCompanion,
  useRemoveJumpDocCompanion,
  useRemoveBoundFromCompanion,
  useJumpDocCurrenciesRegistry,
  useJumpDocCurrencyIds,
  useJumpDocPurchaseSubtypeIdsSorted,
  useJumpDocPurchaseSubtype,
  useJumpDocDiscountOriginGroups,
  useJumpDocFirstCurrencyId,
} from "@/jumpdoc/state/hooks";
import type { Id } from "@/chain/data/types";
import { TID } from "@/chain/data/types";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { Tip } from "@/ui/Tip";

// ─────────────────────────────────────────────────────────────────────────────
// FreebiesEditor
// ─────────────────────────────────────────────────────────────────────────────

function FreebiesEditor({
  freebies,
  onAdd,
  onRemove,
}: {
  freebies: AlternativeCostPrerequisite[];
  onAdd: (item: AlternativeCostPrerequisite) => void;
  onRemove: (index: number) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1.5 pt-1.5 border-t border-line">
      <p className="text-[10px] font-semibold text-ghost uppercase tracking-wider">Freebies</p>
      <div className="flex items-center gap-1 flex-wrap">
        {freebies.map((freebie, i) => (
          <PrereqChip key={i} prereq={freebie} onRemove={() => onRemove(i)} />
        ))}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-dashed border-edge text-[10px] text-ghost hover:text-accent hover:border-accent/40 transition-colors"
        >
          <Plus size={9} /> add freebie
        </button>
      </div>
      {pickerOpen && (
        <PrerequisitePickerModal
          title="Add Freebie"
          onSelect={(item) => {
            onAdd(item);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Section header label — matches the "Customizable Fields" header pattern. */
function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[10px] font-semibold text-ghost uppercase tracking-wider">{children}</p>
  );
}

/** Compact [ABBREV | input] chip with accent2 companion accent. */
function CurrencyChip({
  abbrev,
  value,
  onCommit,
}: {
  abbrev: string;
  value: number;
  onCommit: (v: number) => void;
}) {
  return (
    <div className="inline-flex items-center rounded border border-accent2/30 overflow-hidden text-xs shrink-0 bg-accent2/5">
      <span className="px-1.5 py-0.5 text-accent2 font-mono font-semibold border-r border-accent2/20 bg-accent2/10">
        {abbrev}
      </span>
      <BlurNumberInput
        value={value}
        onCommit={onCommit}
        className="w-14 px-1.5 py-0.5 text-right bg-transparent border-none rounded-none focus:outline-none text-xs"
      />
    </div>
  );
}

/**
 * One subtype's cells in the stipend grid — returns a Fragment so its children
 * flow directly into the parent CSS grid (label cell + one input cell per currency).
 */
function StipendGridRow({
  subtypeId,
  currencyIds,
  getStipend,
  setStipend,
}: {
  subtypeId: Id<TID.PurchaseSubtype>;
  currencyIds: Id<TID.Currency>[];
  getStipend: (cid: Id<TID.Currency>, sid: Id<TID.PurchaseSubtype>) => number;
  setStipend: (cid: Id<TID.Currency>, sid: Id<TID.PurchaseSubtype>, v: number) => void;
}) {
  const sub = useJumpDocPurchaseSubtype(subtypeId);
  if (!sub) return null;
  return (
    <>
      <span className="text-xs text-muted py-0.5 leading-none text-right">{sub.name}:</span>
      {currencyIds.map((cid) => (
        <BlurNumberInput
          key={cid as number}
          value={getStipend(cid, subtypeId)}
          onCommit={(v) => setStipend(cid, subtypeId, v)}
          className="w-14 px-1.5 py-0.5 text-xs text-right"
        />
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section
// ─────────────────────────────────────────────────────────────────────────────

export function CompanionsSection({
  onAddBoundsRequest,
  addBoundsTarget,
  registerRef,
  activeScrollKey,
  open,
  forceOpenNonce,
  singleId,
}: SectionSharedProps<TID.Companion> & {
  open?: boolean;
  forceOpenNonce?: number;
  singleId?: number;
}) {
  const companionIds = useJumpDocCompanionIds();
  const addCompanion = useAddJumpDocCompanion();

  const displayedIds =
    singleId !== undefined
      ? companionIds.filter((id) => (id as number) === singleId)
      : companionIds;

  return (
    <CollapsibleSection
      title="Companion Imports"
      defaultOpen
      open={singleId !== undefined ? true : open}
      forceOpenNonce={forceOpenNonce}
      styled
      action={
        singleId === undefined ? (
          <button
            title="Add companion import"
            onClick={() => addCompanion()}
            className="p-0.5 rounded text-ghost hover:text-accent2 hover:bg-accent2/10 transition-colors"
          >
            <Plus size={11} />
          </button>
        ) : undefined
      }
    >
      {displayedIds.length === 0 && (
        <p className="text-xs text-ghost italic px-1 py-1">No companion imports yet.</p>
      )}
      {displayedIds.map((id) => (
        <CompanionCard
          key={id as number}
          id={id}
          addBoundsTarget={addBoundsTarget}
          registerRef={registerRef}
          isScrollTarget={activeScrollKey === `companion-${id as number}`}
          isAnyScrollTarget={activeScrollKey !== null}
          onAddBoundsRequest={onAddBoundsRequest}
        />
      ))}
    </CollapsibleSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CompanionCard
// ─────────────────────────────────────────────────────────────────────────────

const CompanionCard = memo(function CompanionCard({
  id,
  addBoundsTarget,
  registerRef,
  isScrollTarget,
  isAnyScrollTarget,
  onAddBoundsRequest,
}: {
  id: Id<TID.Companion>;
  addBoundsTarget: SectionSharedProps<TID.Companion>["addBoundsTarget"];
  registerRef: SectionSharedProps<TID.Companion>["registerRef"];
  isScrollTarget: boolean;
  isAnyScrollTarget: boolean;
  onAddBoundsRequest: SectionSharedProps<TID.Companion>["onAddBoundsRequest"];
}) {
  const companion = useJumpDocCompanion(id);
  const modify = useModifyJumpDocCompanion(id);
  const removeCompanion = useRemoveJumpDocCompanion();
  const removeBound = useRemoveBoundFromCompanion();
  const currencies = useJumpDocCurrenciesRegistry();
  const firstCurrencyId = useJumpDocFirstCurrencyId();
  const currencyIds = useJumpDocCurrencyIds();
  const [freebiePickerOpen, setFreebiePickerOpen] = useState(false);
  const subtypeIds = useJumpDocPurchaseSubtypeIdsSorted();
  const discountGroups = useJumpDocDiscountOriginGroups();
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  if (!companion) return null;

  const selectedOriginIds = new Set((companion.origins ?? []).map((o) => o));

  const key = `companion-${id as number}`;
  const fullCost = { modifier: CostModifier.Full } as const;

  const getAllowance = (cid: Id<TID.Currency>) => companion.allowances[cid] ?? 0;

  const setAllowance = (cid: Id<TID.Currency>, v: number) =>
    modify("Set Companion Allowance", (t) => {
      t.allowances[cid] = v;
    });

  const setSpecific = (b: boolean) =>
    modify("Set Companion Allowance", (t) => {
      t.specificCharacter = b;
    });

  const getStipend = (cid: Id<TID.Currency>, sid: Id<TID.PurchaseSubtype>) =>
    companion.stipend[cid]?.[sid] ?? 0;

  const setStipend = (cid: Id<TID.Currency>, sid: Id<TID.PurchaseSubtype>, v: number) =>
    modify("Set Companion Stipend", (t) => {
      const s = t.stipend;
      if (!s[cid]) s[cid] = {};
      s[cid][sid] = v;
    });

  const makeLength = <A,>(a: A[] | undefined, l: number, constructor: () => A) => {
    let pad = (n: number) => Array(n).map(constructor);
    a = a ?? [];
    if (l < a.length) return a.slice(0, l);
    else return a.concat(pad(l - a.length));
  };

  const con = () => ({
    name: "",
    species: "",
    gender: "",
  });

  return (
    <TemplateCard
      type="companion"
      color="#06b6d4"
      id={id}
      name={companion.name}
      bounds={companion.bounds}
      addBoundsTarget={addBoundsTarget}
      isScrollTarget={isScrollTarget}
      isAnyScrollTarget={isAnyScrollTarget}
      cardRef={(el) => registerRef(key, el)}
      onNameCommit={(v) =>
        modify("Rename Companion", (t) => {
          t.name = v;
        })
      }
      onAddBound={() => onAddBoundsRequest("companion", id)}
      onRemoveBound={(i) => removeBound(id, i)}
      onDelete={() => removeCompanion(id)}
      onBecomeScrollTarget={() => descriptionRef.current?.focus()}
      headerExtra={
        currencies && (
          <CostDropdown<TID.Currency>
            value={companion.cost}
            cost={fullCost}
            currencies={currencies}
            hideModifier
            onChange={(v) =>
              modify("Set Companion Cost", (t) => {
                t.cost = v;
              })
            }
          />
        )
      }
    >
      <DescriptionArea
        value={companion.description}
        onCommit={(v) =>
          modify("Set Companion Description", (t) => {
            t.description = v;
          })
        }
        textareaRef={descriptionRef}
      />
      <div className="flex flex-row justify-center gap-4 flex-wrap">
        <div className="flex flex-col items-center gap-2">
          <SectionLabel>Import Data</SectionLabel>
          <div className="flex flex-row flex-wrap gap-2">
            {currencyIds.length > 0 && (
              <div className="flex flex-col gap-1.5 w-fit p-2 items-center">
                <SectionLabel>Allowances</SectionLabel>
                {currencyIds.map((cid) => (
                  <CurrencyChip
                    key={cid}
                    abbrev={currencies?.O[cid]?.abbrev ?? "?"}
                    value={getAllowance(cid)}
                    onCommit={(v) => setAllowance(cid, v)}
                  />
                ))}
              </div>
            )}
            {subtypeIds.length > 0 && currencyIds.length > 0 && (
              <div className="flex flex-col gap-1.5 w-fit items-center bg-tint border border-edge rounded-sm p-2">
                <SectionLabel>Stipends</SectionLabel>
                <div
                  className="grid gap-x-2 gap-y-1 items-center"
                  style={{
                    gridTemplateColumns: `1fr ${currencyIds.map(() => "auto").join(" ")}`,
                  }}
                >
                  <div />
                  {currencyIds.map((cid) => (
                    <span
                      key={cid}
                      className="text-[10px] font-mono font-semibold text-accent2 text-center"
                    >
                      {currencies?.O[cid]?.abbrev ?? "?"}
                    </span>
                  ))}
                  {subtypeIds.map((sid) => (
                    <StipendGridRow
                      key={sid}
                      subtypeId={sid}
                      currencyIds={currencyIds}
                      getStipend={getStipend}
                      setStipend={setStipend}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          {/* Count pill */}
          <div className="flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-xs border border-accent2/30 bg-accent2/5 text-accent2 select-none">
            {companion.specificCharacter ? "Includes" : "Applies to"}
            <BlurNumberInput
              value={companion.count ?? 1}
              step={1}
              min={1}
              onCommit={(v) =>
                modify("Set Companion Count", (t) => {
                  const newCount = companion.specificCharacter
                    ? Math.min(Math.max(1, v), 10)
                    : Math.max(1, v);
                  t.characterInfo = makeLength(t.characterInfo, newCount, con);
                  t.count = newCount;
                })
              }
              className="w-8 text-xs text-center bg-transparent border-none rounded-none focus:outline-none px-0.5 py-0 text-accent2"
            />
            {companion.specificCharacter
              ? `character${(companion.count ?? 1) > 1 ? "s" : ""}`
              : "companions"}
          </div>

          {/* Specific / User Choice toggle */}
          <SegmentedControl
            value={companion.specificCharacter ? "specific" : "general"}
            onChange={(v) => setSpecific(v === "specific")}
            options={[
              { value: "specific", label: "Specific Character" },
              { value: "general", label: "User Choice" },
            ]}
          />

          {/* Character info inputs — only when specificCharacter */}
          {companion.specificCharacter && (
            <div className="inline-grid grid-cols-[auto_auto] max-w-fit items-center gap-2 mt-1">
              <span className="text-xs text-ghost col-span-full text-center">
                Leave any inapplicable fields blank.
              </span>
              {[...Array(companion.count ?? 1).keys()].map((i) => (
                <>
                  {i > 0 && <div className="my-1 border-b border-edge col-span-2" />}
                  {(["name", "species", "gender"] as const).map((field) => (
                    <>
                      <span className="text-[10px] font-semibold text-ghost uppercase tracking-wider text-right">
                        {field[0].toUpperCase()}
                        {field.slice(1)}:
                      </span>
                      <input
                        type="text"
                        defaultValue={companion.characterInfo?.[i]?.[field] ?? ""}
                        onBlur={(v) =>
                          modify("Set Companion Name", (t) => {
                            t.characterInfo = makeLength(t.characterInfo, t.count, con);
                            if (!t.characterInfo[i]) t.characterInfo[i] = con();
                            t.characterInfo[i][field] = v.currentTarget.value.trim();
                          })
                        }
                        className="w-40 text-xs text-ink bg-canvas border border-edge rounded px-2 py-1.5 focus:outline-none focus:border-accent-ring placeholder-ghost transition-colors"
                      />
                    </>
                  ))}
                </>
              ))}
            </div>
          )}
        </div>
      </div>
      <OriginBenefitSection
        selectedOriginIds={selectedOriginIds}
        originBenefit={companion.originBenefit}
        discountGroups={discountGroups}
        onToggleOrigin={(originId, willBeSelected) =>
          willBeSelected
            ? modify("Add Origin to Companion", (t) => {
                if (!t.origins) t.origins = [];
                t.origins.push(originId);
              })
            : modify("Remove Origin from Companion", (t) => {
                const filtered = (t.origins ?? []).filter((o) => o !== originId);
                t.origins = filtered;
                if (!filtered.length) t.originBenefit = undefined;
              })
        }
        onBenefitChange={(v) =>
          modify("Set Companion Origin Benefit", (t) => {
            t.originBenefit = v;
          })
        }
      />
      <RareFieldsGroup
        fields={[
          {
            key: "freebies",
            isActive: !!companion.freebies?.length,
            dormant: () => (
              <>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-ghost hover:text-accent transition-colors"
                  onClick={() => setFreebiePickerOpen(true)}
                >
                  <Plus size={8} /> add freebie
                </button>
                {freebiePickerOpen && (
                  <PrerequisitePickerModal
                    title="Add Freebie"
                    onSelect={(item) => {
                      modify("Add Companion Freebie", (t) => {
                        if (!t.freebies) t.freebies = [];
                        t.freebies.push(item);
                      });
                      setFreebiePickerOpen(false);
                    }}
                    onClose={() => setFreebiePickerOpen(false)}
                  />
                )}
              </>
            ),
            active: () => (
              <FreebiesEditor
                freebies={companion.freebies ?? []}
                onAdd={(item) =>
                  modify("Add Companion Freebie", (t) => {
                    if (!t.freebies) t.freebies = [];
                    t.freebies.push(item);
                  })
                }
                onRemove={(i) =>
                  modify("Remove Companion Freebie", (t) => {
                    t.freebies?.splice(i, 1);
                  })
                }
              />
            ),
          },
          {
            key: "altCosts",
            isActive: !!companion.alternativeCosts?.length,
            dormant: () => (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-ghost hover:text-accent transition-colors"
                onClick={() =>
                  modify("Add Companion Alternative Cost", (t) => {
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
                alternativeCosts={companion.alternativeCosts}
                onAdd={(cost) =>
                  modify("Add Companion Alternative Cost", (t) => {
                    if (!t.alternativeCosts) t.alternativeCosts = [];
                    t.alternativeCosts.push(cost);
                  })
                }
                onRemove={(i) =>
                  modify("Remove Companion Alternative Cost", (t) => {
                    t.alternativeCosts?.splice(i, 1);
                  })
                }
                onModify={(i, updated) =>
                  modify("Modify Companion Alternative Cost", (t) => {
                    if (t.alternativeCosts) t.alternativeCosts[i] = updated;
                  })
                }
              />
            ),
          },
        ]}
      />
    </TemplateCard>
  );
});
